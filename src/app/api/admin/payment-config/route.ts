import { updatePaymentConfigSchema } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { uploadBlob } from "@/lib/blob";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function toAmount(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new ApiError(422, "UNPROCESSABLE", "Monto inválido.");
  }
  return numeric.toFixed(2);
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new ApiError(422, "UNPROCESSABLE", "Formato de imagen QR inválido.");
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const config = await prisma.paymentConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    return ok({ config });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = updatePaymentConfigSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos inválidos.");
    }

    const payload = parsed.data;
    let activeConfig = await prisma.paymentConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    let qrBlobUrl = activeConfig?.qrBlobUrl ?? null;
    let qrBlobPath = activeConfig?.qrBlobPath ?? null;

    if (payload.qrImageBase64) {
      const decoded = decodeDataUrl(payload.qrImageBase64);
      const uploadResult = await uploadBlob(
        `admin/qr/${Date.now()}-payment-qr`,
        decoded.buffer,
        decoded.mimeType,
      );
      qrBlobUrl = uploadResult.url;
      qrBlobPath = uploadResult.pathname;
    }

    const data = {
      amount: toAmount(payload.amount),
      currency: payload.currency.toUpperCase(),
      instructions: payload.instructions,
      qrBlobUrl,
      qrBlobPath,
      qrCropX: payload.crop?.x ?? null,
      qrCropY: payload.crop?.y ?? null,
      qrZoom: payload.crop?.zoom ?? null,
      qrWidth: payload.crop?.width ?? null,
      qrHeight: payload.crop?.height ?? null,
      isActive: true,
    };

    if (!activeConfig) {
      activeConfig = await prisma.paymentConfig.create({ data });
    } else {
      activeConfig = await prisma.paymentConfig.update({
        where: { id: activeConfig.id },
        data,
      });
    }

    await createAuditLog({
      actorId: admin.id,
      action: "PAYMENT_CONFIG_UPDATED",
      entityType: "PaymentConfig",
      entityId: String(activeConfig.id),
      paymentConfigId: activeConfig.id,
      metadata: {
        amount: activeConfig.amount.toString(),
        currency: activeConfig.currency,
      },
    });

    return ok({ config: activeConfig });
  } catch (error) {
    return fail(error);
  }
}

