import { redirect } from "next/navigation";

import AuthForm from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveUserHomeRoute } from "@/lib/auth/routing";
import { prisma } from "@/lib/prisma";

type LoginPageProps = {
  searchParams: Promise<{ oauth_error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect(resolveUserHomeRoute(user));
  }
  const params = await searchParams;
  const oauthError = params.oauth_error;

  const paymentConfig = await prisma.paymentConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const serializedPaymentConfig = paymentConfig
    ? {
        id: paymentConfig.id,
        amount: paymentConfig.amount.toString(),
        currency: paymentConfig.currency,
        instructions: paymentConfig.instructions,
        qrBlobUrl: paymentConfig.qrBlobUrl,
      }
    : null;

  return <AuthForm paymentConfig={serializedPaymentConfig} oauthError={oauthError} />;
}
