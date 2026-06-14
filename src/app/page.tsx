import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveUserHomeRoute } from "@/lib/auth/routing";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? resolveUserHomeRoute(user) : "/login");
}
