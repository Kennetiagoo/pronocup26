import { redirect } from "next/navigation";

import PronosticoClient from "@/components/pronostico-client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUserProfileComplete } from "@/lib/auth/profile";
import { calculatePointsFromSnapshot, calculateScorerHits, getOrCreateBonusConfig } from "@/lib/bonus";
import { buildGroupMatchdayMap } from "@/lib/group-matchday";
import { autoStartLiveMatches } from "@/lib/matches/auto-live";
import { prisma } from "@/lib/prisma";
import { calculatePredictionPoints } from "@/lib/scoring";
import { getOrCreateAppUiConfig } from "@/lib/ui-config";

export default async function PronosticoPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "ADMIN" && !isUserProfileComplete(user)) {
    redirect("/completar-registro");
  }
  const currentUserId = user.id;

  await autoStartLiveMatches();

  const [activePaymentConfig, scoringRule, matches, proofs, predictions, bonusConfig, uiConfig] = await Promise.all([
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
        updatedAt: true,
      },
    }),
    prisma.match.findMany({
      orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
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
        isTopMatch: true,
        topMultiplier: true,
        officialScorers: {
          orderBy: [{ teamSide: "asc" }, { slotIndex: "asc" }],
          select: {
            teamSide: true,
            slotIndex: true,
            playerId: true,
          },
        },
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
    getOrCreateAppUiConfig(),
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

  const serverNowIso = new Date().toISOString();
  const serverNowMs = Date.parse(serverNowIso);
  const groupMatchdayMap = buildGroupMatchdayMap(matches);
  const serializedMatches = matches.map((match) => {
    const ownPrediction = predictionMap.get(match.id);
    const ownLiveCalculated =
      scoringRule &&
      ownPrediction &&
      match.status === "LIVE" &&
      match.kickoff.getTime() <= serverNowMs &&
      match.homeScore !== null &&
      match.awayScore !== null
        ? calculatePointsFromSnapshot({
            prediction: {
              homeScore: ownPrediction.homeScore,
              awayScore: ownPrediction.awayScore,
            },
            official: {
              homeScore: match.homeScore,
              awayScore: match.awayScore,
            },
            rule: scoringRule,
            stage: match.stage,
            snapshot: {
              usedX2: ownPrediction.usedX2,
              x2Returned: ownPrediction.x2Returned,
              topApplied: ownPrediction.topApplied,
              appliedMultiplier: ownPrediction.appliedMultiplier,
              scorerPointApplied: ownPrediction.scorerPointApplied,
            },
            scorerHitCount: calculateScorerHits(
              ownPrediction.scorerPickIds.map((pick) => ({
                teamSide: pick.side,
                playerId: pick.playerId,
              })),
              match.officialScorers,
            ),
          })
        : null;
    return {
      ...match,
      kickoff: match.kickoff.toISOString(),
      officialScorers: match.officialScorers.map((scorer) => ({
        side: scorer.teamSide,
        slotIndex: scorer.slotIndex,
        playerId: scorer.playerId,
      })),
      groupMatchday: groupMatchdayMap.get(match.id) ?? null,
      ownPredictionHome: ownPrediction?.homeScore ?? null,
      ownPredictionAway: ownPrediction?.awayScore ?? null,
      ownPredictionPoints: ownLiveCalculated?.totalPoints ?? ownPrediction?.points ?? 0,
      ownPredictionBasePoints: ownLiveCalculated?.basePoints ?? ownPrediction?.basePoints ?? 0,
      ownPredictionBonusPoints: ownLiveCalculated?.bonusPoints ?? ownPrediction?.bonusPoints ?? 0,
      ownPredictionScorerPoints: ownLiveCalculated?.scorerPoints ?? ownPrediction?.scorerPoints ?? 0,
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
  const serializedScoringRule = scoringRule
    ? {
        id: scoringRule.id,
        officialModeEnabled: scoringRule.officialModeEnabled,
        knockoutMultiplier: scoringRule.knockoutMultiplier,
        exactScorePoints: scoringRule.exactScorePoints,
        goalDifferencePoints: scoringRule.goalDifferencePoints,
        outcomePoints: scoringRule.outcomePoints,
        singleTeamGoalsPoints: scoringRule.singleTeamGoalsPoints,
        drawOutcomeBonus: scoringRule.drawOutcomeBonus,
        lockMinutesBeforeKickoff: scoringRule.lockMinutesBeforeKickoff,
        allowSelfRegistration: scoringRule.allowSelfRegistration,
      }
    : null;

  const [users, allPredictionsForStandings] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [{ paymentStatus: "APROBADO" }, { id: user.id, role: "ADMIN" }],
      },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        username: true,
        paymentStatus: true,
        createdAt: true,
      },
    }),
    prisma.prediction.findMany({
      select: {
        matchId: true,
        userId: true,
        homeScore: true,
        awayScore: true,
        points: true,
        basePoints: true,
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
        Match: {
          select: {
            stage: true,
            matchNumber: true,
            groupName: true,
            homeTeam: true,
            awayTeam: true,
            status: true,
            homeScore: true,
            awayScore: true,
            kickoff: true,
            officialScorers: {
              select: {
                teamSide: true,
                playerId: true,
              },
            },
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

  type StandingPredictionRow = (typeof allPredictionsForStandings)[number];
  type StandingTotals = {
    totalPoints: number;
    pointsWithoutBonus: number;
    predictionCount: number;
    groupPoints: number;
    knockoutPoints: number;
    perfectHits: number;
    partialLevel2: number;
    partialLevel3: number;
    partialLevel4: number;
    x2UsedCount: number;
    x2Usages: Array<{
      matchId: string;
      matchNumber: number;
      stage: string;
      groupName: string | null;
      homeTeam: string;
      awayTeam: string;
      homeScore: number | null;
      awayScore: number | null;
      points: number;
      basePoints: number;
      returned: boolean;
      applied: boolean;
      consumesGroupQuota: boolean;
    }>;
  };
  type StandingBaseRow = {
    userId: string;
    nombres: string;
    apellidos: string;
    username: string;
    paymentStatus: (typeof users)[number]["paymentStatus"];
    totalPoints: number;
    pointsWithoutBonus: number;
    predictionCount: number;
    groupPoints: number;
    knockoutPoints: number;
    perfectHits: number;
    partialLevel2: number;
    partialLevel3: number;
    partialLevel4: number;
    x2UsedCount: number;
    x2LeftCount: number;
    x2Usages: StandingTotals["x2Usages"];
    registeredAt: string;
    sortOrder: number;
    position: number;
  };
  type PodiumPath = {
    targetPosition: 1 | 2 | 3;
    label: string;
    referenceName: string | null;
    currentCutPoints: number | null;
    pointsBehind: number;
    neededPoints: number;
    maxReachablePoints: number;
    alreadyInZone: boolean;
    canReach: boolean;
    verdict: "IN_ZONE" | "CAN_REACH" | "CANNOT_REACH";
  };
  type NextMatchPath = {
    matchNumber: number;
    homeTeam: string;
    awayTeam: string;
    kickoff: string;
    simultaneousMatches: Array<{
      matchNumber: number;
      homeTeam: string;
      awayTeam: string;
      scoreLine: string | null;
      ownScoreLine: string | null;
      liveScoreLine: string | null;
      ownPoints: number;
    }>;
    locked: boolean;
    hasOwnPrediction: boolean;
    currentCutPosition: number;
    bestPosition: number;
    positionGain: number;
    scoreLine: string | null;
    ownScoreLine: string | null;
    liveScoreLine: string | null;
    recommendedDiffersFromPick: boolean;
    ownPoints: number;
    ownBasePoints: number;
    ownUsesX2: boolean;
    actions: string[];
    rivalConditions: string[];
    note: string | null;
  };
  const visibleUsers = users.filter((u) => (u.username?.trim() ?? "").length >= 3 || u.id === currentUserId);
  const rankingStarted = matches.some(
    (match) =>
      (match.status === "FINAL" || (match.status === "LIVE" && match.kickoff.getTime() <= serverNowMs)) &&
      match.homeScore !== null &&
      match.awayScore !== null,
  );
  const hasLiveMatches = matches.some(
    (match) =>
      match.status === "LIVE" &&
      match.kickoff.getTime() <= serverNowMs &&
      match.homeScore !== null &&
      match.awayScore !== null,
  );

  function compareStandingRows(a: Omit<StandingBaseRow, "position" | "sortOrder">, b: Omit<StandingBaseRow, "position" | "sortOrder">) {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.x2UsedCount !== b.x2UsedCount) return a.x2UsedCount - b.x2UsedCount;
    if (b.x2LeftCount !== a.x2LeftCount) return b.x2LeftCount - a.x2LeftCount;
    if (b.perfectHits !== a.perfectHits) return b.perfectHits - a.perfectHits;
    if (b.partialLevel2 !== a.partialLevel2) return b.partialLevel2 - a.partialLevel2;
    if (b.partialLevel3 !== a.partialLevel3) return b.partialLevel3 - a.partialLevel3;
    if (b.partialLevel4 !== a.partialLevel4) return b.partialLevel4 - a.partialLevel4;
    if (b.predictionCount !== a.predictionCount) return b.predictionCount - a.predictionCount;
    if (a.registeredAt !== b.registeredAt) return Date.parse(a.registeredAt) - Date.parse(b.registeredAt);
    return a.username.localeCompare(b.username, "es");
  }

  function hasSameVisibleRank(a: StandingBaseRow, b: StandingBaseRow) {
    return (
      a.totalPoints === b.totalPoints &&
      a.x2UsedCount === b.x2UsedCount &&
      a.x2LeftCount === b.x2LeftCount &&
      a.perfectHits === b.perfectHits &&
      a.partialLevel2 === b.partialLevel2 &&
      a.partialLevel3 === b.partialLevel3 &&
      a.partialLevel4 === b.partialLevel4 &&
      a.predictionCount === b.predictionCount &&
      a.registeredAt === b.registeredAt
    );
  }

  function assignSharedPositions(rows: Array<Omit<StandingBaseRow, "position" | "sortOrder">>, started: boolean) {
    if (!started) {
      return rows
        .slice()
        .sort((a, b) => (a.username || `${a.nombres} ${a.apellidos}`).localeCompare(b.username || `${b.nombres} ${b.apellidos}`, "es"))
        .map((row, index) => ({
          ...row,
          sortOrder: index + 1,
          position: 1,
        }));
    }
    const sorted = rows.slice().sort(compareStandingRows);
    return sorted.map((row, index) => {
      const previous = index > 0 ? sorted[index - 1] : null;
      const previousPosition =
        index > 0 && previous && hasSameVisibleRank(previous as StandingBaseRow, row as StandingBaseRow)
          ? (sorted[index - 1] as StandingBaseRow).position
          : index + 1;
      const position = started ? previousPosition : 1;
      const standingRow = {
        ...row,
        sortOrder: index + 1,
        position,
      } satisfies StandingBaseRow;
      sorted[index] = standingRow;
      return standingRow;
    });
  }

  function buildBettorStandings(
    predictionRows: StandingPredictionRow[],
    options?: { includeLiveMatches?: boolean; started?: boolean },
  ) {
    const includeLiveMatches = options?.includeLiveMatches ?? true;
    const standingsStarted = options?.started ?? rankingStarted;
    const totalsByUser = new Map<string, StandingTotals>();
    for (const row of predictionRows) {
      const isFinalWithScore =
        row.Match.status === "FINAL" &&
        row.Match.homeScore !== null &&
        row.Match.awayScore !== null;
      const isLiveWithScore =
        includeLiveMatches &&
        row.Match.status === "LIVE" &&
        row.Match.kickoff.getTime() <= serverNowMs &&
        row.Match.homeScore !== null &&
        row.Match.awayScore !== null;
      if (!isFinalWithScore && !isLiveWithScore) continue;

      const liveCalculated =
        scoringRule &&
        isLiveWithScore
          ? calculatePointsFromSnapshot({
              prediction: {
                homeScore: row.homeScore,
                awayScore: row.awayScore,
              },
              official: {
                homeScore: row.Match.homeScore as number,
                awayScore: row.Match.awayScore as number,
              },
              rule: scoringRule,
              stage: row.Match.stage,
              snapshot: {
                usedX2: row.usedX2,
                x2Returned: row.x2Returned,
                topApplied: row.topApplied,
                appliedMultiplier: row.appliedMultiplier,
                scorerPointApplied: row.scorerPointApplied,
              },
              scorerHitCount: calculateScorerHits(row.scorerPicks, row.Match.officialScorers),
            })
          : null;
      const effectivePoints = liveCalculated?.totalPoints ?? row.points ?? 0;
      const effectiveBasePoints = liveCalculated?.basePoints ?? row.basePoints ?? 0;
      const current = totalsByUser.get(row.userId) ?? {
        totalPoints: 0,
        pointsWithoutBonus: 0,
        predictionCount: 0,
        groupPoints: 0,
        knockoutPoints: 0,
        perfectHits: 0,
        partialLevel2: 0,
        partialLevel3: 0,
        partialLevel4: 0,
        x2UsedCount: 0,
        x2Usages: [],
      };
      current.totalPoints += effectivePoints;
      current.pointsWithoutBonus += effectiveBasePoints;
      current.predictionCount += 1;
      const stage = row.Match.stage;
      if (stage === "GROUP") current.groupPoints += effectivePoints;
      else current.knockoutPoints += effectivePoints;

      const basePoints = effectiveBasePoints;
      const buckets = scoreBucketsForStage(stage);
      if (basePoints >= buckets.max) current.perfectHits += 1;
      else if (basePoints === buckets.p2) current.partialLevel2 += 1;
      else if (basePoints === buckets.p3) current.partialLevel3 += 1;
      else if (basePoints === buckets.p4) current.partialLevel4 += 1;
      if (isFinalWithScore && row.usedX2) {
        const applied = !row.x2Returned && effectiveBasePoints > 0;
        const consumesGroupQuota = row.Match.stage === "GROUP" && applied;
        if (consumesGroupQuota) current.x2UsedCount += 1;
        current.x2Usages.push({
          matchId: row.matchId,
          matchNumber: row.Match.matchNumber,
          stage: row.Match.stage,
          groupName: row.Match.groupName,
          homeTeam: row.Match.homeTeam,
          awayTeam: row.Match.awayTeam,
          homeScore: row.Match.homeScore,
          awayScore: row.Match.awayScore,
          points: effectivePoints,
          basePoints: effectiveBasePoints,
          returned: row.x2Returned,
          applied,
          consumesGroupQuota,
        });
      }

      totalsByUser.set(row.userId, current);
    }

    const rows = visibleUsers
      .map((u) => ({
        userId: u.id,
        nombres: u.nombres,
        apellidos: u.apellidos,
        username: u.username ?? "",
        paymentStatus: u.paymentStatus,
        totalPoints: totalsByUser.get(u.id)?.totalPoints ?? 0,
        pointsWithoutBonus: totalsByUser.get(u.id)?.pointsWithoutBonus ?? 0,
        predictionCount: totalsByUser.get(u.id)?.predictionCount ?? 0,
        groupPoints: totalsByUser.get(u.id)?.groupPoints ?? 0,
        knockoutPoints: totalsByUser.get(u.id)?.knockoutPoints ?? 0,
        perfectHits: totalsByUser.get(u.id)?.perfectHits ?? 0,
        partialLevel2: totalsByUser.get(u.id)?.partialLevel2 ?? 0,
        partialLevel3: totalsByUser.get(u.id)?.partialLevel3 ?? 0,
        partialLevel4: totalsByUser.get(u.id)?.partialLevel4 ?? 0,
        x2UsedCount: totalsByUser.get(u.id)?.x2UsedCount ?? 0,
        x2LeftCount: Math.max(0, bonusConfig.x2UsesGroup - (totalsByUser.get(u.id)?.x2UsedCount ?? 0)),
        x2Usages: (totalsByUser.get(u.id)?.x2Usages ?? []).sort((a, b) => a.matchNumber - b.matchNumber),
        registeredAt: u.createdAt.toISOString(),
      }));
    return assignSharedPositions(rows, standingsStarted);
  }

  const finalizedMatchesForRanking = matches
    .filter((match) => match.status === "FINAL" && match.homeScore !== null && match.awayScore !== null)
    .slice()
    .sort((a, b) => {
      const kickoffDiff = a.kickoff.getTime() - b.kickoff.getTime();
      if (kickoffDiff !== 0) return kickoffDiff;
      return a.matchNumber - b.matchNumber;
    });
  const finalizedPredictionRowsForMovement = allPredictionsForStandings.filter(
    (row) =>
      row.Match.status === "FINAL" &&
      row.Match.homeScore !== null &&
      row.Match.awayScore !== null,
  );
  const cutoffBettorStandings = buildBettorStandings(finalizedPredictionRowsForMovement, {
    includeLiveMatches: false,
    started: finalizedMatchesForRanking.length > 0,
  });
  const latestFinalizedMatch = finalizedMatchesForRanking.at(-1) ?? null;
  const movementReferencePredictionRows =
    hasLiveMatches || !latestFinalizedMatch
      ? finalizedPredictionRowsForMovement
      : finalizedPredictionRowsForMovement.filter((row) => row.matchId !== latestFinalizedMatch.id);
  const movementReferenceStandings = buildBettorStandings(movementReferencePredictionRows, {
    includeLiveMatches: false,
    started: hasLiveMatches ? finalizedMatchesForRanking.length > 0 : finalizedMatchesForRanking.length > 1,
  });
  const movementPositionByUser = new Map(movementReferenceStandings.map((row) => [row.userId, row.position]));
  const movementReferenceLabel = hasLiveMatches
    ? latestFinalizedMatch
      ? `P${latestFinalizedMatch.matchNumber}`
      : "Live"
    : latestFinalizedMatch
      ? `P${latestFinalizedMatch.matchNumber}`
      : "Inicio";
  const lastFiveFinalMatches = finalizedMatchesForRanking.slice(-5);
  const predictionByUserMatch = new Map(
    allPredictionsForStandings.map((row) => [`${row.userId}:${row.matchId}`, row]),
  );
  function isMatchLockedForPotential(match: (typeof matches)[number]) {
    if (match.status === "FINAL") return true;
    if (!scoringRule) return false;
    return serverNowMs >= match.kickoff.getTime() - scoringRule.lockMinutesBeforeKickoff * 60 * 1000;
  }

  function isPredictionClosedForPrivacy(prediction: StandingPredictionRow) {
    if (prediction.Match.status !== "SCHEDULED") return true;
    if (!scoringRule) return false;
    return serverNowMs >= prediction.Match.kickoff.getTime() - scoringRule.lockMinutesBeforeKickoff * 60 * 1000;
  }

  function canUsePredictionDetailsForPotential(userId: string, prediction: StandingPredictionRow) {
    return userId === currentUserId || isPredictionClosedForPrivacy(prediction);
  }

  function x2EnabledForPotential(match: (typeof matches)[number]) {
    if (!bonusConfig.x2EnabledGlobal) return false;
    if (match.kickoff.getTime() <= bonusConfig.activatedAt.getTime()) return false;
    if (match.stage === "GROUP") return bonusConfig.x2GroupEnabled;
    if (match.stage === "ROUND_OF_32") return bonusConfig.x2RoundOf32Enabled;
    if (match.stage === "ROUND_OF_16") return bonusConfig.x2RoundOf16Enabled;
    if (match.stage === "QUARTER_FINAL") return bonusConfig.x2QuarterFinalEnabled;
    if (match.stage === "SEMI_FINAL") return bonusConfig.x2SemiFinalEnabled;
    if (match.stage === "THIRD_PLACE") return bonusConfig.x2ThirdPlaceEnabled;
    return bonusConfig.x2FinalEnabled;
  }

  function calculateRemainingPotential(userId: string, row: StandingBaseRow) {
    let potential = 0;
    let groupX2Left = row.x2LeftCount;
    const x2ByMatchday = new Map<number, number>();
    const x2ByKickoffDay = new Map<string, number>();
    const groupX2Candidates: Array<{ gain: number; matchday: number; kickoffDay: string }> = [];

    for (const prediction of allPredictionsForStandings) {
      if (
        prediction.userId !== userId ||
        prediction.Match.stage !== "GROUP" ||
        !prediction.usedX2 ||
        prediction.x2Returned ||
        !canUsePredictionDetailsForPotential(userId, prediction)
      ) {
        continue;
      }
      const matchday = groupMatchdayMap.get(prediction.matchId) ?? 1;
      const kickoffDay = prediction.Match.kickoff.toISOString().slice(0, 10);
      x2ByMatchday.set(matchday, (x2ByMatchday.get(matchday) ?? 0) + 1);
      x2ByKickoffDay.set(kickoffDay, (x2ByKickoffDay.get(kickoffDay) ?? 0) + 1);
    }

    for (const match of matches) {
      if (match.status === "FINAL" || match.status === "LIVE") continue;
      const prediction = predictionByUserMatch.get(`${userId}:${match.id}`);
      const locked = isMatchLockedForPotential(match);
      const predictionForPotential =
        prediction && canUsePredictionDetailsForPotential(userId, prediction) ? prediction : null;
      if (locked && !predictionForPotential) continue;

      const baseMax = scoreBucketsForStage(match.stage).max;
      const scorerPotential = predictionForPotential
        ? predictionForPotential.scorerPicks.length *
          Math.max(0, predictionForPotential.scorerPointApplied || bonusConfig.scorerPoint)
        : 0;
      const savedMultiplier = match.stage === "GROUP" && predictionForPotential
        ? Math.max(1, predictionForPotential.appliedMultiplier || (predictionForPotential.usedX2 ? 2 : 1))
        : 1;
      potential += Math.round(baseMax * savedMultiplier) + scorerPotential;

      if (predictionForPotential?.usedX2 || locked || !x2EnabledForPotential(match)) continue;
      if (match.stage === "GROUP") {
        groupX2Candidates.push({
          gain: baseMax,
          matchday: groupMatchdayMap.get(match.id) ?? 1,
          kickoffDay: match.kickoff.toISOString().slice(0, 10),
        });
      } else {
        potential += baseMax;
      }
    }

    for (const candidate of groupX2Candidates.sort((a, b) => b.gain - a.gain)) {
      const matchdayUsed = x2ByMatchday.get(candidate.matchday) ?? 0;
      const dayUsed = x2ByKickoffDay.get(candidate.kickoffDay) ?? 0;
      const dailyLimitApplies = candidate.matchday !== 3;
      if (groupX2Left <= 0 || matchdayUsed >= 4 || (dailyLimitApplies && dayUsed >= 1)) continue;
      potential += candidate.gain;
      groupX2Left -= 1;
      x2ByMatchday.set(candidate.matchday, matchdayUsed + 1);
      x2ByKickoffDay.set(candidate.kickoffDay, dayUsed + 1);
    }

    return potential;
  }

  function displayName(row: Pick<StandingBaseRow, "username" | "nombres" | "apellidos">) {
    return (row.username || `${row.nombres} ${row.apellidos}`).toUpperCase();
  }

  function simulatedPositionFor(userId: string, additionalPoints: number, baseRows: StandingBaseRow[]) {
    const simulatedRows = baseRows.map((standingRow) => ({
      ...standingRow,
      totalPoints: standingRow.userId === userId ? standingRow.totalPoints + additionalPoints : standingRow.totalPoints,
    }));
    return assignSharedPositions(simulatedRows, true).find((standingRow) => standingRow.userId === userId)?.position ?? 999;
  }

  function buildPodiumPaths(row: StandingBaseRow, baseRows: StandingBaseRow[], remainingPotentialPoints: number) {
    const targets = [
      { targetPosition: 1 as const, label: "Oro" },
      { targetPosition: 2 as const, label: "Plata" },
      { targetPosition: 3 as const, label: "Bronce" },
    ];

    return targets.map((target): PodiumPath => {
      const cutoff =
        baseRows
          .filter((standingRow) => standingRow.position <= target.targetPosition)
          .at(-1) ?? baseRows[target.targetPosition - 1] ?? null;
      const alreadyInZone = row.position <= target.targetPosition;
      let neededPoints = alreadyInZone ? 0 : Number.POSITIVE_INFINITY;

      if (!alreadyInZone) {
        for (let pointsToAdd = 0; pointsToAdd <= remainingPotentialPoints; pointsToAdd += 1) {
          if (simulatedPositionFor(row.userId, pointsToAdd, baseRows) <= target.targetPosition) {
            neededPoints = pointsToAdd;
            break;
          }
        }
      }

      const fallbackNeeded = Math.max(0, (cutoff?.totalPoints ?? row.totalPoints) - row.totalPoints + 1);
      const canReach = alreadyInZone || neededPoints <= remainingPotentialPoints;
      return {
        targetPosition: target.targetPosition,
        label: target.label,
        referenceName: cutoff ? displayName(cutoff) : null,
        currentCutPoints: cutoff?.totalPoints ?? null,
        pointsBehind: Math.max(0, (cutoff?.totalPoints ?? row.totalPoints) - row.totalPoints),
        neededPoints: Number.isFinite(neededPoints) ? neededPoints : fallbackNeeded,
        maxReachablePoints: row.totalPoints + remainingPotentialPoints,
        alreadyInZone,
        canReach,
        verdict: alreadyInZone ? "IN_ZONE" : canReach ? "CAN_REACH" : "CANNOT_REACH",
      };
    });
  }

  const nextRankingCandidates = matches
    .filter((match) => {
      if (match.status === "FINAL") return false;
      if (match.stage === "GROUP") return true;
      return Boolean(match.homeTeamCode && match.awayTeamCode);
    })
    .slice()
    .sort((a, b) => {
      const kickoffDiff = a.kickoff.getTime() - b.kickoff.getTime();
      if (kickoffDiff !== 0) return kickoffDiff;
      return a.matchNumber - b.matchNumber;
    });
  const nextRankingMatch = nextRankingCandidates[0] ?? null;
  const nextRankingMatchBlock = nextRankingMatch
    ? nextRankingCandidates.filter((match) => {
        if (match.kickoff.getTime() !== nextRankingMatch.kickoff.getTime()) return false;
        if (nextRankingMatch.stage === "GROUP" && nextRankingMatch.groupName) {
          return match.stage === "GROUP" && match.groupName === nextRankingMatch.groupName;
        }
        return true;
      })
    : [];

  function isScenarioLocked(match: (typeof matches)[number]) {
    if (match.status === "LIVE") return true;
    if (!scoringRule) return false;
    return serverNowMs >= match.kickoff.getTime() - scoringRule.lockMinutesBeforeKickoff * 60 * 1000;
  }

  function scenarioImpact(
    prediction: StandingPredictionRow,
    match: (typeof matches)[number],
    official: { homeScore: number; awayScore: number },
  ) {
    if (!scoringRule) return { points: 0, basePoints: 0 };
    const basePoints = calculatePredictionPoints(
      { homeScore: prediction.homeScore, awayScore: prediction.awayScore },
      official,
      scoringRule,
      match.stage,
    );
    const multiplier = match.stage === "GROUP"
      ? Math.max(1, prediction.appliedMultiplier || (prediction.usedX2 ? 2 : 1))
      : 1;
    return {
      basePoints,
      points: Math.round(basePoints * multiplier),
    };
  }

  function isSameScore(
    left: { homeScore: number; awayScore: number },
    right: { homeScore: number; awayScore: number },
  ) {
    return left.homeScore === right.homeScore && left.awayScore === right.awayScore;
  }

  function buildScenarioScoreCandidates(matchId: string, ownPrediction?: StandingPredictionRow | null) {
    const match = matches.find((item) => item.id === matchId);
    const minHomeScore =
      match?.status === "LIVE" && match.homeScore !== null ? match.homeScore : 0;
    const minAwayScore =
      match?.status === "LIVE" && match.awayScore !== null ? match.awayScore : 0;
    const matchPredictions = allPredictionsForStandings.filter((prediction) => prediction.matchId === matchId);
    const maxPredictedGoals = Math.max(
      ownPrediction?.homeScore ?? 0,
      ownPrediction?.awayScore ?? 0,
      ...matchPredictions.flatMap((prediction) => [prediction.homeScore, prediction.awayScore]),
      6,
    );
    const maxGoals = Math.max(
      minHomeScore,
      minAwayScore,
      Math.min(12, Math.max(6, maxPredictedGoals + 2)),
    );
    const scoreKeys = new Set<string>();
    for (let home = minHomeScore; home <= maxGoals; home += 1) {
      for (let away = minAwayScore; away <= maxGoals; away += 1) {
        scoreKeys.add(`${home}:${away}`);
      }
    }
    for (const prediction of matchPredictions) {
      if (prediction.homeScore >= minHomeScore && prediction.awayScore >= minAwayScore) {
        scoreKeys.add(`${prediction.homeScore}:${prediction.awayScore}`);
      }
    }
    if (ownPrediction && ownPrediction.homeScore >= minHomeScore && ownPrediction.awayScore >= minAwayScore) {
      scoreKeys.add(`${ownPrediction.homeScore}:${ownPrediction.awayScore}`);
    }
    return Array.from(scoreKeys).map((key) => {
      const [homeScore, awayScore] = key.split(":").map(Number);
      return { homeScore, awayScore };
    });
  }

  function projectRowsAfterScenario(
    baseRows: StandingBaseRow[],
    match: (typeof matches)[number],
    official: { homeScore: number; awayScore: number },
  ) {
    const buckets = scoreBucketsForStage(match.stage);
    const projectedRows = baseRows.map((baseRow) => {
      const prediction = predictionByUserMatch.get(`${baseRow.userId}:${match.id}`);
      if (!prediction) return baseRow;
      const impact = scenarioImpact(prediction, match, official);
      const x2ConsumesGroupQuota = match.stage === "GROUP" && prediction.usedX2 && impact.basePoints > 0;
      return {
        ...baseRow,
        totalPoints: baseRow.totalPoints + impact.points,
        predictionCount: baseRow.predictionCount + 1,
        groupPoints: baseRow.groupPoints + (match.stage === "GROUP" ? impact.points : 0),
        knockoutPoints: baseRow.knockoutPoints + (match.stage === "GROUP" ? 0 : impact.points),
        perfectHits: baseRow.perfectHits + (impact.basePoints >= buckets.max ? 1 : 0),
        partialLevel2: baseRow.partialLevel2 + (impact.basePoints === buckets.p2 ? 1 : 0),
        partialLevel3: baseRow.partialLevel3 + (impact.basePoints === buckets.p3 ? 1 : 0),
        partialLevel4: baseRow.partialLevel4 + (impact.basePoints === buckets.p4 ? 1 : 0),
        x2UsedCount: baseRow.x2UsedCount + (x2ConsumesGroupQuota ? 1 : 0),
        x2LeftCount: Math.max(0, baseRow.x2LeftCount - (x2ConsumesGroupQuota ? 1 : 0)),
      };
    });
    return assignSharedPositions(projectedRows, true);
  }

  type ScenarioMatchResult = {
    match: (typeof matches)[number];
    official: { homeScore: number; awayScore: number };
  };

  function projectRowsAfterScenarioBlock(baseRows: StandingBaseRow[], scenarioResults: ScenarioMatchResult[]) {
    const projectedRows = baseRows.map((baseRow) => {
      let nextRow = baseRow;
      for (const scenarioResult of scenarioResults) {
        const prediction = predictionByUserMatch.get(`${baseRow.userId}:${scenarioResult.match.id}`);
        if (!prediction) continue;

        const impact = scenarioImpact(prediction, scenarioResult.match, scenarioResult.official);
        const buckets = scoreBucketsForStage(scenarioResult.match.stage);
        const x2ConsumesGroupQuota =
          scenarioResult.match.stage === "GROUP" && prediction.usedX2 && impact.basePoints > 0;

        nextRow = {
          ...nextRow,
          totalPoints: nextRow.totalPoints + impact.points,
          predictionCount: nextRow.predictionCount + 1,
          groupPoints: nextRow.groupPoints + (scenarioResult.match.stage === "GROUP" ? impact.points : 0),
          knockoutPoints: nextRow.knockoutPoints + (scenarioResult.match.stage === "GROUP" ? 0 : impact.points),
          perfectHits: nextRow.perfectHits + (impact.basePoints >= buckets.max ? 1 : 0),
          partialLevel2: nextRow.partialLevel2 + (impact.basePoints === buckets.p2 ? 1 : 0),
          partialLevel3: nextRow.partialLevel3 + (impact.basePoints === buckets.p3 ? 1 : 0),
          partialLevel4: nextRow.partialLevel4 + (impact.basePoints === buckets.p4 ? 1 : 0),
          x2UsedCount: nextRow.x2UsedCount + (x2ConsumesGroupQuota ? 1 : 0),
          x2LeftCount: Math.max(0, nextRow.x2LeftCount - (x2ConsumesGroupQuota ? 1 : 0)),
        };
      }
      return nextRow;
    });
    return assignSharedPositions(projectedRows, true);
  }

  function scenarioScoreLine(scenarioResults: ScenarioMatchResult[], matchId: string) {
    const result = scenarioResults.find((item) => item.match.id === matchId);
    if (!result) return null;
    return `${result.official.homeScore}-${result.official.awayScore}`;
  }

  function scenarioImpactForUser(userId: string, scenarioResults: ScenarioMatchResult[]) {
    return scenarioResults.reduce(
      (total, scenarioResult) => {
        const prediction = predictionByUserMatch.get(`${userId}:${scenarioResult.match.id}`);
        if (!prediction) return total;
        const impact = scenarioImpact(prediction, scenarioResult.match, scenarioResult.official);
        return {
          points: total.points + impact.points,
          basePoints: total.basePoints + impact.basePoints,
        };
      },
      { points: 0, basePoints: 0 },
    );
  }

  function buildScenarioBlocks(row: StandingBaseRow, matchBlock: typeof nextRankingMatchBlock) {
    const blocks: ScenarioMatchResult[][] = [];
    const candidatesByMatch = matchBlock.map((match) => ({
      match,
      candidates: buildScenarioScoreCandidates(match.id, predictionByUserMatch.get(`${row.userId}:${match.id}`)),
    }));
    const maxBlocks = 50000;

    function recurse(index: number, current: ScenarioMatchResult[]) {
      if (blocks.length >= maxBlocks) return;
      if (index >= candidatesByMatch.length) {
        blocks.push(current);
        return;
      }

      const item = candidatesByMatch[index];
      for (const official of item.candidates) {
        recurse(index + 1, [...current, { match: item.match, official }]);
        if (blocks.length >= maxBlocks) return;
      }
    }

    recurse(0, []);
    return {
      blocks,
      truncated: blocks.length >= maxBlocks,
    };
  }

  function buildNextMatchPath(row: StandingBaseRow): NextMatchPath | null {
    if (!nextRankingMatch) return null;
    const cutRow = cutoffBettorStandings.find((standingRow) => standingRow.userId === row.userId) ?? row;
    const locked = nextRankingMatchBlock.every((match) => isScenarioLocked(match));
    const currentCutPosition = cutRow.position;
    const liveScoreLineForMatch = (match: (typeof matches)[number]) =>
      match.status === "LIVE" && match.homeScore !== null && match.awayScore !== null
        ? `${match.homeScore}-${match.awayScore}`
        : null;
    const simultaneousFallback = nextRankingMatchBlock
      .filter((match) => match.id !== nextRankingMatch.id)
      .map((match) => {
        const ownBlockPrediction = predictionByUserMatch.get(`${row.userId}:${match.id}`);
        return {
          matchNumber: match.matchNumber,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          scoreLine: null,
          ownScoreLine: ownBlockPrediction ? `${ownBlockPrediction.homeScore}-${ownBlockPrediction.awayScore}` : null,
          liveScoreLine: liveScoreLineForMatch(match),
          ownPoints: 0,
        };
      });

    if (!locked) {
      return {
        matchNumber: nextRankingMatch.matchNumber,
        homeTeam: nextRankingMatch.homeTeam,
        awayTeam: nextRankingMatch.awayTeam,
        kickoff: nextRankingMatch.kickoff.toISOString(),
        simultaneousMatches: simultaneousFallback,
        locked,
        hasOwnPrediction: false,
        currentCutPosition,
        bestPosition: currentCutPosition,
        positionGain: 0,
        scoreLine: null,
        ownScoreLine: null,
        liveScoreLine: liveScoreLineForMatch(nextRankingMatch),
        recommendedDiffersFromPick: false,
        ownPoints: 0,
        ownBasePoints: 0,
        ownUsesX2: false,
        actions: [
          "El partido sigue abierto: no se calculan escenarios con picks guardados.",
          "Cuando se bloqueen los picks, se mostrará el mejor escenario sin exponer datos antes de tiempo.",
        ],
        rivalConditions: [
          "Mientras el partido esté abierto, los rivales cercanos todavía pueden editar marcador o activar X2.",
          "El cálculo preciso se habilita al bloqueo del partido.",
        ],
        note: "Detalle limitado para no revelar picks abiertos de ningún usuario.",
      };
    }

    const ownPrediction = predictionByUserMatch.get(`${row.userId}:${nextRankingMatch.id}`);

    if (!ownPrediction) {
      return {
        matchNumber: nextRankingMatch.matchNumber,
        homeTeam: nextRankingMatch.homeTeam,
        awayTeam: nextRankingMatch.awayTeam,
        kickoff: nextRankingMatch.kickoff.toISOString(),
        simultaneousMatches: simultaneousFallback,
        locked,
        hasOwnPrediction: false,
        currentCutPosition,
        bestPosition: currentCutPosition,
        positionGain: 0,
        scoreLine: null,
        ownScoreLine: null,
        liveScoreLine: liveScoreLineForMatch(nextRankingMatch),
        recommendedDiffersFromPick: false,
        ownPoints: 0,
        ownBasePoints: 0,
        ownUsesX2: false,
        actions: ["No tiene pick guardado para este partido."],
        rivalConditions: ["Sin pick propio no hay salto calculable para el siguiente partido."],
        note: "No tiene pick guardado para el siguiente partido.",
      };
    }

    let best:
      | {
          scenarioResults: ScenarioMatchResult[];
          projectedRows: StandingBaseRow[];
          selectedRow: StandingBaseRow;
          ownImpact: { points: number; basePoints: number };
        }
      | null = null;

    const scenarioBlocks = buildScenarioBlocks(row, nextRankingMatchBlock);
    for (const scenarioResults of scenarioBlocks.blocks) {
      const projectedRows =
        scenarioResults.length === 1
          ? projectRowsAfterScenario(cutoffBettorStandings, nextRankingMatch, scenarioResults[0].official)
          : projectRowsAfterScenarioBlock(cutoffBettorStandings, scenarioResults);
      const selectedRow = projectedRows.find((standingRow) => standingRow.userId === row.userId);
      if (!selectedRow) continue;
      const ownImpact = scenarioImpactForUser(row.userId, scenarioResults);
      const mainOfficial = scenarioResults.find((scenarioResult) => scenarioResult.match.id === nextRankingMatch.id)?.official;
      const bestMainOfficial = best?.scenarioResults.find(
        (scenarioResult) => scenarioResult.match.id === nextRankingMatch.id,
      )?.official;
      if (
        !best ||
        selectedRow.position < best.selectedRow.position ||
        (selectedRow.position === best.selectedRow.position && ownImpact.points > best.ownImpact.points) ||
        (selectedRow.position === best.selectedRow.position &&
          ownImpact.points === best.ownImpact.points &&
          Boolean(mainOfficial) &&
          isSameScore(mainOfficial as { homeScore: number; awayScore: number }, {
            homeScore: ownPrediction.homeScore,
            awayScore: ownPrediction.awayScore,
          }) &&
          !isSameScore(bestMainOfficial ?? { homeScore: -1, awayScore: -1 }, {
            homeScore: ownPrediction.homeScore,
            awayScore: ownPrediction.awayScore,
          }))
      ) {
        best = { scenarioResults, projectedRows, selectedRow, ownImpact };
      }
    }

    if (!best) return null;

    const scoreLine = scenarioScoreLine(best.scenarioResults, nextRankingMatch.id);
    const ownScoreLine = `${ownPrediction.homeScore}-${ownPrediction.awayScore}`;
    const liveScoreLine = liveScoreLineForMatch(nextRankingMatch);
    const recommendedDiffersFromPick = scoreLine !== ownScoreLine;
    const simultaneousMatches = nextRankingMatchBlock
      .filter((match) => match.id !== nextRankingMatch.id)
      .map((match) => {
        const ownBlockPrediction = predictionByUserMatch.get(`${row.userId}:${match.id}`);
        const result = best.scenarioResults.find((scenarioResult) => scenarioResult.match.id === match.id);
        const ownBlockImpact =
          ownBlockPrediction && result ? scenarioImpact(ownBlockPrediction, match, result.official) : { points: 0 };
        return {
          matchNumber: match.matchNumber,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          scoreLine: result ? `${result.official.homeScore}-${result.official.awayScore}` : null,
          ownScoreLine: ownBlockPrediction ? `${ownBlockPrediction.homeScore}-${ownBlockPrediction.awayScore}` : null,
          liveScoreLine: liveScoreLineForMatch(match),
          ownPoints: ownBlockImpact.points,
        };
      });
    const actions = [
      `Su pick fue ${ownScoreLine}.`,
      ...(liveScoreLine
        ? [`Marcador en vivo actual: ${liveScoreLine}. Solo se simulan finales posibles desde ese marcador.`]
        : []),
      `Necesita que ${nextRankingMatch.homeTeam} vs ${nextRankingMatch.awayTeam} termine ${scoreLine}.`,
      `Con el bloque suma ${best.ownImpact.points} pts (${best.ownImpact.basePoints} base${ownPrediction.usedX2 ? " con X2 en el partido principal" : ""}).`,
    ];
    for (const simultaneousMatch of simultaneousMatches) {
      actions.push(
        `En simultaneo: P${simultaneousMatch.matchNumber} ${simultaneousMatch.homeTeam} vs ${simultaneousMatch.awayTeam} debe terminar ${simultaneousMatch.scoreLine ?? "sin escenario"}.`,
      );
    }
    if (recommendedDiffersFromPick) {
      actions.push(
        `El escenario óptimo no coincide con su pick (${ownScoreLine}) porque también se proyectan los puntos y posiciones de los rivales.`,
      );
    }
    if (ownPrediction.usedX2) {
      actions.push("Su X2 debe sumar puntos base; si queda en 0 base, se devuelve y no empuja el salto.");
    }

    const projectedByUser = new Map(best.projectedRows.map((projectedRow) => [projectedRow.userId, projectedRow]));
    const selectedProjected = best.selectedRow;
    const relevantRivals = cutoffBettorStandings
      .filter((standingRow) => standingRow.userId !== row.userId)
      .map((standingRow) => ({
        cut: standingRow,
        projected: projectedByUser.get(standingRow.userId) ?? standingRow,
        predictions: best.scenarioResults
          .map((scenarioResult) => ({
            scenarioResult,
            prediction: predictionByUserMatch.get(`${standingRow.userId}:${scenarioResult.match.id}`),
          }))
          .filter((item) => item.prediction),
      }))
      .filter(({ cut, projected }) => {
        if (projected.position <= selectedProjected.position) return true;
        if (cut.position <= currentCutPosition) return true;
        if (projected.totalPoints >= selectedProjected.totalPoints - 5) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.projected.position !== b.projected.position) return a.projected.position - b.projected.position;
        if (b.projected.totalPoints !== a.projected.totalPoints) return b.projected.totalPoints - a.projected.totalPoints;
        return a.cut.sortOrder - b.cut.sortOrder;
      })
      .slice(0, 8);

    const rivalConditions = relevantRivals.map(({ cut, projected, predictions }) => {
      const name = displayName(cut);
      const relation =
        projected.position < selectedProjected.position
          ? `queda por encima (#${projected.position})`
        : projected.position === selectedProjected.position
            ? `comparte la posición #${projected.position}`
            : `queda detrás (#${projected.position})`;
      if (predictions.length === 0) {
        return `${name} no tiene pick en este bloque; se queda en ${projected.totalPoints} pts y ${relation}.`;
      }
      const totalImpact = scenarioImpactForUser(cut.userId, best.scenarioResults);
      const pickText = predictions
        .map(({ scenarioResult, prediction }) => {
          if (!prediction) return null;
          const impact = scenarioImpact(prediction, scenarioResult.match, scenarioResult.official);
          const x2Text = prediction.usedX2
            ? impact.basePoints > 0
              ? " X2 aplicado"
              : " X2 devuelto"
            : "";
          return `P${scenarioResult.match.matchNumber} puso ${prediction.homeScore}-${prediction.awayScore}, suma ${impact.points}${x2Text}`;
        })
        .filter((text): text is string => Boolean(text))
        .join("; ");
      return `${name}: ${pickText}. En el bloque agrega ${totalImpact.points} pts, llega a ${projected.totalPoints} pts y ${relation}.`;
    });

    return {
      matchNumber: nextRankingMatch.matchNumber,
      homeTeam: nextRankingMatch.homeTeam,
      awayTeam: nextRankingMatch.awayTeam,
      kickoff: nextRankingMatch.kickoff.toISOString(),
      simultaneousMatches,
      locked,
      hasOwnPrediction: true,
      currentCutPosition,
      bestPosition: best.selectedRow.position,
      positionGain: Math.max(0, currentCutPosition - best.selectedRow.position),
      scoreLine,
      ownScoreLine,
      liveScoreLine,
      recommendedDiffersFromPick,
      ownPoints: best.ownImpact.points,
      ownBasePoints: best.ownImpact.basePoints,
      ownUsesX2: ownPrediction.usedX2,
      actions,
      rivalConditions,
      note: scenarioBlocks.truncated
        ? "Calculado con limite de escenarios para mantener la pantalla rapida. No incluye puntos de goleadores, porque dependen de anotadores oficiales."
        : nextRankingMatchBlock.length > 1
          ? "Calculado evaluando combinaciones del bloque simultaneo contra todos los picks disponibles. No incluye puntos de goleadores, porque dependen de anotadores oficiales."
          : "Calculado evaluando todos los marcadores candidatos contra todos los picks disponibles. No incluye puntos de goleadores, porque dependen de anotadores oficiales.",
    };
  }

  const baseBettorStandings = buildBettorStandings(allPredictionsForStandings);
  const bettorStandings = baseBettorStandings.map((row) => {
    const previousPosition = movementPositionByUser.get(row.userId) ?? row.position;
    const movement: "UP" | "DOWN" | "SAME" =
      previousPosition > row.position ? "UP" : previousPosition < row.position ? "DOWN" : "SAME";
    const remainingPotentialPoints = calculateRemainingPotential(row.userId, row);
    return {
      ...row,
      previousPosition,
      movementReferenceLabel,
      movement,
      movementDelta: Math.abs(previousPosition - row.position),
      remainingPotentialPoints,
      podiumPaths: buildPodiumPaths(row, baseBettorStandings, remainingPotentialPoints),
      nextMatchPath: buildNextMatchPath(row),
      lastFive: lastFiveFinalMatches.map((match) => {
        const prediction = predictionByUserMatch.get(`${row.userId}:${match.id}`);
        if (!prediction) {
          return {
            matchNumber: match.matchNumber,
            status: "MISS" as const,
            points: 0,
          };
        }
        const basePoints = prediction.basePoints ?? 0;
        const maxPoints = scoreBucketsForStage(match.stage).max;
        return {
          matchNumber: match.matchNumber,
          status:
            basePoints >= maxPoints
              ? ("MAX" as const)
              : (prediction.points ?? 0) > 0
                ? ("POINTS" as const)
                : ("ZERO" as const),
          points: prediction.points ?? 0,
        };
      }),
    };
  });

  return (
    <PronosticoClient
      user={user}
      paymentConfig={serializedPaymentConfig}
      matches={serializedMatches}
      scoringRule={serializedScoringRule}
      proofs={serializedProofs}
      bettorStandings={bettorStandings}
      rankingStarted={rankingStarted}
      hasLiveMatches={hasLiveMatches}
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
        topGroupEnabled: bonusConfig.topGroupEnabled,
        topRoundOf32Enabled: bonusConfig.topRoundOf32Enabled,
        topRoundOf16Enabled: bonusConfig.topRoundOf16Enabled,
        topQuarterFinalEnabled: bonusConfig.topQuarterFinalEnabled,
        topSemiFinalEnabled: bonusConfig.topSemiFinalEnabled,
        topThirdPlaceEnabled: bonusConfig.topThirdPlaceEnabled,
        topFinalEnabled: bonusConfig.topFinalEnabled,
        x2UsesGroup: bonusConfig.x2UsesGroup,
        scorerPoint: bonusConfig.scorerPoint,
      }}
      uiConfig={{
        groupStandingsVisible: uiConfig.groupStandingsVisible,
      }}
      teamPlayersByCode={teamPlayersByCode}
      serverNowIso={serverNowIso}
    />
  );
}
