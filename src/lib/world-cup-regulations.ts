export type WorldCupGroupMatch = {
  stage: "GROUP" | string;
  groupName: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: "SCHEDULED" | "FINAL" | string;
};

export type WorldCupTeamRankingContext = {
  // Higher is better. Use FIFA's conduct score if available.
  conductScoreByTeamCode?: Record<string, number>;
  // Lower is better (1 = best).
  fifaRankingPositionByTeamCode?: Record<string, number>;
};

export type GroupStandingRow = {
  team: string;
  teamCode: string | null;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
};

export type RankedGroup = {
  groupName: string;
  rows: GroupStandingRow[];
};

export type ThirdPlacedRankingRow = GroupStandingRow & {
  groupName: string;
};

type TeamAccumulator = GroupStandingRow;

type MiniStats = {
  pts: number;
  gf: number;
  gc: number;
  dg: number;
};

function conductScore(teamCode: string | null, context?: WorldCupTeamRankingContext) {
  if (!teamCode) return Number.NEGATIVE_INFINITY;
  return context?.conductScoreByTeamCode?.[teamCode] ?? Number.NEGATIVE_INFINITY;
}

function fifaRankPosition(teamCode: string | null, context?: WorldCupTeamRankingContext) {
  if (!teamCode) return Number.POSITIVE_INFINITY;
  return context?.fifaRankingPositionByTeamCode?.[teamCode] ?? Number.POSITIVE_INFINITY;
}

function compareByStep2And3(a: TeamAccumulator, b: TeamAccumulator, context?: WorldCupTeamRankingContext) {
  if (b.dg !== a.dg) return b.dg - a.dg;
  if (b.gf !== a.gf) return b.gf - a.gf;

  // Step 2.c from FIFA regulations: highest team conduct score.
  const conductA = conductScore(a.teamCode, context);
  const conductB = conductScore(b.teamCode, context);
  if (conductB !== conductA) return conductB - conductA;

  // Step 3: most recent FIFA ranking (lower position is better).
  const rankA = fifaRankPosition(a.teamCode, context);
  const rankB = fifaRankPosition(b.teamCode, context);
  if (rankA !== rankB) return rankA - rankB;

  return a.team.localeCompare(b.team, "es");
}

function computeMiniStats(
  matches: WorldCupGroupMatch[],
  groupName: string,
  teamNames: Set<string>,
): Map<string, MiniStats> {
  const stats = new Map<string, MiniStats>();
  for (const name of teamNames) {
    stats.set(name, { pts: 0, gf: 0, gc: 0, dg: 0 });
  }

  for (const match of matches) {
    if (
      match.stage !== "GROUP" ||
      !match.groupName ||
      match.groupName !== groupName ||
      match.status !== "FINAL" ||
      match.homeScore === null ||
      match.awayScore === null
    ) {
      continue;
    }

    if (!teamNames.has(match.homeTeam) || !teamNames.has(match.awayTeam)) continue;

    const home = stats.get(match.homeTeam);
    const away = stats.get(match.awayTeam);
    if (!home || !away) continue;

    home.gf += match.homeScore;
    home.gc += match.awayScore;
    home.dg = home.gf - home.gc;

    away.gf += match.awayScore;
    away.gc += match.homeScore;
    away.dg = away.gf - away.gc;

    if (match.homeScore > match.awayScore) {
      home.pts += 3;
    } else if (match.homeScore < match.awayScore) {
      away.pts += 3;
    } else {
      home.pts += 1;
      away.pts += 1;
    }
  }

  return stats;
}

function rankTiedByHeadToHead(
  matches: WorldCupGroupMatch[],
  groupName: string,
  tiedTeams: TeamAccumulator[],
): TeamAccumulator[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  const tiedNames = new Set(tiedTeams.map((team) => team.team));
  const miniStats = computeMiniStats(matches, groupName, tiedNames);

  const sorted = tiedTeams
    .slice()
    .sort((a, b) => {
      const aStats = miniStats.get(a.team) ?? { pts: 0, gf: 0, gc: 0, dg: 0 };
      const bStats = miniStats.get(b.team) ?? { pts: 0, gf: 0, gc: 0, dg: 0 };

      if (bStats.pts !== aStats.pts) return bStats.pts - aStats.pts;
      if (bStats.dg !== aStats.dg) return bStats.dg - aStats.dg;
      if (bStats.gf !== aStats.gf) return bStats.gf - aStats.gf;

      return 0;
    });

  // Re-apply step 1 only to teams still equal after (a,b,c).
  const resolved: TeamAccumulator[] = [];
  for (let i = 0; i < sorted.length; ) {
    const current = sorted[i];
    const currentStats = miniStats.get(current.team) ?? { pts: 0, gf: 0, gc: 0, dg: 0 };
    const block: TeamAccumulator[] = [current];
    i += 1;

    while (i < sorted.length) {
      const candidate = sorted[i];
      const candidateStats = miniStats.get(candidate.team) ?? { pts: 0, gf: 0, gc: 0, dg: 0 };
      if (
        candidateStats.pts === currentStats.pts &&
        candidateStats.dg === currentStats.dg &&
        candidateStats.gf === currentStats.gf
      ) {
        block.push(candidate);
        i += 1;
        continue;
      }
      break;
    }

    if (block.length > 1 && block.length < tiedTeams.length) {
      resolved.push(...rankTiedByHeadToHead(matches, groupName, block));
    } else {
      resolved.push(...block);
    }
  }

  return resolved;
}

export function buildWorldCupGroupStandings(
  matches: WorldCupGroupMatch[],
  context?: WorldCupTeamRankingContext,
): RankedGroup[] {
  const byGroup = new Map<string, Map<string, TeamAccumulator>>();

  for (const match of matches) {
    if (match.stage !== "GROUP" || !match.groupName) continue;

    if (!byGroup.has(match.groupName)) {
      byGroup.set(match.groupName, new Map<string, TeamAccumulator>());
    }

    const table = byGroup.get(match.groupName);
    if (!table) continue;

    if (!table.has(match.homeTeam)) {
      table.set(match.homeTeam, {
        team: match.homeTeam,
        teamCode: match.homeTeamCode,
        pj: 0,
        g: 0,
        e: 0,
        p: 0,
        gf: 0,
        gc: 0,
        dg: 0,
        pts: 0,
      });
    }
    if (!table.has(match.awayTeam)) {
      table.set(match.awayTeam, {
        team: match.awayTeam,
        teamCode: match.awayTeamCode,
        pj: 0,
        g: 0,
        e: 0,
        p: 0,
        gf: 0,
        gc: 0,
        dg: 0,
        pts: 0,
      });
    }

    if (match.status !== "FINAL" || match.homeScore === null || match.awayScore === null) continue;

    const home = table.get(match.homeTeam);
    const away = table.get(match.awayTeam);
    if (!home || !away) continue;

    home.pj += 1;
    away.pj += 1;

    home.gf += match.homeScore;
    home.gc += match.awayScore;
    home.dg = home.gf - home.gc;

    away.gf += match.awayScore;
    away.gc += match.homeScore;
    away.dg = away.gf - away.gc;

    if (match.homeScore > match.awayScore) {
      home.g += 1;
      home.pts += 3;
      away.p += 1;
    } else if (match.homeScore < match.awayScore) {
      away.g += 1;
      away.pts += 3;
      home.p += 1;
    } else {
      home.e += 1;
      away.e += 1;
      home.pts += 1;
      away.pts += 1;
    }
  }

  return Array.from(byGroup.entries())
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([groupName, table]) => {
      const rows = Array.from(table.values());

      const byPoints = rows.slice().sort((a, b) => b.pts - a.pts);
      const ranked: TeamAccumulator[] = [];

      for (let i = 0; i < byPoints.length; ) {
        const tieBlock: TeamAccumulator[] = [byPoints[i]];
        i += 1;
        while (i < byPoints.length && byPoints[i].pts === tieBlock[0].pts) {
          tieBlock.push(byPoints[i]);
          i += 1;
        }

        if (tieBlock.length === 1) {
          ranked.push(tieBlock[0]);
          continue;
        }

        const headToHeadRanked = rankTiedByHeadToHead(matches, groupName, tieBlock);

        let j = 0;
        while (j < headToHeadRanked.length) {
          const base = headToHeadRanked[j];
          const miniStats = computeMiniStats(
            matches,
            groupName,
            new Set(headToHeadRanked.map((row) => row.team)),
          );
          const baseMini = miniStats.get(base.team) ?? { pts: 0, gf: 0, gc: 0, dg: 0 };

          const unresolved: TeamAccumulator[] = [base];
          j += 1;
          while (j < headToHeadRanked.length) {
            const candidate = headToHeadRanked[j];
            const candidateMini = miniStats.get(candidate.team) ?? { pts: 0, gf: 0, gc: 0, dg: 0 };
            if (
              candidateMini.pts === baseMini.pts &&
              candidateMini.dg === baseMini.dg &&
              candidateMini.gf === baseMini.gf
            ) {
              unresolved.push(candidate);
              j += 1;
              continue;
            }
            break;
          }

          if (unresolved.length === 1) {
            ranked.push(unresolved[0]);
          } else {
            ranked.push(...unresolved.sort((a, b) => compareByStep2And3(a, b, context)));
          }
        }
      }

      return { groupName, rows: ranked };
    });
}

export function rankThirdPlacedTeams(
  groups: RankedGroup[],
  context?: WorldCupTeamRankingContext,
): ThirdPlacedRankingRow[] {
  return groups
    .map((group) => {
      const third = group.rows[2];
      if (!third) return null;
      return { ...third, groupName: group.groupName };
    })
    .filter((row): row is ThirdPlacedRankingRow => row !== null)
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.dg !== a.dg) return b.dg - a.dg;
      if (b.gf !== a.gf) return b.gf - a.gf;

      const conductA = conductScore(a.teamCode, context);
      const conductB = conductScore(b.teamCode, context);
      if (conductB !== conductA) return conductB - conductA;

      const rankA = fifaRankPosition(a.teamCode, context);
      const rankB = fifaRankPosition(b.teamCode, context);
      if (rankA !== rankB) return rankA - rankB;

      return a.groupName.localeCompare(b.groupName, "es");
    });
}
