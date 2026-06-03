import { PaymentStatus } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { ApiError, fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const allowedStatuses = new Set(Object.values(PaymentStatus));

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const statusParam = request.nextUrl.searchParams.get("status");
    if (statusParam && !allowedStatuses.has(statusParam as PaymentStatus)) {
      throw new ApiError(400, "BAD_REQUEST", "Estado de filtro inválido.");
    }

    const proofs = await prisma.paymentProof.findMany({
      where: {
        status: statusParam ? (statusParam as PaymentStatus) : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            username: true,
            email: true,
            paymentStatus: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return ok({ proofs });
  } catch (error) {
    return fail(error);
  }
}

