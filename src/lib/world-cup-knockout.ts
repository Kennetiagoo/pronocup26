import { MatchStage, MatchStatus } from "@prisma/client";

import {
  buildWorldCupGroupStandings,
  rankThirdPlacedTeams,
  WorldCupGroupMatch,
  WorldCupTeamRankingContext,
} from "@/lib/world-cup-regulations";

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

const THIRD_OPPONENT_GROUPS: Record<string, string[]> = {
  "1A": ["C", "E", "F", "H", "I"],
  "1B": ["E", "F", "G", "I", "J"],
  "1D": ["B", "E", "F", "I", "J"],
  "1E": ["A", "B", "C", "D", "F"],
  "1G": ["A", "E", "H", "I", "J"],
  "1I": ["C", "D", "F", "G", "H"],
  "1K": ["D", "E", "I", "J", "L"],
  "1L": ["E", "H", "I", "J", "K"],
};

// Deterministic preference order tuned to keep the assignment stable.
const THIRD_SLOT_PREFERENCE: Record<string, string[]> = {
  "1A": ["H", "E", "C", "I", "F"],
  "1B": ["J", "G", "E", "I", "F"],
  "1D": ["B", "E", "I", "F", "J"],
  "1E": ["F", "D", "C", "B", "A"],
  "1G": ["A", "H", "E", "I", "J"],
  "1I": ["F", "G", "D", "C", "H"],
  "1K": ["D", "E", "I", "J", "L"],
  "1L": ["E", "H", "C", "G", "K"],
};

const THIRD_SLOT_ORDER: Array<keyof typeof THIRD_OPPONENT_GROUPS> = [
  "1E",
  "1I",
  "1A",
  "1B",
  "1D",
  "1G",
  "1K",
  "1L",
];

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
  if (match.homeScore === match.awayScore) return null;
  if (match.homeScore > match.awayScore) {
    return { team: match.homeTeam, code: match.homeTeamCode };
  }
  return { team: match.awayTeam, code: match.awayTeamCode };
}

function loserOf(match: KnockoutMatchSnapshot | undefined): TeamRef | null {
  if (!match) return null;
  if (match.status !== "FINAL") return null;
  if (match.homeScore === null || match.awayScore === null) return null;
  if (match.homeScore === match.awayScore) return null;
  if (match.homeScore < match.awayScore) {
    return { team: match.homeTeam, code: match.homeTeamCode };
  }
  return { team: match.awayTeam, code: match.awayTeamCode };
}

function assignThirdOpponents(
  thirdQualifiedByGroup: Map<string, TeamRef>,
): Map<string, TeamRef> | null {
  const availableGroups = new Set(thirdQualifiedByGroup.keys());
  const assignment = new Map<string, string>();

  function sortCandidates(slot: string, groups: string[]) {
    const preference = THIRD_SLOT_PREFERENCE[slot] ?? [];
    return groups.slice().sort((a, b) => {
      const aPref = preference.indexOf(a);
      const bPref = preference.indexOf(b);
      const aRank = aPref === -1 ? Number.MAX_SAFE_INTEGER : aPref;
      const bRank = bPref === -1 ? Number.MAX_SAFE_INTEGER : bPref;
      if (aRank !== bRank) return aRank - bRank;
      return a.localeCompare(b, "es");
    });
  }

  function recurse(slotIdx: number): boolean {
    if (slotIdx >= THIRD_SLOT_ORDER.length) return true;

    // Use the first unfilled slot with fewer available candidates.
    const unresolved = THIRD_SLOT_ORDER.filter((slot) => !assignment.has(slot));
    unresolved.sort((slotA, slotB) => {
      const candidatesA = (THIRD_OPPONENT_GROUPS[slotA] ?? []).filter((group) => availableGroups.has(group));
      const candidatesB = (THIRD_OPPONENT_GROUPS[slotB] ?? []).filter((group) => availableGroups.has(group));
      return candidatesA.length - candidatesB.length;
    });

    const slot = unresolved[0];
    if (!slot) return true;

    const rawCandidates = (THIRD_OPPONENT_GROUPS[slot] ?? []).filter((group) => availableGroups.has(group));
    const candidates = sortCandidates(slot, rawCandidates);

    for (const candidateGroup of candidates) {
      assignment.set(slot, candidateGroup);
      availableGroups.delete(candidateGroup);

      if (recurse(slotIdx + 1)) return true;

      availableGroups.add(candidateGroup);
      assignment.delete(slot);
    }

    return false;
  }

  if (!recurse(0)) return null;

  const resolved = new Map<string, TeamRef>();
  for (const [slot, group] of assignment.entries()) {
    const team = thirdQualifiedByGroup.get(group);
    if (!team) continue;
    resolved.set(slot, team);
  }

  return resolved;
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

export function computeKnockoutAssignments(
  matches: KnockoutMatchSnapshot[],
  context?: WorldCupTeamRankingContext,
): Map<number, MatchAssignment> {
  const assignments = new Map<number, MatchAssignment>();
  const map = byMatchNumber(matches);

  const groupStandings = buildWorldCupGroupStandings(matches as WorldCupGroupMatch[], context);
  const winners = new Map<string, TeamRef>();
  const runners = new Map<string, TeamRef>();

  for (const group of groupStandings) {
    const first = group.rows[0];
    const second = group.rows[1];
    if (first) winners.set(group.groupName, { team: first.team, code: first.teamCode });
    if (second) runners.set(group.groupName, { team: second.team, code: second.teamCode });
  }

  const rankedThirds = rankThirdPlacedTeams(groupStandings, context).slice(0, 8);
  const thirdQualifiedByGroup = new Map<string, TeamRef>();
  for (const third of rankedThirds) {
    thirdQualifiedByGroup.set(third.groupName, { team: third.team, code: third.teamCode });
  }

  const thirdAssignments = assignThirdOpponents(thirdQualifiedByGroup);

  const m73 = pairing(runners.get("A") ?? null, runners.get("B") ?? null);
  const m74 = pairing(winners.get("E") ?? null, thirdAssignments?.get("1E") ?? null);
  const m75 = pairing(winners.get("F") ?? null, runners.get("C") ?? null);
  const m76 = pairing(winners.get("C") ?? null, runners.get("F") ?? null);
  const m77 = pairing(winners.get("I") ?? null, thirdAssignments?.get("1I") ?? null);
  const m78 = pairing(runners.get("E") ?? null, runners.get("I") ?? null);
  const m79 = pairing(winners.get("A") ?? null, thirdAssignments?.get("1A") ?? null);
  const m80 = pairing(winners.get("L") ?? null, thirdAssignments?.get("1L") ?? null);
  const m81 = pairing(winners.get("D") ?? null, thirdAssignments?.get("1D") ?? null);
  const m82 = pairing(winners.get("G") ?? null, thirdAssignments?.get("1G") ?? null);
  const m83 = pairing(runners.get("K") ?? null, runners.get("L") ?? null);
  const m84 = pairing(winners.get("H") ?? null, runners.get("J") ?? null);
  const m85 = pairing(winners.get("B") ?? null, thirdAssignments?.get("1B") ?? null);
  const m86 = pairing(winners.get("J") ?? null, runners.get("H") ?? null);
  const m87 = pairing(winners.get("K") ?? null, thirdAssignments?.get("1K") ?? null);
  const m88 = pairing(runners.get("D") ?? null, runners.get("G") ?? null);

  const round32: Array<[number, MatchAssignment | null]> = [
    [73, m73],
    [74, m74],
    [75, m75],
    [76, m76],
    [77, m77],
    [78, m78],
    [79, m79],
    [80, m80],
    [81, m81],
    [82, m82],
    [83, m83],
    [84, m84],
    [85, m85],
    [86, m86],
    [87, m87],
    [88, m88],
  ];

  for (const [matchNo, pair] of round32) {
    if (pair) assignments.set(matchNo, pair);
  }

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
