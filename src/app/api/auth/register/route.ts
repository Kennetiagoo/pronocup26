import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { fail, ApiError } from "@/lib/http";
import { resolveUserHomeRoute } from "@/lib/auth/routing";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos inválidos.");
    }

    const data = parsed.data;
    const email = data.email.toLowerCase();
    const username = data.username.toLowerCase();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
      select: { id: true, email: true, username: true },
    });

    if (existing) {
      if (existing.email === email) {
        throw new ApiError(409, "CONFLICT", "El correo ya está registrado.");
      }
      throw new ApiError(409, "CONFLICT", "El usuario público ya está en uso.");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: `${data.nombres} ${data.apellidos}`.trim(),
        nombres: data.nombres,
        apellidos: data.apellidos,
        username,
        email,
        passwordHash,
      },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        username: true,
        email: true,
        role: true,
        paymentStatus: true,
      },
    });

    const response = NextResponse.json({ user, redirectTo: resolveUserHomeRoute(user) }, { status: 201 });
    await setSessionCookie(response, { userId: user.id });
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Correo o usuario duplicado." } },
        { status: 409 },
      );
    }
    return fail(error);
  }
}


