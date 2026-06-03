import { redirect } from "next/navigation";

import { resolveUserHomeRoute } from "@/lib/auth/routing";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  redirect(resolveUserHomeRoute(user));
}
