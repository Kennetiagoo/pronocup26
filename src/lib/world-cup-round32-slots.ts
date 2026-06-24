export type Round32Slot = {
  matchNumber: number;
  homeSlot: string;
  awaySlot: string;
};

export const WORLD_CUP_ROUND32_SLOTS: Round32Slot[] = [
  { matchNumber: 73, homeSlot: "2A", awaySlot: "2B" },
  { matchNumber: 74, homeSlot: "1E", awaySlot: "3A/B/C/D/F" },
  { matchNumber: 75, homeSlot: "1F", awaySlot: "2C" },
  { matchNumber: 76, homeSlot: "1C", awaySlot: "2F" },
  { matchNumber: 77, homeSlot: "1I", awaySlot: "3C/D/F/G/H" },
  { matchNumber: 78, homeSlot: "2E", awaySlot: "2I" },
  { matchNumber: 79, homeSlot: "1A", awaySlot: "3C/E/F/H/I" },
  { matchNumber: 80, homeSlot: "1L", awaySlot: "3E/H/I/J/K" },
  { matchNumber: 81, homeSlot: "1D", awaySlot: "3B/E/F/I/J" },
  { matchNumber: 82, homeSlot: "1G", awaySlot: "3A/E/H/I/J" },
  { matchNumber: 83, homeSlot: "2K", awaySlot: "2L" },
  { matchNumber: 84, homeSlot: "1H", awaySlot: "2J" },
  { matchNumber: 85, homeSlot: "1B", awaySlot: "3E/F/G/I/J" },
  { matchNumber: 86, homeSlot: "1J", awaySlot: "2H" },
  { matchNumber: 87, homeSlot: "1K", awaySlot: "3D/E/I/J/L" },
  { matchNumber: 88, homeSlot: "2D", awaySlot: "2G" },
];

const ROUND32_SLOT_BY_MATCH = new Map(WORLD_CUP_ROUND32_SLOTS.map((slot) => [slot.matchNumber, slot]));

export function getRound32Slot(matchNumber: number) {
  return ROUND32_SLOT_BY_MATCH.get(matchNumber) ?? null;
}

export function getRound32SideSlot(matchNumber: number, side: "home" | "away") {
  const slot = getRound32Slot(matchNumber);
  if (!slot) return null;
  return side === "home" ? slot.homeSlot : slot.awaySlot;
}

export function parseRound32Slot(slot: string) {
  const fixed = slot.match(/^([12])([A-L])$/);
  if (fixed) {
    return {
      kind: "fixed" as const,
      position: Number(fixed[1]) as 1 | 2,
      groups: [fixed[2]],
    };
  }

  const third = slot.match(/^3([A-L](?:\/[A-L])*)$/);
  if (third) {
    return {
      kind: "third" as const,
      position: 3 as const,
      groups: third[1].split("/"),
    };
  }

  return null;
}
