import { MatchStage, MatchStatus, TeamSide } from "@prisma/client";

export type KnockoutMatchSnapshot = {
  id: string;
  matchNumber: number;
  stage: MatchStage;
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  advancedTeamSide?: TeamSide | null;
};

type TeamRef = {
  team: string;
  code: string | null;
};

type MatchAssignment = {
  homeTeam: string;
  homeTeamCode: string | null;
  awayTeam: string;
  awayTeamCode: string | null;
};

function byMatchNumber(matches: KnockoutMatchSnapshot[]) {
  const map = new Map<number, KnockoutMatchSnapshot>();
  for (const match of matches) {
    map.set(match.matchNumber, match);
  }
  return map;
}

function winnerOf(match: KnockoutMatchSnapshot | undefined): TeamRef | null {
  if (!match) return null;
  if (match.status !== "FINAL") return null;
  if (match.homeScore === null || match.awayScore === null) return null;
  if (match.homeScore > match.awayScore || (match.homeScore === match.awayScore && match.advancedTeamSide === TeamSide.HOME)) {
    return { team: match.homeTeam, code: match.homeTeamCode };
  }
  if (match.homeScore < match.awayScore || (match.homeScore === match.awayScore && match.advancedTeamSide === TeamSide.AWAY)) {
    return { team: match.awayTeam, code: match.awayTeamCode };
  }
  return null;
}

function loserOf(match: KnockoutMatchSnapshot | undefined): TeamRef | null {
  if (!match) return null;
  if (match.status !== "FINAL") return null;
  if (match.homeScore === null || match.awayScore === null) return null;
  if (match.homeScore < match.awayScore || (match.homeScore === match.awayScore && match.advancedTeamSide === TeamSide.AWAY)) {
    return { team: match.homeTeam, code: match.homeTeamCode };
  }
  if (match.homeScore > match.awayScore || (match.homeScore === match.awayScore && match.advancedTeamSide === TeamSide.HOME)) {
    return { team: match.awayTeam, code: match.awayTeamCode };
  }
  return null;
}
function pairing(home: TeamRef | null, away: TeamRef | null): MatchAssignment | null {
  if (!home || !away) return null;
  return {
    homeTeam: home.team,
    homeTeamCode: home.code,
    awayTeam: away.team,
    awayTeamCode: away.code,
  };
}

export function computeKnockoutAssignments(matches: KnockoutMatchSnapshot[]): Map<number, MatchAssignment> {
  const assignments = new Map<number, MatchAssignment>();
  const map = byMatchNumber(matches);

  const w74 = winnerOf(map.get(74));
  const w77 = winnerOf(map.get(77));
  const w73 = winnerOf(map.get(73));
  const w75 = winnerOf(map.get(75));
  const w76 = winnerOf(map.get(76));
  const w78 = winnerOf(map.get(78));
  const w79 = winnerOf(map.get(79));
  const w80 = winnerOf(map.get(80));
  const w83 = winnerOf(map.get(83));
  const w84 = winnerOf(map.get(84));
  const w81 = winnerOf(map.get(81));
  const w82 = winnerOf(map.get(82));
  const w86 = winnerOf(map.get(86));
  const w88 = winnerOf(map.get(88));
  const w85 = winnerOf(map.get(85));
  const w87 = winnerOf(map.get(87));

  const r16: Array<[number, MatchAssignment | null]> = [
    [89, pairing(w74, w77)],
    [90, pairing(w73, w75)],
    [91, pairing(w76, w78)],
    [92, pairing(w79, w80)],
    [93, pairing(w83, w84)],
    [94, pairing(w81, w82)],
    [95, pairing(w86, w88)],
    [96, pairing(w85, w87)],
  ];
  for (const [matchNo, pair] of r16) {
    if (pair) assignments.set(matchNo, pair);
  }

  const w89 = winnerOf(map.get(89));
  const w90 = winnerOf(map.get(90));
  const w91 = winnerOf(map.get(91));
  const w92 = winnerOf(map.get(92));
  const w93 = winnerOf(map.get(93));
  const w94 = winnerOf(map.get(94));
  const w95 = winnerOf(map.get(95));
  const w96 = winnerOf(map.get(96));

  const quarter: Array<[number, MatchAssignment | null]> = [
    [97, pairing(w89, w90)],
    [98, pairing(w93, w94)],
    [99, pairing(w91, w92)],
    [100, pairing(w95, w96)],
  ];
  for (const [matchNo, pair] of quarter) {
    if (pair) assignments.set(matchNo, pair);
  }

  const w97 = winnerOf(map.get(97));
  const w98 = winnerOf(map.get(98));
  const w99 = winnerOf(map.get(99));
  const w100 = winnerOf(map.get(100));

  const semis: Array<[number, MatchAssignment | null]> = [
    [101, pairing(w97, w98)],
    [102, pairing(w99, w100)],
  ];
  for (const [matchNo, pair] of semis) {
    if (pair) assignments.set(matchNo, pair);
  }

  const w101 = winnerOf(map.get(101));
  const w102 = winnerOf(map.get(102));
  const l101 = loserOf(map.get(101));
  const l102 = loserOf(map.get(102));

  const finals: Array<[number, MatchAssignment | null]> = [
    [103, pairing(l101, l102)],
    [104, pairing(w101, w102)],
  ];
  for (const [matchNo, pair] of finals) {
    if (pair) assignments.set(matchNo, pair);
  }

  return assignments;
}
