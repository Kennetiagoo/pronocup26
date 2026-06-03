import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuth();
    const latestProof = await prisma.paymentProof.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        rejectionNote: true,
        createdAt: true,
        reviewedAt: true,
        blobUrl: true,
      },
    });

    return ok({
      user,
      latestProof,
    });
  } catch (error) {
    return fail(error);
  }
}
