import { MatchStage } from "@prisma/client";

type GroupMatch = {
  id: string;
  stage: MatchStage | string;
  groupName: string | null;
  kickoff: Date | string;
  matchNumber?: number;
};

export function buildGroupMatchdayMap(matches: GroupMatch[]) {
  const grouped = new Map<string, GroupMatch[]>();
  for (const match of matches) {
    if (match.stage !== "GROUP" || !match.groupName) continue;
    const key = match.groupName.toUpperCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(match);
  }

  const map = new Map<string, 1 | 2 | 3>();
  for (const entries of grouped.values()) {
    entries
      .slice()
      .sort((a, b) => {
        const kickoffA = new Date(a.kickoff).getTime();
        const kickoffB = new Date(b.kickoff).getTime();
        if (kickoffA !== kickoffB) return kickoffA - kickoffB;
        return (a.matchNumber ?? 0) - (b.matchNumber ?? 0);
      })
      .forEach((match, idx) => {
        const md = Math.min(3, Math.floor(idx / 2) + 1) as 1 | 2 | 3;
        map.set(match.id, md);
      });
  }

  return map;
}
