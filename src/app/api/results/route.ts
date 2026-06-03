import { ApiError, fail, ok } from "@/lib/http";
import { requirePaidUser } from "@/lib/auth/guards";
import { isUserProfileComplete } from "@/lib/auth/profile";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requirePaidUser();
    if (!isUserProfileComplete(user)) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Debes completar tu registro antes de acceder al módulo de resultados.",
      );
    }
    return ok({
      message:
        "Acceso autorizado. Endpoint placeholder para registrar resultados en futuras iteraciones.",
      userId: user.id,
    });
  } catch (error) {
    return fail(error);
  }
}

