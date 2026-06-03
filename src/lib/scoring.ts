import { Match, MatchStage, Prediction, ScoringRule } from "@prisma/client";

function outcome(home: number, away: number) {
  if (home > away) return 1;
  if (home < away) return -1;
  return 0;
}

type ScoreInput = {
  homeScore: number;
  awayScore: number;
};

function applyKnockoutMultiplier(
  points: number,
  stage: MatchStage,
  rule: ScoringRule,
) {
  if (!rule.officialModeEnabled) return points;
  if (stage === "GROUP") return points;
  return points * Math.max(1, rule.knockoutMultiplier);
}

function calculateOfficialRulePoints(
  prediction: ScoreInput,
  official: ScoreInput,
  stage: MatchStage,
  rule: ScoringRule,
) {
  // Reglamento oficial: resultado + goles local + goles visitante + diferencia
  let points = 0;
  if (outcome(prediction.homeScore, prediction.awayScore) === outcome(official.homeScore, official.awayScore)) {
    points += rule.outcomePoints;
  }
  if (prediction.homeScore === official.homeScore) {
    points += rule.singleTeamGoalsPoints;
  }
  if (prediction.awayScore === official.awayScore) {
    points += rule.singleTeamGoalsPoints;
  }
  if (prediction.homeScore - prediction.awayScore === official.homeScore - official.awayScore) {
    points += rule.goalDifferencePoints;
  }
  if (official.homeScore === official.awayScore && prediction.homeScore === prediction.awayScore) {
    points += rule.drawOutcomeBonus;
  }
  return applyKnockoutMultiplier(points, stage, rule);
}

export function calculatePredictionPoints(
  prediction: ScoreInput,
  official: ScoreInput,
  rule: ScoringRule,
  stage: MatchStage = "GROUP",
) {
  if (rule.officialModeEnabled) {
    return calculateOfficialRulePoints(prediction, official, stage, rule);
  }

  let points = 0;

  if (prediction.homeScore === official.homeScore && prediction.awayScore === official.awayScore) {
    points += rule.exactScorePoints;
  } else {
    const predictionDiff = prediction.homeScore - prediction.awayScore;
    const officialDiff = official.homeScore - official.awayScore;
    if (predictionDiff === officialDiff) {
      points += rule.goalDifferencePoints;
    }

    if (outcome(prediction.homeScore, prediction.awayScore) === outcome(official.homeScore, official.awayScore)) {
      points += rule.outcomePoints;
    }
  }

  if (prediction.homeScore === official.homeScore) {
    points += rule.singleTeamGoalsPoints;
  }
  if (prediction.awayScore === official.awayScore) {
    points += rule.singleTeamGoalsPoints;
  }
  if (official.homeScore === official.awayScore && prediction.homeScore === prediction.awayScore) {
    points += rule.drawOutcomeBonus;
  }

  return points;
}

export function hasOfficialResult(match: Match) {
  return (
    match.status === "FINAL" &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
}

export function calculatePointsForPrediction(
  prediction: Prediction,
  match: Match,
  rule: ScoringRule,
) {
  if (!hasOfficialResult(match)) return 0;
  return calculatePredictionPoints(
    { homeScore: prediction.homeScore, awayScore: prediction.awayScore },
    { homeScore: match.homeScore as number, awayScore: match.awayScore as number },
    rule,
    match.stage,
  );
}
