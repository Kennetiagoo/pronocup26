import { NextResponse } from "next/server";

import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

const GENERIC_MESSAGE =
  "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (parsed.success) {
      const email = parsed.data.email.toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      });

      if (user) {
        try {
          const reset = await createPasswordResetToken(user.id);
          await sendPasswordResetEmail({
            to: user.email,
            resetUrl: reset.resetUrl,
          });
        } catch (error) {
          console.error("No se pudo enviar correo de restablecimiento.", error);
        }
      }
    }

    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

