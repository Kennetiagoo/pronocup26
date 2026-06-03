import { redirect } from "next/navigation";

import CompleteProfileClient from "@/components/complete-profile-client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUserProfileComplete } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";

export default async function CompletarRegistroPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role === "ADMIN") {
    redirect("/admin");
  }
  if (isUserProfileComplete(user)) {
    redirect("/pronostico");
  }

  const [paymentConfig, latestProof] = await Promise.all([
    prisma.paymentConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      select: {
        amount: true,
        currency: true,
        instructions: true,
        qrBlobUrl: true,
      },
    }),
    prisma.paymentProof.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        rejectionNote: true,
        blobUrl: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <CompleteProfileClient
      user={{
        id: user.id,
        nombres: user.nombres,
        apellidos: user.apellidos,
        username: user.username,
        email: user.email,
        role: user.role,
        paymentStatus: user.paymentStatus,
      }}
      paymentConfig={
        paymentConfig
          ? {
              amount: paymentConfig.amount.toString(),
              currency: paymentConfig.currency,
              instructions: paymentConfig.instructions,
              qrBlobUrl: paymentConfig.qrBlobUrl,
            }
          : null
      }
      latestProof={
        latestProof
          ? {
              ...latestProof,
              createdAt: latestProof.createdAt.toISOString(),
            }
          : null
      }
    />
  );
}
