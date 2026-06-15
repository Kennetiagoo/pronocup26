import { MatchStatus, PaymentStatus, TeamSide, UserRole } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { getOrCreateBonusConfig, isBonusEnabledForStage, isFutureMatchForActivation } from "@/lib/bonus";
import { requireAuth } from "@/lib/auth/guards";
import { isUserProfileComplete } from "@/lib/auth/profile";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updatePredictionScorersSchema } from "@/lib/validation";

export const runtime = "nodejs";

function sideSlots(playerIds: number[], side: TeamSide) {
  return playerIds.map((playerId, slotIndex) => ({ playerId, teamSide: side, slotIndex }));
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    const user = await requireAuth();
    if (user.role !== UserRole.ADMIN && !isUserProfileComplete(user)) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Debes completar tu registro antes de guardar pronósticos.",
      );
    }
    if (user.role !== UserRole.ADMIN && user.paymentStatus !== PaymentStatus.APROBADO) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Tu pago aún no está aprobado. No puedes guardar pronósticos.",
      );
    }

    const { matchId } = await context.params;
    const body = await request.json();
    const parsed = updatePredictionScorersSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos invalidos.");
    }

    const [prediction, match, rule, bonusConfig] = await Promise.all([
      prisma.prediction.findUnique({
        where: { userId_matchId: { userId: user.id, matchId } },
        select: { id: true },
      }),
      prisma.match.findUnique({
        where: { id: matchId },
        select: {
          id: true,
          stage: true,
          status: true,
          kickoff: true,
          homeTeamCode: true,
          awayTeamCode: true,
        },
      }),
      prisma.scoringRule.findUnique({ where: { id: 1 }, select: { lockMinutesBeforeKickoff: true } }),
      getOrCreateBonusConfig(),
    ]);

    if (!prediction) {
      throw new ApiError(404, "NOT_FOUND", "Debes guardar el marcador antes de elegir goleadores.");
    }
    if (!match) {
      throw new ApiError(404, "NOT_FOUND", "Partido no encontrado.");
    }
    if (!rule) {
      throw new ApiError(500, "INTERNAL_ERROR", "No existe configuración de puntaje.");
    }
    if (match.status !== MatchStatus.SCHEDULED) {
      throw new ApiError(
        422,
        "UNPROCESSABLE",
        "Este partido ya está cerrado. No se pueden modificar goleadores.",
      );
    }

    const lockAt = match.kickoff.getTime() - rule.lockMinutesBeforeKickoff * 60 * 1000;
    if (Date.now() >= lockAt) {
      throw new ApiError(422, "UNPROCESSABLE", "Este partido ya está bloqueado para pronósticos.");
    }

    const enabled =
      isFutureMatchForActivation(match.kickoff, bonusConfig.activatedAt) &&
      isBonusEnabledForStage(bonusConfig, "scorers", match.stage);
    if (!enabled) {
      throw new ApiError(422, "UNPROCESSABLE", "Bonificación de goleadores no disponible para este partido.");
    }

    if (!match.homeTeamCode || !match.awayTeamCode) {
      throw new ApiError(422, "UNPROCESSABLE", "Este partido no tiene códigos de selección configurados.");
    }

    const allowedPlayerIds = await prisma.teamPlayer.findMany({
      where: {
        isActive: true,
        OR: [{ teamCode: match.homeTeamCode }, { teamCode: match.awayTeamCode }],
      },
      select: { id: true },
    });
    const allowedSet = new Set(allowedPlayerIds.map((player) => player.id));
    for (const playerId of [...parsed.data.homePlayerIds, ...parsed.data.awayPlayerIds]) {
      if (!allowedSet.has(playerId)) {
        throw new ApiError(422, "UNPROCESSABLE", "Hay jugadores fuera de las plantillas habilitadas.");
      }
    }

    const records = [
      ...sideSlots(parsed.data.homePlayerIds, TeamSide.HOME),
      ...sideSlots(parsed.data.awayPlayerIds, TeamSide.AWAY),
    ];

    await prisma.$transaction(async (tx) => {
      await tx.predictionScorerPick.deleteMany({ where: { predictionId: prediction.id } });
      if (records.length > 0) {
        await tx.predictionScorerPick.createMany({
          data: records.map((record) => ({
            predictionId: prediction.id,
            teamSide: record.teamSide,
            slotIndex: record.slotIndex,
            playerId: record.playerId,
          })),
        });
      }
    });

    await createAuditLog({
      actorId: user.id,
      action: "PREDICTION_SCORERS_UPDATED",
      entityType: "Prediction",
      entityId: prediction.id,
      metadata: {
        matchId,
        homeSlots: parsed.data.homePlayerIds.length,
        awaySlots: parsed.data.awayPlayerIds.length,
      },
    });

    return ok({
      predictionId: prediction.id,
      homePlayerIds: parsed.data.homePlayerIds,
      awayPlayerIds: parsed.data.awayPlayerIds,
    });
  } catch (error) {
    return fail(error);
  }
}
