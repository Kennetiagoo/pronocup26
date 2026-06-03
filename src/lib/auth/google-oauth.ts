import "server-only";

import { cookies } from "next/headers";

import { ApiError } from "@/lib/http";

const GOOGLE_STATE_COOKIE = "app_prono_google_state";
const GOOGLE_MODE_COOKIE = "app_prono_google_mode";

export type GoogleAuthMode = "login" | "register";

function requireClientId() {
  const value = process.env.GOOGLE_CLIENT_ID;
  if (!value) {
    throw new ApiError(500, "INTERNAL_ERROR", "GOOGLE_CLIENT_ID no está configurado.");
  }
  return value;
}

function requireClientSecret() {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) {
    throw new ApiError(500, "INTERNAL_ERROR", "GOOGLE_CLIENT_SECRET no está configurado.");
  }
  return value;
}

export function createGoogleState() {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}

export async function readGoogleStateCookie() {
  const store = await cookies();
  return store.get(GOOGLE_STATE_COOKIE)?.value ?? null;
}

export async function readGoogleModeCookie(): Promise<GoogleAuthMode | null> {
  const store = await cookies();
  const mode = store.get(GOOGLE_MODE_COOKIE)?.value;
  if (mode === "login" || mode === "register") return mode;
  return null;
}

export function googleCookieNames() {
  return {
    state: GOOGLE_STATE_COOKIE,
    mode: GOOGLE_MODE_COOKIE,
  };
}

export function googleClientId() {
  return requireClientId();
}

export function googleClientSecret() {
  return requireClientSecret();
}

