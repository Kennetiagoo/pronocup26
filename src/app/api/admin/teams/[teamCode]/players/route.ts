import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateTeamPlayersSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ teamCode: string }> },
) {
  try {
    await requireAdmin();
    const { teamCode } = await context.params;
    const normalizedCode = teamCode.toUpperCase().trim();
    const players = await prisma.teamPlayer.findMany({
      where: { teamCode: normalizedCode, isActive: true },
      orderBy: [{ number: "asc" }, { name: "asc" }],
    });
    return ok({ players });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ teamCode: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { teamCode } = await context.params;
    const normalizedCode = teamCode.toUpperCase().trim();
    if (normalizedCode.length < 2 || normalizedCode.length > 4) {
      throw new ApiError(400, "BAD_REQUEST", "Código de selección inválido.");
    }

    const body = await request.json();
    const parsed = updateTeamPlayersSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos inválidos.");
    }

    const names = parsed.data.players.map((item) => item.name.trim().toLowerCase());
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      throw new ApiError(409, "CONFLICT", "Hay jugadores repetidos en la plantilla.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamPlayer.updateMany({
        where: { teamCode: normalizedCode },
        data: { isActive: false, updatedAt: new Date() },
      });

      for (const player of parsed.data.players) {
        await tx.teamPlayer.upsert({
          where: { teamCode_name: { teamCode: normalizedCode, name: player.name.trim() } },
          update: {
            number: player.number ?? null,
            isActive: true,
            updatedAt: new Date(),
          },
          create: {
            teamCode: normalizedCode,
            name: player.name.trim(),
            number: player.number ?? null,
            isActive: true,
          },
        });
      }
    });

    const players = await prisma.teamPlayer.findMany({
      where: { teamCode: normalizedCode, isActive: true },
      orderBy: [{ number: "asc" }, { name: "asc" }],
    });

    await createAuditLog({
      actorId: admin.id,
      action: "TEAM_PLAYERS_UPDATED",
      entityType: "TeamPlayer",
      entityId: normalizedCode,
      metadata: { total: players.length },
    });

    return ok({ teamCode: normalizedCode, players });
  } catch (error) {
    return fail(error);
  }
}

