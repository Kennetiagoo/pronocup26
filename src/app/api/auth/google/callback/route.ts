import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  googleClientId,
  googleClientSecret,
  googleCookieNames,
  readGoogleModeCookie,
  readGoogleStateCookie,
} from "@/lib/auth/google-oauth";
import { resolveUserHomeRoute } from "@/lib/auth/routing";
import { ApiError, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
};

function clearGoogleCookies(response: NextResponse) {
  const cookieNames = googleCookieNames();
  response.cookies.set(cookieNames.state, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(cookieNames.mode, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function redirectToLoginWithError(origin: string, message: string) {
  const response = NextResponse.redirect(
    new URL(`/login?oauth_error=${encodeURIComponent(message)}`, origin),
  );
  clearGoogleCookies(response);
  return response;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = url.origin;
    const error = url.searchParams.get("error");
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");

    if (error) {
      return redirectToLoginWithError(origin, "Google devolvió un error durante la autenticación.");
    }

    const expectedState = await readGoogleStateCookie();
    if (!state || !expectedState || state !== expectedState) {
      return redirectToLoginWithError(origin, "No se pudo validar la sesión OAuth de Google.");
    }

    if (!code) {
      return redirectToLoginWithError(origin, "Google no devolvió código de autorización.");
    }

    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId(),
        client_secret: googleClientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });

    const tokenPayload = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || !tokenPayload.access_token) {
      return redirectToLoginWithError(
        origin,
        "No se pudo intercambiar el token de Google. Reintenta.",
      );
    }

    const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      cache: "no-store",
    });
    const userInfo = (await userInfoRes.json()) as GoogleUserInfo;
    if (!userInfoRes.ok || !userInfo.email) {
      return redirectToLoginWithError(origin, "No se pudo obtener el perfil de Google.");
    }
    if (userInfo.email_verified !== true) {
      return redirectToLoginWithError(origin, "Tu correo de Google no está verificado.");
    }

    const email = userInfo.email.toLowerCase().trim();
    if (!email) {
      return redirectToLoginWithError(origin, "Google no devolvió un correo válido.");
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        nombres: true,
        apellidos: true,
        username: true,
      },
    });

    const user =
      existing ??
      (await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name: userInfo.name?.trim() || email.split("@")[0] || "Usuario Google",
          nombres: (userInfo.given_name ?? "").trim(),
          apellidos: (userInfo.family_name ?? "").trim(),
          username: null,
          email,
          passwordHash: await bcrypt.hash(crypto.randomUUID(), 12),
        },
        select: {
          id: true,
          role: true,
          nombres: true,
          apellidos: true,
          username: true,
        },
      }));

    const mode = await readGoogleModeCookie();
    const destination =
      mode === "register" && user.role !== "ADMIN"
        ? "/completar-registro"
        : resolveUserHomeRoute(user);

    const response = NextResponse.redirect(new URL(destination, origin));
    await setSessionCookie(response, { userId: user.id });
    clearGoogleCookies(response);
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      const origin = new URL(request.url).origin;
      return redirectToLoginWithError(origin, error.message);
    }
    return fail(error);
  }
}


