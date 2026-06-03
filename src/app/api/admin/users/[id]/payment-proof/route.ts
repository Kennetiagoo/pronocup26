import { PaymentStatus } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { uploadBlob } from "@/lib/blob";
import { hashFile } from "@/lib/files";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { acceptedProofMimeTypes, maxProofSizeBytes } from "@/lib/validation";

export const runtime = "nodejs";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id: userId } = await context.params;
    const formData = await request.formData();
    const candidate = formData.get("proof");

    if (!(candidate instanceof File)) {
      throw new ApiError(400, "BAD_REQUEST", "Debes adjuntar un comprobante.");
    }
    if (!acceptedProofMimeTypes.has(candidate.type)) {
      throw new ApiError(422, "UNPROCESSABLE", "Tipo de archivo no permitido.");
    }
    if (candidate.size > maxProofSizeBytes) {
      throw new ApiError(422, "UNPROCESSABLE", "El archivo excede el límite de 8 MB.");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new ApiError(404, "NOT_FOUND", "Usuario no encontrado.");
    }
    if (user.role === "ADMIN") {
      throw new ApiError(422, "UNPROCESSABLE", "No se pueden cargar comprobantes para administradores.");
    }

    const fileHash = await hashFile(candidate);
    const duplicate = await prisma.paymentProof.findFirst({
      where: { userId, fileHash },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError(409, "CONFLICT", "Este comprobante ya fue cargado para este usuario.");
    }

    const safeName = sanitizeFileName(candidate.name || "comprobante");
    const uploadResult = await uploadBlob(
      `payment-proofs/admin-user-${userId}/${Date.now()}-${safeName}`,
      candidate,
      candidate.type,
    );

    const proof = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentProof.create({
        data: {
          userId,
          blobUrl: uploadResult.url,
          blobPath: uploadResult.pathname,
          fileHash,
          mimeType: candidate.type,
          fileSize: candidate.size,
          status: PaymentStatus.EN_REVISION,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { paymentStatus: PaymentStatus.EN_REVISION },
      });

      return created;
    });

    await createAuditLog({
      actorId: admin.id,
      action: "ADMIN_PAYMENT_PROOF_SUBMITTED",
      entityType: "PaymentProof",
      entityId: String(proof.id),
      reviewedUserId: userId,
      metadata: { blobPath: proof.blobPath },
    });

    return ok({ proof }, 201);
  } catch (error) {
    return fail(error);
  }
}
