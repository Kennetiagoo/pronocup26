import { requireAdmin } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { autoStartLiveMatches } from "@/lib/matches/auto-live";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    await autoStartLiveMatches();
    const matches = await prisma.match.findMany({
      orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
      select: {
        id: true,
        matchNumber: true,
        stage: true,
        groupName: true,
        kickoff: true,
        city: true,
        stadium: true,
        homeTeam: true,
        awayTeam: true,
        homeScore: true,
        awayScore: true,
        status: true,
        advancedTeamSide: true,
        homeTeamCode: true,
        awayTeamCode: true,
        isTopMatch: true,
        topMultiplier: true,
      },
    });
    return ok({ matches });
  } catch (error) {
    return fail(error);
  }
}
