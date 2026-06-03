import "server-only";

import { UserRole } from "@prisma/client";

import { isUserProfileComplete } from "@/lib/auth/profile";

type AuthRoutingUser = {
  role: UserRole;
  nombres: string;
  apellidos: string;
  username: string | null;
};

export function resolveUserHomeRoute(user: AuthRoutingUser) {
  if (user.role === UserRole.ADMIN) return "/admin";
  if (!isUserProfileComplete(user)) return "/completar-registro";
  return "/pronostico";
}
