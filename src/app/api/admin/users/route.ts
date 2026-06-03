import { requireAdmin } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      where: { role: "USER" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        username: true,
        email: true,
        paymentStatus: true,
        createdAt: true,
        countryCode: true,
      },
    });
    return ok({ users });
  } catch (error) {
    return fail(error);
  }
}
