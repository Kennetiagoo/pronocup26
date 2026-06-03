import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAuth } from "@/lib/auth/guards";
import { ApiError, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { completeProfileSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const parsed = completeProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Datos inválidos.");
    }

    const nombres = parsed.data.nombres.trim();
    const apellidos = parsed.data.apellidos.trim();
    const username = parsed.data.username.toLowerCase().trim();

    const duplicate = await prisma.user.findFirst({
      where: {
        username,
        NOT: { id: user.id },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError(409, "CONFLICT", "Ese usuario público ya está en uso.");
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        nombres,
        apellidos,
        username,
        name: `${nombres} ${apellidos}`.trim(),
      },
      select: {
        id: true,
        email: true,
        role: true,
        paymentStatus: true,
        nombres: true,
        apellidos: true,
        username: true,
      },
    });

    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Ese usuario público ya está en uso." } },
        { status: 409 },
      );
    }
    return fail(error);
  }
}


