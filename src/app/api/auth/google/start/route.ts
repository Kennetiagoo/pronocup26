import { NextResponse } from "next/server";

import {
  createGoogleState,
  googleClientId,
  googleCookieNames,
  type GoogleAuthMode,
} from "@/lib/auth/google-oauth";
import { fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    const url = new URL(request.url);
    const modeParam = url.searchParams.get("mode");
    const mode: GoogleAuthMode = modeParam === "register" ? "register" : "login";
    const state = createGoogleState();

    const redirectUri = `${origin}/api/auth/google/callback`;
    const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleUrl.searchParams.set("client_id", googleClientId());
    googleUrl.searchParams.set("redirect_uri", redirectUri);
    googleUrl.searchParams.set("response_type", "code");
    googleUrl.searchParams.set("scope", "openid email profile");
    googleUrl.searchParams.set("state", state);
    googleUrl.searchParams.set("prompt", "select_account");

    const response = NextResponse.redirect(googleUrl);
    const cookieNames = googleCookieNames();
    response.cookies.set(cookieNames.state, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
    response.cookies.set(cookieNames.mode, mode, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.redirect(
        new URL(`/login?oauth_error=${encodeURIComponent(error.message)}`, origin),
      );
    }
    return fail(error);
  }
}
