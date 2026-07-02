import { requireAdmin } from "@/lib/auth/guards";
import { getOrCreateBonusConfig } from "@/lib/bonus";
import { ApiError, fail } from "@/lib/http";
import { generatePositionEvolutionPdf } from "@/lib/admin/position-evolution-report";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSelectedUserIds(request: NextRequest) {
  const hasUserIdsParam = request.nextUrl.searchParams.has("userIds");
  if (!hasUserIdsParam) return null;

  return new Set(
    request.nextUrl.searchParams
      .getAll("userIds")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const selectedUserIds = parseSelectedUserIds(request);
    if (selectedUserIds && selectedUserIds.size === 0) {
      throw new ApiError(400, "BAD_REQUEST", "Selecciona al menos un usuario para generar el informe.");
    }

    const selectedUserIdList = selectedUserIds ? Array.from(selectedUserIds) : null;

    const [rule, bonusConfig, users, matches, predictions] = await Promise.all([
      prisma.scoringRule.findUnique({
        where: { id: 1 },
        select: {
          officialModeEnabled: true,
          knockoutMultiplier: true,
        },
      }),
      getOrCreateBonusConfig(),
      prisma.user.findMany({
        where: {
          AND: [
            { OR: [{ paymentStatus: "APROBADO" }, { role: "ADMIN" }] },
            selectedUserIdList ? { id: { in: selectedUserIdList } } : {},
          ],
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          nombres: true,
          apellidos: true,
          username: true,
          role: true,
          paymentStatus: true,
          createdAt: true,
        },
      }),
      prisma.match.findMany({
        where: {
          status: "FINAL",
          homeScore: { not: null },
          awayScore: { not: null },
        },
        orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
        select: {
          id: true,
          matchNumber: true,
          stage: true,
          groupName: true,
          kickoff: true,
          homeTeam: true,
          awayTeam: true,
          homeScore: true,
          awayScore: true,
        },
      }),
      prisma.prediction.findMany({
        where: {
          ...(selectedUserIdList ? { userId: { in: selectedUserIdList } } : {}),
          Match: {
            status: "FINAL",
            homeScore: { not: null },
            awayScore: { not: null },
          },
        },
        select: {
          matchId: true,
          userId: true,
          points: true,
          basePoints: true,
          usedX2: true,
          x2Returned: true,
          Match: {
            select: {
              id: true,
              matchNumber: true,
              stage: true,
              groupName: true,
              kickoff: true,
              homeTeam: true,
              awayTeam: true,
              homeScore: true,
              awayScore: true,
            },
          },
        },
      }),
    ]);

    if (!rule) {
      throw new Error("No existe configuracion de puntaje inicial.");
    }
    if (selectedUserIdList && users.length === 0) {
      throw new ApiError(422, "UNPROCESSABLE", "No hay usuarios aprobados o administradores en la seleccion.");
    }

    const pdf = generatePositionEvolutionPdf({
      generatedAt: new Date(),
      users,
      matches,
      predictions,
      rule,
      x2UsesGroup: bonusConfig.x2UsesGroup,
    });

    const filenameDate = new Date().toISOString().slice(0, 10);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="evolucion-posiciones-${filenameDate}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
