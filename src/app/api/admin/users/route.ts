import { requireAdmin } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        nombres: true,
        apellidos: true,
        username: true,
        email: true,
        paymentStatus: true,
        createdAt: true,
        countryCode: true,
        paymentProofs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            rejectionNote: true,
            blobUrl: true,
            createdAt: true,
          },
        },
      },
    });
    return ok({ users });
  } catch (error) {
    return fail(error);
  }
}
