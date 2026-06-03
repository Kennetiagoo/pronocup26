import type { UserRole } from "@prisma/client";

type ProfileShape = {
  role: UserRole;
  nombres: string;
  apellidos: string;
  username: string | null;
};

export function isUserProfileComplete(user: ProfileShape) {
  if (user.role === "ADMIN") return true;
  const nombres = user.nombres.trim();
  const apellidos = user.apellidos.trim();
  const username = user.username?.trim() ?? "";
  return nombres.length >= 2 && apellidos.length >= 2 && username.length >= 3;
}
