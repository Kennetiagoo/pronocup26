import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

export const PASSWORD_RESET_MAX_AGE_MINUTES = 30;

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getPasswordResetUrl(token: string) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error("APP_URL no está configurado.");
  }
  const url = new URL("/restablecer-password", appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function createPasswordResetToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPasswordResetToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_MAX_AGE_MINUTES * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    await tx.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  });

  return {
    token,
    resetUrl: getPasswordResetUrl(token),
    expiresAt,
  };
}

