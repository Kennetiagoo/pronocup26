import { PaymentStatus } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateUserPaymentStatusSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id: userId } = await context.params;
    const body = await request.json();
    const parsed = updateUserPaymentStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Estado inválido.");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, paymentStatus: true },
    });
    if (!user) {
      throw new ApiError(404, "NOT_FOUND", "Usuario no encontrado.");
    }
    if (user.role === "ADMIN") {
      throw new ApiError(422, "UNPROCESSABLE", "No se puede cambiar el estado de pago de un administrador.");
    }
    if (parsed.data.paymentStatus === PaymentStatus.RECHAZADO && !parsed.data.rejectionNote) {
      throw new ApiError(400, "BAD_REQUEST", "Debes indicar un motivo de rechazo.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const latestProof = await tx.paymentProof.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      if (latestProof && parsed.data.paymentStatus === PaymentStatus.APROBADO) {
        await tx.paymentProof.update({
          where: { id: latestProof.id },
          data: {
            status: PaymentStatus.APROBADO,
            rejectionNote: null,
            reviewedAt: new Date(),
            reviewedById: admin.id,
          },
        });
      }

      if (latestProof && parsed.data.paymentStatus === PaymentStatus.RECHAZADO) {
        await tx.paymentProof.update({
          where: { id: latestProof.id },
          data: {
            status: PaymentStatus.RECHAZADO,
            rejectionNote: parsed.data.rejectionNote,
            reviewedAt: new Date(),
            reviewedById: admin.id,
          },
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: { paymentStatus: parsed.data.paymentStatus },
        select: {
          id: true,
          nombres: true,
          apellidos: true,
          username: true,
          email: true,
          paymentStatus: true,
          countryCode: true,
          createdAt: true,
        },
      });
    });

    await createAuditLog({
      actorId: admin.id,
      action: "USER_PAYMENT_STATUS_UPDATED",
      entityType: "User",
      entityId: userId,
      reviewedUserId: userId,
      metadata: {
        previousStatus: user.paymentStatus,
        paymentStatus: parsed.data.paymentStatus,
        rejectionNote: parsed.data.rejectionNote ?? null,
      },
    });

    return ok({ user: result });
  } catch (error) {
    return fail(error);
  }
}
