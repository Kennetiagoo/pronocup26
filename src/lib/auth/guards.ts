import "server-only";

import { PaymentStatus, UserRole } from "@prisma/client";

import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readSessionFromCookies } from "@/lib/auth/session";

export async function requireAuth() {
  const session = await readSessionFromCookies();
  if (!session?.userId) {
    throw new ApiError(401, "UNAUTHORIZED", "Debes iniciar sesión.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      nombres: true,
      apellidos: true,
      username: true,
      role: true,
      paymentStatus: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "Sesión inválida.");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== UserRole.ADMIN) {
    throw new ApiError(403, "FORBIDDEN", "No tienes permisos de administrador.");
  }
  return user;
}

export async function requirePaidUser() {
  const user = await requireAuth();
  if (user.role !== UserRole.ADMIN && user.paymentStatus !== PaymentStatus.APROBADO) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Tu pago aún no está aprobado. No puedes agregar resultados.",
    );
  }
  return user;
}


