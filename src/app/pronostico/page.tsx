import { redirect } from "next/navigation";

import PronosticoClient from "@/components/pronostico-client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUserProfileComplete } from "@/lib/auth/profile";
import { getOrCreateBonusConfig } from "@/lib/bonus";
import { buildGroupMatchdayMap } from "@/lib/group-matchday";
import { prisma } from "@/lib/prisma";

export default async function PronosticoPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "ADMIN" && !isUserProfileComplete(user)) {
    redirect("/completar-registro");
  }

  const [activePaymentConfig, scoringRule, matches, proofs, predictions, bonusConfig] = await Promise.all([
    prisma.paymentConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.scoringRule.findUnique({
      where: { id: 1 },
      select: {
        id: true,
        officialModeEnabled: true,
        knockoutMultiplier: true,
        exactScorePoints: true,
        goalDifferencePoints: true,
        outcomePoints: true,
        singleTeamGoalsPoints: true,
        drawOutcomeBonus: true,
        lockMinutesBeforeKickoff: true,
        allowSelfRegistration: true,
      },
    }),
    prisma.match.findMany({
      orderBy: [{ matchNumber: "asc" }],
      select: {
        id: true,
        matchNumber: true,
        stage: true,
        groupName: true,
        kickoff: true,
        kickoffLocal: true,
        city: true,
        stadium: true,
        homeTeam: true,
        awayTeam: true,
        homeTeamCode: true,
        awayTeamCode: true,
        homeScore: true,
        awayScore: true,
        status: true,
      },
    }),
    prisma.paymentProof.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        blobUrl: true,
        status: true,
        rejectionNote: true,
        createdAt: true,
      },
    }),
    prisma.prediction.findMany({
      where: { userId: user.id },
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
        scorerPicks: {
          select: {
            teamSide: true,
            playerId: true,
          },
        },
      },
    }),
    getOrCreateBonusConfig(),
  ]);

  const predictionMap = new Map(
    predictions.map((prediction) => [
      prediction.matchId,
      {
        homeScore: prediction.homeScore,
        awayScore: prediction.awayScore,
        points: prediction.points,
        basePoints: prediction.basePoints,
        bonusPoints: prediction.bonusPoints,
        scorerPoints: prediction.scorerPoints,
        scorerPointApplied: prediction.scorerPointApplied,
        usedX2: prediction.usedX2,
        x2Returned: prediction.x2Returned,
        topApplied: prediction.topApplied,
        appliedMultiplier: prediction.appliedMultiplier,
        scorerPickIds: prediction.scorerPicks.map((pick) => ({
          side: pick.teamSide,
          playerId: pick.playerId,
        })),
      },
    ]),
  );

  const uniqueTeamCodes = Array.from(
    new Set(
      matches
        .flatMap((match) => [match.homeTeamCode, match.awayTeamCode])
        .filter((code): code is string => Boolean(code)),
    ),
  );

  const players = await prisma.teamPlayer.findMany({
    where: {
      isActive: true,
      teamCode: { in: uniqueTeamCodes },
    },
    orderBy: [{ teamCode: "asc" }, { number: "asc" }, { name: "asc" }],
    select: {
      id: true,
      teamCode: true,
      name: true,
      number: true,
    },
  });

  const teamPlayersByCode = players.reduce<Record<string, Array<{ id: number; name: string; number: number | null }>>>(
    (acc, player) => {
      if (!acc[player.teamCode]) acc[player.teamCode] = [];
      acc[player.teamCode].push({
        id: player.id,
        name: player.name,
        number: player.number,
      });
      return acc;
    },
    {},
  );

  const serializedPaymentConfig = activePaymentConfig
    ? {
        id: activePaymentConfig.id,
        amount: activePaymentConfig.amount.toString(),
        currency: activePaymentConfig.currency,
        instructions: activePaymentConfig.instructions,
        qrBlobUrl: activePaymentConfig.qrBlobUrl,
      }
    : null;

  const groupMatchdayMap = buildGroupMatchdayMap(matches);
  const serializedMatches = matches.map((match) => {
    const ownPrediction = predictionMap.get(match.id);
    return {
      ...match,
      kickoff: match.kickoff.toISOString(),
      groupMatchday: groupMatchdayMap.get(match.id) ?? null,
      ownPredictionHome: ownPrediction?.homeScore ?? null,
      ownPredictionAway: ownPrediction?.awayScore ?? null,
      ownPredictionPoints: ownPrediction?.points ?? 0,
      ownPredictionBasePoints: ownPrediction?.basePoints ?? 0,
      ownPredictionBonusPoints: ownPrediction?.bonusPoints ?? 0,
      ownPredictionScorerPoints: ownPrediction?.scorerPoints ?? 0,
      ownPredictionUsedX2: ownPrediction?.usedX2 ?? false,
      ownPredictionX2Returned: ownPrediction?.x2Returned ?? false,
      ownPredictionTopApplied: ownPrediction?.topApplied ?? false,
      ownPredictionAppliedMultiplier: ownPrediction?.appliedMultiplier ?? 1,
      ownPredictionScorerPointApplied: ownPrediction?.scorerPointApplied ?? 0,
      ownScorerPicks: ownPrediction?.scorerPickIds ?? [],
    };
  });

  const serializedProofs = proofs.map((proof) => ({
    ...proof,
    createdAt: proof.createdAt.toISOString(),
  }));

  const [users, allPredictionsForStandings] = await Promise.all([
    prisma.user.findMany({
      where: { role: "USER" },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        username: true,
        createdAt: true,
      },
    }),
    prisma.prediction.findMany({
      select: {
        userId: true,
        points: true,
        basePoints: true,
        Match: {
          select: {
            stage: true,
          },
        },
      },
    }),
  ]);

  const knockoutMultiplier = scoringRule?.knockoutMultiplier ?? 2;
  const isOfficialMode = scoringRule?.officialModeEnabled ?? true;

  function scoreBucketsForStage(stage: string) {
    if (!isOfficialMode) return { max: 7, p2: 5, p3: 4, p4: 3 };
    if (stage === "GROUP") return { max: 10, p2: 7, p3: 6, p4: 5 };
    return {
      max: 10 * knockoutMultiplier,
      p2: 7 * knockoutMultiplier,
      p3: 6 * knockoutMultiplier,
      p4: 5 * knockoutMultiplier,
    };
  }

  const totalsByUser = new Map<
    string,
    {
      totalPoints: number;
      predictionCount: number;
      groupPoints: number;
      knockoutPoints: number;
      perfectHits: number;
      partialLevel2: number;
      partialLevel3: number;
      partialLevel4: number;
    }
  >();
  for (const row of allPredictionsForStandings) {
    const current = totalsByUser.get(row.userId) ?? {
      totalPoints: 0,
      predictionCount: 0,
      groupPoints: 0,
      knockoutPoints: 0,
      perfectHits: 0,
      partialLevel2: 0,
      partialLevel3: 0,
      partialLevel4: 0,
    };
    current.totalPoints += row.points ?? 0;
    current.predictionCount += 1;
    const stage = row.Match.stage;
    if (stage === "GROUP") current.groupPoints += row.points ?? 0;
    else current.knockoutPoints += row.points ?? 0;

    const basePoints = row.basePoints ?? 0;
    const buckets = scoreBucketsForStage(stage);
    if (basePoints === buckets.max) current.perfectHits += 1;
    else if (basePoints === buckets.p2) current.partialLevel2 += 1;
    else if (basePoints === buckets.p3) current.partialLevel3 += 1;
    else if (basePoints === buckets.p4) current.partialLevel4 += 1;

    totalsByUser.set(row.userId, current);
  }

  const bettorStandings = users
    .filter((u) => (u.username?.trim() ?? "").length >= 3)
    .map((u) => ({
      userId: u.id,
      nombres: u.nombres,
      apellidos: u.apellidos,
      username: u.username ?? "",
      totalPoints: totalsByUser.get(u.id)?.totalPoints ?? 0,
      predictionCount: totalsByUser.get(u.id)?.predictionCount ?? 0,
      groupPoints: totalsByUser.get(u.id)?.groupPoints ?? 0,
      knockoutPoints: totalsByUser.get(u.id)?.knockoutPoints ?? 0,
      perfectHits: totalsByUser.get(u.id)?.perfectHits ?? 0,
      partialLevel2: totalsByUser.get(u.id)?.partialLevel2 ?? 0,
      partialLevel3: totalsByUser.get(u.id)?.partialLevel3 ?? 0,
      partialLevel4: totalsByUser.get(u.id)?.partialLevel4 ?? 0,
      registeredAt: u.createdAt.toISOString(),
    }))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.perfectHits !== a.perfectHits) return b.perfectHits - a.perfectHits;
      if (b.partialLevel2 !== a.partialLevel2) return b.partialLevel2 - a.partialLevel2;
      if (b.partialLevel3 !== a.partialLevel3) return b.partialLevel3 - a.partialLevel3;
      if (b.partialLevel4 !== a.partialLevel4) return b.partialLevel4 - a.partialLevel4;
      if (b.predictionCount !== a.predictionCount) return b.predictionCount - a.predictionCount;
      if (a.registeredAt !== b.registeredAt) {
        return Date.parse(a.registeredAt) - Date.parse(b.registeredAt);
      }
      return a.username.localeCompare(b.username, "es");
    })
    .map((row, index) => ({
      ...row,
      position: index + 1,
    }));

  return (
    <PronosticoClient
      user={user}
      paymentConfig={serializedPaymentConfig}
      matches={serializedMatches}
      scoringRule={scoringRule}
      proofs={serializedProofs}
      bettorStandings={bettorStandings}
      bonusConfig={{
        activatedAt: bonusConfig.activatedAt.toISOString(),
        x2EnabledGlobal: bonusConfig.x2EnabledGlobal,
        x2GroupEnabled: bonusConfig.x2GroupEnabled,
        x2RoundOf32Enabled: bonusConfig.x2RoundOf32Enabled,
        x2RoundOf16Enabled: bonusConfig.x2RoundOf16Enabled,
        x2QuarterFinalEnabled: bonusConfig.x2QuarterFinalEnabled,
        x2SemiFinalEnabled: bonusConfig.x2SemiFinalEnabled,
        x2ThirdPlaceEnabled: bonusConfig.x2ThirdPlaceEnabled,
        x2FinalEnabled: bonusConfig.x2FinalEnabled,
        scorersEnabledGlobal: bonusConfig.scorersEnabledGlobal,
        scorersGroupEnabled: bonusConfig.scorersGroupEnabled,
        scorersRoundOf32Enabled: bonusConfig.scorersRoundOf32Enabled,
        scorersRoundOf16Enabled: bonusConfig.scorersRoundOf16Enabled,
        scorersQuarterFinalEnabled: bonusConfig.scorersQuarterFinalEnabled,
        scorersSemiFinalEnabled: bonusConfig.scorersSemiFinalEnabled,
        scorersThirdPlaceEnabled: bonusConfig.scorersThirdPlaceEnabled,
        scorersFinalEnabled: bonusConfig.scorersFinalEnabled,
        x2UsesGroup: bonusConfig.x2UsesGroup,
        scorerPoint: bonusConfig.scorerPoint,
      }}
      teamPlayersByCode={teamPlayersByCode}
      serverNowIso={new Date().toISOString()}
    />
  );
}
