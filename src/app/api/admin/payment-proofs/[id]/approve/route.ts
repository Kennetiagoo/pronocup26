import { PaymentStatus } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const proofId = Number(id);
    if (!Number.isFinite(proofId)) {
      throw new ApiError(400, "BAD_REQUEST", "Id inválido.");
    }

    const proof = await prisma.paymentProof.findUnique({
      where: { id: proofId },
      include: { user: { select: { id: true } } },
    });

    if (!proof) {
      throw new ApiError(404, "NOT_FOUND", "Comprobante no encontrado.");
    }

    if (proof.status === PaymentStatus.APROBADO) {
      throw new ApiError(422, "UNPROCESSABLE", "El comprobante ya fue aprobado.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedProof = await tx.paymentProof.update({
        where: { id: proof.id },
        data: {
          status: PaymentStatus.APROBADO,
          rejectionNote: null,
          reviewedAt: new Date(),
          reviewedById: admin.id,
        },
      });

      await tx.user.update({
        where: { id: proof.userId },
        data: { paymentStatus: PaymentStatus.APROBADO },
      });

      return updatedProof;
    });

    await createAuditLog({
      actorId: admin.id,
      action: "PAYMENT_PROOF_APPROVED",
      entityType: "PaymentProof",
      entityId: String(proof.id),
      reviewedUserId: proof.userId,
      metadata: { previousStatus: proof.status },
    });

    return ok({ proof: result });
  } catch (error) {
    return fail(error);
  }
}

