import { requireAdmin } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
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
