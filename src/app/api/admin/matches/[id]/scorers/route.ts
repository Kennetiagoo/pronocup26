import { TeamSide } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { getOrCreateBonusConfig, isBonusEnabledForStage } from "@/lib/bonus";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateMatchScorersSchema } from "@/lib/validation";

export const runtime = "nodejs";

function sideSlots(playerIds: number[], side: TeamSide) {
  return playerIds.map((playerId, slotIndex) => ({ playerId, teamSide: side, slotIndex }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        homeTeamCode: true,
        awayTeamCode: true,
      },
    });
    if (!match) {
      throw new ApiError(404, "NOT_FOUND", "Partido no encontrado.");
    }

    const officialScorers = await prisma.matchOfficialScorer.findMany({
      where: { matchId: id },
      orderBy: [{ teamSide: "asc" }, { slotIndex: "asc" }],
      select: {
        teamSide: true,
        slotIndex: true,
        playerId: true,
      },
    });

    const homePlayerIds = officialScorers
      .filter((row) => row.teamSide === TeamSide.HOME)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((row) => row.playerId);
    const awayPlayerIds = officialScorers
      .filter((row) => row.teamSide === TeamSide.AWAY)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((row) => row.playerId);

    return ok({
      matchId: id,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
      homePlayerIds,
      awayPlayerIds,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateMatchScorersSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos invalidos.");
    }

    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        status: true,
        homeTeamCode: true,
        awayTeamCode: true,
      },
    });
    if (!match) {
      throw new ApiError(404, "NOT_FOUND", "Partido no encontrado.");
    }
    if (!match.homeTeamCode || !match.awayTeamCode) {
      throw new ApiError(422, "UNPROCESSABLE", "Este partido no tiene codigos de seleccion configurados.");
    }

    const bonusConfig = await getOrCreateBonusConfig();
    if (!isBonusEnabledForStage(bonusConfig, "scorers", match.stage)) {
      throw new ApiError(
        422,
        "UNPROCESSABLE",
        "La bonificacion de goleadores esta desactivada para esta fase.",
      );
    }

    const validPlayers = await prisma.teamPlayer.findMany({
      where: {
        isActive: true,
        OR: [{ teamCode: match.homeTeamCode }, { teamCode: match.awayTeamCode }],
      },
      select: { id: true, teamCode: true },
    });
    const validPlayerSet = new Set(validPlayers.map((player) => player.id));
    for (const playerId of [...parsed.data.homePlayerIds, ...parsed.data.awayPlayerIds]) {
      if (!validPlayerSet.has(playerId)) {
        throw new ApiError(422, "UNPROCESSABLE", "Hay goleadores fuera de las selecciones del partido.");
      }
    }

    const records = [
      ...sideSlots(parsed.data.homePlayerIds, TeamSide.HOME),
      ...sideSlots(parsed.data.awayPlayerIds, TeamSide.AWAY),
    ];

    await prisma.$transaction(async (tx) => {
      await tx.matchOfficialScorer.deleteMany({ where: { matchId: id } });
      if (records.length > 0) {
        await tx.matchOfficialScorer.createMany({
          data: records.map((record) => ({
            matchId: id,
            teamSide: record.teamSide,
            slotIndex: record.slotIndex,
            playerId: record.playerId,
          })),
        });
      }
    });

    await createAuditLog({
      actorId: admin.id,
      action: "MATCH_SCORERS_UPDATED",
      entityType: "Match",
      entityId: id,
      metadata: {
        homeSlots: parsed.data.homePlayerIds.length,
        awaySlots: parsed.data.awayPlayerIds.length,
        status: match.status,
      },
    });

    return ok({
      matchId: id,
      homePlayerIds: parsed.data.homePlayerIds,
      awayPlayerIds: parsed.data.awayPlayerIds,
    });
  } catch (error) {
    return fail(error);
  }
}
