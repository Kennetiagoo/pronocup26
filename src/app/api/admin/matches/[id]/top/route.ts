import { MatchStage } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { getOrCreateBonusConfig, isBonusEnabledForStage } from "@/lib/bonus";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateTopMatchSchema } from "@/lib/validation";

export const runtime = "nodejs";

function dayKeyBogota(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bogota",
  }).format(date);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateTopMatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos inválidos.");
    }

    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) {
      throw new ApiError(404, "NOT_FOUND", "Partido no encontrado.");
    }
    if (match.kickoff.getTime() <= Date.now()) {
      throw new ApiError(422, "UNPROCESSABLE", "Solo puedes modificar Partido Top en partidos futuros.");
    }

    const bonusConfig = await getOrCreateBonusConfig();
    if (
      parsed.data.isTopMatch &&
      !isBonusEnabledForStage(bonusConfig, "top", match.stage as MatchStage)
    ) {
      throw new ApiError(422, "UNPROCESSABLE", "Partido Top está desactivado para esta fase.");
    }

    if (parsed.data.isTopMatch) {
      const topMatches = await prisma.match.findMany({
        where: {
          isTopMatch: true,
          id: { not: id },
        },
        select: { id: true, kickoff: true },
      });
      const targetDay = dayKeyBogota(match.kickoff);
      if (topMatches.some((item) => dayKeyBogota(item.kickoff) === targetDay)) {
        throw new ApiError(409, "CONFLICT", "Ya existe un Partido Top para ese día (GMT-5).");
      }
    }

    const topMultiplier = parsed.data.isTopMatch
      ? parsed.data.topMultiplier ?? bonusConfig.topMultiplier
      : 1.5;

    const updated = await prisma.match.update({
      where: { id },
      data: {
        isTopMatch: parsed.data.isTopMatch,
        topMultiplier,
        updatedAt: new Date(),
      },
    });

    await createAuditLog({
      actorId: admin.id,
      action: "MATCH_TOP_UPDATED",
      entityType: "Match",
      entityId: id,
      metadata: { isTopMatch: parsed.data.isTopMatch, topMultiplier },
    });

    return ok({ match: updated });
  } catch (error) {
    return fail(error);
  }
}

