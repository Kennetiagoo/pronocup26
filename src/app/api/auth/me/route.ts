import { fail, ok } from "@/lib/http";
import { requireAuth } from "@/lib/auth/guards";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuth();
    return ok({ user });
  } catch (error) {
    return fail(error);
  }
}
