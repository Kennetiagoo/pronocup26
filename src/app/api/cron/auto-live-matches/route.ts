import { fail, ok } from "@/lib/http";
import { autoStartLiveMatches } from "@/lib/matches/auto-live";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    return ok(await autoStartLiveMatches());
  } catch (error) {
    return fail(error);
  }
}
