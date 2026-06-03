import {
  BonusConfig,
  MatchOfficialScorer,
  MatchStage,
  Prediction,
  PredictionScorerPick,
  ScoringRule,
  TeamSide,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { calculatePredictionPoints } from "@/lib/scoring";

export type BonusKind = "x2" | "top" | "scorers";

export type CalculatedBonusPoints = {
  basePoints: number;
  scorerPoints: number;
  bonusPoints: number;
  appliedMultiplier: number;
  topApplied: boolean;
  totalPoints: number;
};

export type PredictionBonusSnapshot = Pick<
  Prediction,
  "usedX2" | "x2Returned" | "topApplied" | "appliedMultiplier" | "scorerPointApplied"
>;

const DEFAULT_BONUS_CONFIG_CREATE = {
  id: 1,
  x2EnabledGlobal: true,
  x2GroupEnabled: true,
  x2RoundOf32Enabled: false,
  x2RoundOf16Enabled: false,
  x2QuarterFinalEnabled: false,
  x2SemiFinalEnabled: false,
  x2ThirdPlaceEnabled: false,
  x2FinalEnabled: false,
  topMatchEnabledGlobal: true,
  topGroupEnabled: true,
  topRoundOf32Enabled: true,
  topRoundOf16Enabled: true,
  topQuarterFinalEnabled: true,
  topSemiFinalEnabled: true,
  topThirdPlaceEnabled: true,
  topFinalEnabled: true,
  topMatchAllowCombinationWithX2: false,
  scorersEnabledGlobal: true,
  scorersGroupEnabled: false,
  scorersRoundOf32Enabled: true,
  scorersRoundOf16Enabled: true,
  scorersQuarterFinalEnabled: true,
  scorersSemiFinalEnabled: true,
  scorersThirdPlaceEnabled: true,
  scorersFinalEnabled: true,
  x2UsesGroup: 12,
  topMultiplier: 1.5,
  scorerPoint: 1,
  activatedAt: new Date(),
};

export async function getOrCreateBonusConfig() {
  return prisma.bonusConfig.upsert({
    where: { id: 1 },
    update: {},
    create: DEFAULT_BONUS_CONFIG_CREATE,
  });
}

function phaseField(kind: BonusKind, stage: MatchStage): keyof BonusConfig {
  if (kind === "x2") {
    if (stage === "GROUP") return "x2GroupEnabled";
    if (stage === "ROUND_OF_32") return "x2RoundOf32Enabled";
    if (stage === "ROUND_OF_16") return "x2RoundOf16Enabled";
    if (stage === "QUARTER_FINAL") return "x2QuarterFinalEnabled";
    if (stage === "SEMI_FINAL") return "x2SemiFinalEnabled";
    if (stage === "THIRD_PLACE") return "x2ThirdPlaceEnabled";
    return "x2FinalEnabled";
  }

  if (kind === "top") {
    if (stage === "GROUP") return "topGroupEnabled";
    if (stage === "ROUND_OF_32") return "topRoundOf32Enabled";
    if (stage === "ROUND_OF_16") return "topRoundOf16Enabled";
    if (stage === "QUARTER_FINAL") return "topQuarterFinalEnabled";
    if (stage === "SEMI_FINAL") return "topSemiFinalEnabled";
    if (stage === "THIRD_PLACE") return "topThirdPlaceEnabled";
    return "topFinalEnabled";
  }

  if (stage === "GROUP") return "scorersGroupEnabled";
  if (stage === "ROUND_OF_32") return "scorersRoundOf32Enabled";
  if (stage === "ROUND_OF_16") return "scorersRoundOf16Enabled";
  if (stage === "QUARTER_FINAL") return "scorersQuarterFinalEnabled";
  if (stage === "SEMI_FINAL") return "scorersSemiFinalEnabled";
  if (stage === "THIRD_PLACE") return "scorersThirdPlaceEnabled";
  return "scorersFinalEnabled";
}

export function isBonusEnabledForStage(
  config: BonusConfig,
  kind: BonusKind,
  stage: MatchStage,
) {
  const globalField =
    kind === "x2"
      ? "x2EnabledGlobal"
      : kind === "top"
        ? "topMatchEnabledGlobal"
        : "scorersEnabledGlobal";
  return Boolean(config[globalField] && config[phaseField(kind, stage)]);
}

export function isFutureMatchForActivation(matchKickoff: Date, activation: Date) {
  return matchKickoff.getTime() > activation.getTime();
}

function countByPlayer(
  items: Array<{ teamSide: TeamSide; playerId: number }>,
  side: TeamSide,
) {
  const map = new Map<number, number>();
  for (const item of items) {
    if (item.teamSide !== side) continue;
    map.set(item.playerId, (map.get(item.playerId) ?? 0) + 1);
  }
  return map;
}

function sideHits(
  picks: Array<{ teamSide: TeamSide; playerId: number }>,
  official: Array<{ teamSide: TeamSide; playerId: number }>,
  side: TeamSide,
) {
  const pickCounts = countByPlayer(picks, side);
  const officialCounts = countByPlayer(official, side);
  let hits = 0;
  for (const [playerId, amount] of pickCounts.entries()) {
    hits += Math.min(amount, officialCounts.get(playerId) ?? 0);
  }
  return hits;
}

export function calculateScorerHits(
  picks: Array<Pick<PredictionScorerPick, "teamSide" | "playerId">>,
  officialScorers: Array<Pick<MatchOfficialScorer, "teamSide" | "playerId">>,
) {
  return (
    sideHits(picks, officialScorers, TeamSide.HOME) +
    sideHits(picks, officialScorers, TeamSide.AWAY)
  );
}

export function calculatePointsWithBonuses(input: {
  prediction: { homeScore: number; awayScore: number };
  official: { homeScore: number; awayScore: number };
  rule: ScoringRule;
  stage: MatchStage;
  usedX2: boolean;
  topApplied: boolean;
  topMultiplier: number;
  scorerHitCount: number;
  scorerPoint: number;
}) {
  const basePoints = calculatePredictionPoints(input.prediction, input.official, input.rule, input.stage);
  let appliedMultiplier = 1;
  if (input.usedX2) appliedMultiplier *= 2;
  if (input.topApplied) appliedMultiplier *= input.topMultiplier;
  const multipliedPoints = Math.round(basePoints * appliedMultiplier);
  const scorerPoints = input.scorerHitCount * input.scorerPoint;
  const totalPoints = multipliedPoints + scorerPoints;
  return {
    basePoints,
    scorerPoints,
    bonusPoints: totalPoints - basePoints,
    appliedMultiplier,
    topApplied: input.topApplied,
    totalPoints,
  } satisfies CalculatedBonusPoints;
}

export function calculatePointsFromSnapshot(input: {
  prediction: { homeScore: number; awayScore: number };
  official: { homeScore: number; awayScore: number };
  rule: ScoringRule;
  stage: MatchStage;
  snapshot: PredictionBonusSnapshot;
  scorerHitCount: number;
}) {
  const basePoints = calculatePredictionPoints(input.prediction, input.official, input.rule, input.stage);
  const scorerPoints = input.scorerHitCount * Math.max(0, input.snapshot.scorerPointApplied);
  const safeMultiplier = Math.max(1, input.snapshot.appliedMultiplier || 1);
  const multipliedPoints = Math.round(basePoints * safeMultiplier);
  const totalPoints = multipliedPoints + scorerPoints;
  const x2Returned = input.snapshot.usedX2 && basePoints === 0;

  return {
    basePoints,
    scorerPoints,
    bonusPoints: totalPoints - basePoints,
    appliedMultiplier: safeMultiplier,
    topApplied: input.snapshot.topApplied,
    totalPoints,
    x2Returned,
  } satisfies CalculatedBonusPoints & { x2Returned: boolean };
}
