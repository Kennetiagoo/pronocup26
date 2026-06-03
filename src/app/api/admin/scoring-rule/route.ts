import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateScoringRuleSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const rule = await prisma.scoringRule.findUnique({ where: { id: 1 } });
    if (!rule) {
      throw new ApiError(500, "INTERNAL_ERROR", "No existe configuración de puntaje.");
    }
    return ok({ rule });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = updateScoringRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos inválidos.");
    }

    const rule = await prisma.scoringRule.upsert({
      where: { id: 1 },
      update: {
        ...parsed.data,
        updatedAt: new Date(),
      },
      create: {
        id: 1,
        ...parsed.data,
        updatedAt: new Date(),
      },
    });

    await createAuditLog({
      actorId: admin.id,
      action: "SCORING_RULE_UPDATED",
      entityType: "ScoringRule",
      entityId: "1",
      metadata: parsed.data,
    });

    return ok({ rule });
  } catch (error) {
    return fail(error);
  }
}

