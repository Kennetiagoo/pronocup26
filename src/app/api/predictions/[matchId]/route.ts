import { MatchStatus, PaymentStatus, UserRole } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import {
  calculatePointsFromSnapshot,
  calculateScorerHits,
  getOrCreateBonusConfig,
  isBonusEnabledForStage,
  isFutureMatchForActivation,
} from "@/lib/bonus";
import { requireAuth } from "@/lib/auth/guards";
import { isUserProfileComplete } from "@/lib/auth/profile";
import { ApiError, fail, ok } from "@/lib/http";
import { buildGroupMatchdayMap } from "@/lib/group-matchday";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type PredictionPayload = {
  homeScore?: unknown;
  awayScore?: unknown;
  useX2?: unknown;
};

function parseScore(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError(400, "BAD_REQUEST", `${label} debe ser un numero entero.`);
  }
  if (value < 0 || value > 30) {
    throw new ApiError(422, "UNPROCESSABLE", `${label} debe estar entre 0 y 30.`);
  }
  return value;
}

function parseUseX2(value: unknown) {
  if (typeof value === "undefined") return false;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "BAD_REQUEST", "useX2 debe ser booleano.");
  }
  return value;
}

function isFinalWithScore(match: {
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}) {
  return match.status === MatchStatus.FINAL && match.homeScore !== null && match.awayScore !== null;
}

function dayKeyBogota(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bogota",
  }).format(date);
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
        "Debes completar tu registro antes de guardar pronosticos.",
      );
    }
    if (user.role !== UserRole.ADMIN && user.paymentStatus !== PaymentStatus.APROBADO) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Tu pago aun no esta aprobado. No puedes guardar pronosticos.",
      );
    }

    const { matchId } = await context.params;
    const body = (await request.json()) as PredictionPayload;
    const homeScore = parseScore(body.homeScore, "Marcador local");
    const awayScore = parseScore(body.awayScore, "Marcador visitante");
    const requestedUseX2 = parseUseX2(body.useX2);

    const [match, rule, bonusConfig, existingPrediction] = await Promise.all([
      prisma.match.findUnique({ where: { id: matchId } }),
      prisma.scoringRule.findUnique({ where: { id: 1 } }),
      getOrCreateBonusConfig(),
      prisma.prediction.findUnique({
        where: { userId_matchId: { userId: user.id, matchId } },
        select: { id: true, usedX2: true },
      }),
    ]);

    if (!match) {
      throw new ApiError(404, "NOT_FOUND", "Partido no encontrado.");
    }
    if (!rule) {
      throw new ApiError(500, "INTERNAL_ERROR", "No existe configuracion de puntaje.");
    }
    if (match.status !== MatchStatus.SCHEDULED) {
      throw new ApiError(
        422,
        "UNPROCESSABLE",
        "Este partido ya esta cerrado. No se pueden modificar pronosticos.",
      );
    }

    const lockAt = match.kickoff.getTime() - rule.lockMinutesBeforeKickoff * 60 * 1000;
    if (Date.now() >= lockAt) {
      throw new ApiError(422, "UNPROCESSABLE", "Este partido ya esta bloqueado para pronosticos.");
    }

    const stage = match.stage;
    const isFutureForCurrentConfig = isFutureMatchForActivation(match.kickoff, bonusConfig.activatedAt);
    const x2EnabledForMatch =
      isFutureForCurrentConfig && isBonusEnabledForStage(bonusConfig, "x2", stage);
    const scorersEnabledForMatch =
      isFutureForCurrentConfig && isBonusEnabledForStage(bonusConfig, "scorers", stage);

    if (requestedUseX2 && !x2EnabledForMatch) {
      throw new ApiError(422, "UNPROCESSABLE", "X2 no esta disponible para este partido.");
    }

    if (requestedUseX2 && stage === "GROUP") {
      const [groupMatches, groupX2Predictions] = await Promise.all([
        prisma.match.findMany({
          where: { stage: "GROUP" },
          select: { id: true, stage: true, groupName: true, kickoff: true, matchNumber: true },
        }),
        prisma.prediction.findMany({
          where: {
            userId: user.id,
            usedX2: true,
            x2Returned: false,
            Match: { stage: "GROUP" },
            ...(existingPrediction ? { id: { not: existingPrediction.id } } : {}),
          },
          select: {
            matchId: true,
            Match: {
              select: {
                kickoff: true,
              },
            },
          },
        }),
      ]);

      const groupMatchdayMap = buildGroupMatchdayMap(groupMatches);
      const currentMatchday = groupMatchdayMap.get(match.id) ?? 1;
      const currentDayKey = dayKeyBogota(match.kickoff);

      const x2ActiveUsages = groupX2Predictions.length;
      const x2UsagesCurrentMatchday = groupX2Predictions.filter(
        (prediction) => (groupMatchdayMap.get(prediction.matchId) ?? 1) === currentMatchday,
      ).length;
      const x2UsagesCurrentKickoffDay = groupX2Predictions.filter(
        (prediction) => dayKeyBogota(prediction.Match.kickoff) === currentDayKey,
      ).length;

      const totalLimit = Math.max(0, bonusConfig.x2UsesGroup || 12);
      const perMatchdayLimit = 4;
      const perDayLimit = 1;

      if (x2ActiveUsages >= totalLimit) {
        throw new ApiError(
          422,
          "UNPROCESSABLE",
          `Ya agotaste tus ${totalLimit} usos de X2 en fase de grupos.`,
        );
      }
      if (x2UsagesCurrentMatchday >= perMatchdayLimit) {
        throw new ApiError(
          422,
          "UNPROCESSABLE",
          `Ya alcanzaste el maximo de ${perMatchdayLimit} usos X2 en la fecha ${currentMatchday}.`,
        );
      }
      if (x2UsagesCurrentKickoffDay >= perDayLimit) {
        throw new ApiError(
          422,
          "UNPROCESSABLE",
          "Ya usaste tu X2 permitido para este dia. Maximo 1 por dia.",
        );
      }
    }

    const topApplied = false;
    const appliedMultiplier = requestedUseX2 ? 2 : 1;
    const scorerPointApplied = scorersEnabledForMatch ? bonusConfig.scorerPoint : 0;

    const prediction = await prisma.prediction.upsert({
      where: { userId_matchId: { userId: user.id, matchId } },
      create: {
        id: crypto.randomUUID(),
        userId: user.id,
        matchId,
        homeScore,
        awayScore,
        points: 0,
        basePoints: 0,
        bonusPoints: 0,
        scorerPoints: 0,
        scorerPointApplied,
        usedX2: requestedUseX2,
        x2Returned: false,
        topApplied,
        appliedMultiplier,
        bonusActivatedAt: bonusConfig.activatedAt,
        updatedAt: new Date(),
      },
      update: {
        homeScore,
        awayScore,
        usedX2: requestedUseX2,
        x2Returned: false,
        topApplied,
        appliedMultiplier,
        scorerPointApplied,
        bonusActivatedAt: bonusConfig.activatedAt,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        matchId: true,
        homeScore: true,
        awayScore: true,
        points: true,
        basePoints: true,
        bonusPoints: true,
        scorerPoints: true,
        scorerPointApplied: true,
        usedX2: true,
        x2Returned: true,
        topApplied: true,
        appliedMultiplier: true,
      },
    });

    let finalPrediction = prediction;
    if (isFinalWithScore(match)) {
      const [scorerPicks, officialScorers] = await Promise.all([
        prisma.predictionScorerPick.findMany({
          where: { predictionId: prediction.id },
          select: { teamSide: true, playerId: true },
        }),
        prisma.matchOfficialScorer.findMany({
          where: { matchId: match.id },
          select: { teamSide: true, playerId: true },
        }),
      ]);
      const scorerHitCount = calculateScorerHits(scorerPicks, officialScorers);
      const calculated = calculatePointsFromSnapshot({
        prediction: { homeScore, awayScore },
        official: { homeScore: match.homeScore as number, awayScore: match.awayScore as number },
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
      });

      finalPrediction = await prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          points: calculated.totalPoints,
          basePoints: calculated.basePoints,
          scorerPoints: calculated.scorerPoints,
          bonusPoints: calculated.bonusPoints,
          x2Returned: calculated.x2Returned,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          matchId: true,
          homeScore: true,
          awayScore: true,
          points: true,
          basePoints: true,
          bonusPoints: true,
          scorerPoints: true,
          scorerPointApplied: true,
          usedX2: true,
          x2Returned: true,
          topApplied: true,
          appliedMultiplier: true,
        },
      });
    }

    await createAuditLog({
      actorId: user.id,
      action: "PREDICTION_SAVED",
      entityType: "Prediction",
      entityId: finalPrediction.id,
      metadata: {
        matchId,
        homeScore,
        awayScore,
        useX2: requestedUseX2,
        topApplied,
        appliedMultiplier,
        scorerPointApplied,
        points: finalPrediction.points,
      },
    });

    return ok({ prediction: finalPrediction });
  } catch (error) {
    return fail(error);
  }
}
