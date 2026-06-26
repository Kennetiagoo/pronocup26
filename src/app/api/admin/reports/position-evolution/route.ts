import { requireAdmin } from "@/lib/auth/guards";
import { getOrCreateBonusConfig } from "@/lib/bonus";
import { fail } from "@/lib/http";
import { generatePositionEvolutionPdf } from "@/lib/admin/position-evolution-report";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

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
          OR: [{ paymentStatus: "APROBADO" }, { role: "ADMIN" }],
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
