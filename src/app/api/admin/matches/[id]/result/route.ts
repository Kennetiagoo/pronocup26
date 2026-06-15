import { MatchStatus } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { calculatePointsFromSnapshot, calculateScorerHits } from "@/lib/bonus";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateMatchResultSchema } from "@/lib/validation";
import { computeKnockoutAssignments } from "@/lib/world-cup-knockout";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateMatchResultSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos invalidos.");
    }

    if (parsed.data.status !== MatchStatus.SCHEDULED) {
      if (parsed.data.homeScore === null || parsed.data.awayScore === null) {
        throw new ApiError(
          422,
          "UNPROCESSABLE",
          "Para dejar un partido EN VIVO o FINAL debes registrar ambos marcadores.",
        );
      }
    }

    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) {
      throw new ApiError(404, "NOT_FOUND", "Partido no encontrado.");
    }
    const updatedMatch = await prisma.match.update({
      where: { id },
      data: {
        homeScore: parsed.data.homeScore,
        awayScore: parsed.data.awayScore,
        ...(typeof parsed.data.homeTeam === "string" ? { homeTeam: parsed.data.homeTeam } : {}),
        ...(typeof parsed.data.awayTeam === "string" ? { awayTeam: parsed.data.awayTeam } : {}),
        ...(typeof parsed.data.homeTeamCode !== "undefined" ? { homeTeamCode: parsed.data.homeTeamCode } : {}),
        ...(typeof parsed.data.awayTeamCode !== "undefined" ? { awayTeamCode: parsed.data.awayTeamCode } : {}),
        status: parsed.data.status,
        updatedAt: new Date(),
      },
    });

    const rule = await prisma.scoringRule.findUnique({ where: { id: 1 } });
    if (!rule) {
      throw new ApiError(500, "INTERNAL_ERROR", "No existe configuración de puntaje.");
    }

    const [predictions, officialScorers] = await Promise.all([
      prisma.prediction.findMany({
        where: { matchId: id },
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          usedX2: true,
          x2Returned: true,
          topApplied: true,
          appliedMultiplier: true,
          scorerPointApplied: true,
          scorerPicks: {
            select: {
              teamSide: true,
              playerId: true,
            },
          },
        },
      }),
      prisma.matchOfficialScorer.findMany({
        where: { matchId: id },
        select: {
          teamSide: true,
          playerId: true,
        },
      }),
    ]);

    const shouldRecalculate =
      updatedMatch.status === MatchStatus.FINAL &&
      updatedMatch.homeScore !== null &&
      updatedMatch.awayScore !== null;

    const predictionUpdates = updatedMatch.status === MatchStatus.LIVE ? [] : predictions.map((prediction) => {
        if (!shouldRecalculate) {
          return prisma.prediction.update({
            where: { id: prediction.id },
            data: {
              points: 0,
              basePoints: 0,
              bonusPoints: 0,
              scorerPoints: 0,
              x2Returned: false,
              updatedAt: new Date(),
            },
          });
        }

        const scorerHitCount = calculateScorerHits(prediction.scorerPicks, officialScorers);
        const calculated = calculatePointsFromSnapshot({
          prediction: {
            homeScore: prediction.homeScore,
            awayScore: prediction.awayScore,
          },
          official: {
            homeScore: updatedMatch.homeScore as number,
            awayScore: updatedMatch.awayScore as number,
          },
          rule,
          stage: updatedMatch.stage,
          snapshot: {
            usedX2: prediction.usedX2,
            x2Returned: prediction.x2Returned,
            topApplied: false,
            appliedMultiplier: prediction.usedX2 ? 2 : 1,
            scorerPointApplied: prediction.scorerPointApplied,
          },
          scorerHitCount,
        });

        return prisma.prediction.update({
          where: { id: prediction.id },
          data: {
            points: calculated.totalPoints,
            basePoints: calculated.basePoints,
            bonusPoints: calculated.bonusPoints,
            scorerPoints: calculated.scorerPoints,
            x2Returned: calculated.x2Returned,
            topApplied: false,
            appliedMultiplier: prediction.usedX2 ? 2 : 1,
            updatedAt: new Date(),
          },
        });
      });

    if (predictionUpdates.length > 0) {
      await prisma.$transaction(predictionUpdates);
    }

    const allMatches = await prisma.match.findMany({
      orderBy: [{ matchNumber: "asc" }],
      select: {
        id: true,
        matchNumber: true,
        stage: true,
        groupName: true,
        homeTeam: true,
        awayTeam: true,
        homeTeamCode: true,
        awayTeamCode: true,
        homeScore: true,
        awayScore: true,
        status: true,
      },
    });

    const knockoutAssignments = computeKnockoutAssignments(allMatches);
    const assignmentUpdates = [] as Array<ReturnType<typeof prisma.match.update>>;
    for (const [matchNumber, assignment] of knockoutAssignments.entries()) {
      if (matchNumber <= 88 || updatedMatch.status !== MatchStatus.FINAL) continue;
      const current = allMatches.find((m) => m.matchNumber === matchNumber);
      if (!current) continue;

      const changed =
        current.homeTeam !== assignment.homeTeam ||
        current.awayTeam !== assignment.awayTeam ||
        current.homeTeamCode !== assignment.homeTeamCode ||
        current.awayTeamCode !== assignment.awayTeamCode;

      if (!changed) continue;

      assignmentUpdates.push(
        prisma.match.update({
          where: { id: current.id },
          data: {
            homeTeam: assignment.homeTeam,
            awayTeam: assignment.awayTeam,
            homeTeamCode: assignment.homeTeamCode,
            awayTeamCode: assignment.awayTeamCode,
            updatedAt: new Date(),
          },
        }),
      );
    }

    if (assignmentUpdates.length > 0) {
      await prisma.$transaction(assignmentUpdates);
    }

    await createAuditLog({
      actorId: admin.id,
      action: updatedMatch.status === MatchStatus.LIVE ? "MATCH_LIVE_SCORE_UPDATED" : "MATCH_RESULT_UPDATED",
      entityType: "Match",
      entityId: id,
      metadata: {
        homeScore: parsed.data.homeScore,
        awayScore: parsed.data.awayScore,
        homeTeam: parsed.data.homeTeam,
        awayTeam: parsed.data.awayTeam,
        homeTeamCode: parsed.data.homeTeamCode,
        awayTeamCode: parsed.data.awayTeamCode,
        status: parsed.data.status,
        updatedPredictions: predictions.length,
        updatedBracketMatches: assignmentUpdates.length,
      },
    });

    return ok({ match: updatedMatch, updatedPredictions: predictions.length });
  } catch (error) {
    return fail(error);
  }
}
