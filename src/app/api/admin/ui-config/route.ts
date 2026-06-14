import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getOrCreateAppUiConfig } from "@/lib/ui-config";
import { updateAppUiConfigSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const config = await getOrCreateAppUiConfig();
    return ok({ config });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = updateAppUiConfigSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos invalidos.");
    }

    const config = await prisma.appUiConfig.upsert({
      where: { id: 1 },
      update: parsed.data,
      create: {
        id: 1,
        ...parsed.data,
      },
    });

    await createAuditLog({
      actorId: admin.id,
      action: "APP_UI_CONFIG_UPDATED",
      entityType: "AppUiConfig",
      entityId: "1",
      metadata: parsed.data,
    });

    return ok({ config });
  } catch (error) {
    return fail(error);
  }
}
