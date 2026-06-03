import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { ApiError, fail } from "@/lib/http";
import { resolveUserHomeRoute } from "@/lib/auth/routing";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", "Credenciales inválidas.");
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        username: true,
        role: true,
        paymentStatus: true,
        nombres: true,
        apellidos: true,
      },
    });

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Correo o contraseña inválidos.");
    }

    const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!isValid) {
      throw new ApiError(401, "UNAUTHORIZED", "Correo o contraseña inválidos.");
    }

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          paymentStatus: user.paymentStatus,
          nombres: user.nombres,
          apellidos: user.apellidos,
        },
        redirectTo: resolveUserHomeRoute(user),
      },
      { status: 200 },
    );
    await setSessionCookie(response, { userId: user.id });
    return response;
  } catch (error) {
    return fail(error);
  }
}

