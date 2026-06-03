import "server-only";

import { prisma } from "@/lib/prisma";
import { readSessionFromCookies } from "@/lib/auth/session";

export async function getCurrentUser() {
  const session = await readSessionFromCookies();
  if (!session?.userId) return null;

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      username: true,
      email: true,
      role: true,
      paymentStatus: true,
      createdAt: true,
    },
  });
}
