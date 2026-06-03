import { PaymentStatus } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { rejectProofSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const proofId = Number(id);
    if (!Number.isFinite(proofId)) {
      throw new ApiError(400, "BAD_REQUEST", "Id inválido.");
    }

    const body = await request.json();
    const parsed = rejectProofSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Motivo inválido.");
    }

    const proof = await prisma.paymentProof.findUnique({
      where: { id: proofId },
      include: { user: { select: { id: true } } },
    });

    if (!proof) {
      throw new ApiError(404, "NOT_FOUND", "Comprobante no encontrado.");
    }

    if (proof.status === PaymentStatus.RECHAZADO) {
      throw new ApiError(422, "UNPROCESSABLE", "El comprobante ya fue rechazado.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedProof = await tx.paymentProof.update({
        where: { id: proof.id },
        data: {
          status: PaymentStatus.RECHAZADO,
          rejectionNote: parsed.data.rejectionNote,
          reviewedAt: new Date(),
          reviewedById: admin.id,
        },
      });

      await tx.user.update({
        where: { id: proof.userId },
        data: { paymentStatus: PaymentStatus.RECHAZADO },
      });

      return updatedProof;
    });

    await createAuditLog({
      actorId: admin.id,
      action: "PAYMENT_PROOF_REJECTED",
      entityType: "PaymentProof",
      entityId: String(proof.id),
      reviewedUserId: proof.userId,
      metadata: {
        previousStatus: proof.status,
        rejectionNote: parsed.data.rejectionNote,
      },
    });

    return ok({ proof: result });
  } catch (error) {
    return fail(error);
  }
}

