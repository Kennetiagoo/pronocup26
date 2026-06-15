import { MatchStatus, PaymentStatus, UserRole } from "@prisma/client";

import { calculatePointsFromSnapshot, calculateScorerHits } from "@/lib/bonus";
import { requireAuth } from "@/lib/auth/guards";
import { isUserProfileComplete } from "@/lib/auth/profile";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function displayName(user: { nombres: string; apellidos: string; username: string | null }) {
  return user.username?.trim() || `${user.nombres} ${user.apellidos}`.trim();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    const user = await requireAuth();
    if (user.role !== UserRole.ADMIN && !isUserProfileComplete(user)) {
      throw new ApiError(403, "FORBIDDEN", "Debes completar tu registro antes de ver pronósticos.");
    }
    if (user.role !== UserRole.ADMIN && user.paymentStatus !== PaymentStatus.APROBADO) {
      throw new ApiError(403, "FORBIDDEN", "Tu pago aún no está aprobado.");
    }

    const { matchId } = await context.params;
    const [match, rule] = await Promise.all([
      prisma.match.findUnique({
        where: { id: matchId },
        select: {
          id: true,
          matchNumber: true,
          stage: true,
          kickoff: true,
          homeTeam: true,
          awayTeam: true,
          homeScore: true,
          awayScore: true,
          status: true,
        },
      }),
      prisma.scoringRule.findUnique({ where: { id: 1 } }),
    ]);

    if (!match) {
      throw new ApiError(404, "NOT_FOUND", "Partido no encontrado.");
    }
    if (!rule) {
      throw new ApiError(500, "INTERNAL_ERROR", "No existe configuración de puntaje.");
    }

    const now = Date.now();
    const kickoffMs = match.kickoff.getTime();
    const lockAt = kickoffMs - rule.lockMinutesBeforeKickoff * 60 * 1000;
    const isClosed = match.status !== MatchStatus.SCHEDULED || now >= lockAt;
    const hasStarted = now >= kickoffMs;
    if (!isClosed || !hasStarted) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Los pronósticos de todos se muestran solo cuando el partido ya inició y está cerrado.",
      );
    }

    const [predictions, officialScorers] = await Promise.all([
      prisma.prediction.findMany({
        where: {
          matchId,
          User: {
            OR: [{ paymentStatus: PaymentStatus.APROBADO }, { role: UserRole.ADMIN }],
          },
        },
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          points: true,
          basePoints: true,
          bonusPoints: true,
          scorerPoints: true,
          usedX2: true,
          x2Returned: true,
          topApplied: true,
          appliedMultiplier: true,
          scorerPointApplied: true,
          User: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              username: true,
            },
          },
          scorerPicks: {
            orderBy: [{ teamSide: "asc" }, { slotIndex: "asc" }],
            select: {
              teamSide: true,
              slotIndex: true,
              player: {
                select: {
                  id: true,
                  name: true,
                  number: true,
                },
              },
            },
          },
        },
      }),
      prisma.matchOfficialScorer.findMany({
        where: { matchId },
        select: {
          teamSide: true,
          playerId: true,
        },
      }),
    ]);

    const canCalculateLive =
      match.status === MatchStatus.LIVE && match.homeScore !== null && match.awayScore !== null;

    const rows = predictions
      .map((prediction) => {
        const scorerPicks = prediction.scorerPicks.map((pick) => ({
          side: pick.teamSide,
          slotIndex: pick.slotIndex,
          playerId: pick.player.id,
          playerName: pick.player.name,
          playerNumber: pick.player.number,
        }));
        const scorerHitCount = calculateScorerHits(
          prediction.scorerPicks.map((pick) => ({
            teamSide: pick.teamSide,
            playerId: pick.player.id,
          })),
          officialScorers,
        );
        const provisional = canCalculateLive
          ? calculatePointsFromSnapshot({
              prediction: {
                homeScore: prediction.homeScore,
                awayScore: prediction.awayScore,
              },
              official: {
                homeScore: match.homeScore as number,
                awayScore: match.awayScore as number,
              },
              rule,
              stage: match.stage,
              snapshot: {
                usedX2: prediction.usedX2,
                x2Returned: prediction.x2Returned,
                topApplied: prediction.topApplied,
                appliedMultiplier: prediction.appliedMultiplier,
                scorerPointApplied: prediction.scorerPointApplied,
              },
              scorerHitCount,
            })
          : null;
        const effectivePoints =
          match.status === MatchStatus.FINAL ? prediction.points : provisional?.totalPoints ?? 0;

        return {
          userId: prediction.User.id,
          name: displayName(prediction.User),
          homeScore: prediction.homeScore,
          awayScore: prediction.awayScore,
          usedX2: prediction.usedX2,
          x2Returned: match.status === MatchStatus.FINAL ? prediction.x2Returned : false,
          points: effectivePoints,
          basePoints: match.status === MatchStatus.FINAL ? prediction.basePoints : provisional?.basePoints ?? 0,
          bonusPoints: match.status === MatchStatus.FINAL ? prediction.bonusPoints : provisional?.bonusPoints ?? 0,
          scorerPoints: match.status === MatchStatus.FINAL ? prediction.scorerPoints : provisional?.scorerPoints ?? 0,
          pointsKind: match.status === MatchStatus.FINAL ? "OFFICIAL" : "PROVISIONAL",
          scorerPicks,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.name.localeCompare(b.name, "es");
      });

    return ok({
      match: {
        id: match.id,
        matchNumber: match.matchNumber,
        status: match.status,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        kickoff: match.kickoff.toISOString(),
      },
      predictions: rows,
    });
  } catch (error) {
    return fail(error);
  }
}
