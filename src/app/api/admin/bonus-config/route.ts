import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { getOrCreateBonusConfig } from "@/lib/bonus";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateBonusConfigSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const config = await getOrCreateBonusConfig();
    return ok({ config });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = updateBonusConfigSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos invalidos.");
    }

    const config = await prisma.bonusConfig.upsert({
      where: { id: 1 },
      update: {
        ...parsed.data,
        activatedAt: new Date(),
      },
      create: {
        id: 1,
        ...parsed.data,
        activatedAt: new Date(),
      },
    });

    await createAuditLog({
      actorId: admin.id,
      action: "BONUS_CONFIG_UPDATED",
      entityType: "BonusConfig",
      entityId: "1",
      metadata: parsed.data,
    });

    return ok({ config });
  } catch (error) {
    return fail(error);
  }
}
