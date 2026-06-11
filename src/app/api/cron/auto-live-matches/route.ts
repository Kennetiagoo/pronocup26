import { MatchStatus } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rule = await prisma.scoringRule.findUnique({
      where: { id: 1 },
      select: { lockMinutesBeforeKickoff: true },
    });
    const lockMinutesBeforeKickoff = rule?.lockMinutesBeforeKickoff ?? 10;
    const now = Date.now();
    const lockThreshold = new Date(now + lockMinutesBeforeKickoff * 60 * 1000);

    const matches = await prisma.match.findMany({
      where: {
        status: MatchStatus.SCHEDULED,
        kickoff: { lte: lockThreshold },
      },
      select: {
        id: true,
        matchNumber: true,
        kickoff: true,
        homeScore: true,
        awayScore: true,
      },
    });

    const dueMatches = matches.filter(
      (match) => now >= match.kickoff.getTime() - lockMinutesBeforeKickoff * 60 * 1000,
    );

    if (dueMatches.length === 0) {
      return ok({ updated: 0, matchIds: [] });
    }

    await prisma.$transaction(
      dueMatches.map((match) =>
        prisma.match.update({
          where: { id: match.id },
          data: {
            status: MatchStatus.LIVE,
            homeScore: match.homeScore ?? 0,
            awayScore: match.awayScore ?? 0,
            updatedAt: new Date(),
          },
        }),
      ),
    );

    await Promise.all(
      dueMatches.map((match) =>
        createAuditLog({
          action: "MATCH_AUTO_LIVE",
          entityType: "Match",
          entityId: match.id,
          metadata: {
            matchNumber: match.matchNumber,
            kickoff: match.kickoff.toISOString(),
            lockMinutesBeforeKickoff,
          },
        }),
      ),
    );

    return ok({
      updated: dueMatches.length,
      matchIds: dueMatches.map((match) => match.id),
    });
  } catch (error) {
    return fail(error);
  }
}
