import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { hashPasswordResetToken } from "@/lib/auth/password-reset";
import { ApiError, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos inválidos.");
    }

    const tokenHash = hashPasswordResetToken(parsed.data.token);
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(400, "BAD_REQUEST", "El enlace no es válido o expiró.");
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (claimed.count !== 1) {
        throw new ApiError(400, "BAD_REQUEST", "El enlace no es válido o expiró.");
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
        },
        data: { usedAt: now },
      });
    });

    return NextResponse.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión." }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

