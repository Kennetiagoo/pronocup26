import { redirect } from "next/navigation";

import AdminPanelClient from "@/components/admin-panel-client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOrCreateBonusConfig } from "@/lib/bonus";
import { autoStartLiveMatches } from "@/lib/matches/auto-live";
import { prisma } from "@/lib/prisma";
import { getOrCreateAppUiConfig } from "@/lib/ui-config";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "ADMIN") {
    redirect("/");
  }

  await autoStartLiveMatches();

  const [rule, matches, users, proofs, paymentConfig, bonusConfig, uiConfig] = await Promise.all([
    prisma.scoringRule.findUnique({ where: { id: 1 } }),
    prisma.match.findMany({
      orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
      select: {
        id: true,
        matchNumber: true,
        stage: true,
        groupName: true,
        kickoff: true,
        city: true,
        stadium: true,
        homeTeam: true,
        awayTeam: true,
        homeScore: true,
        awayScore: true,
        status: true,
        advancedTeamSide: true,
        homeTeamCode: true,
        awayTeamCode: true,
        isTopMatch: true,
        topMultiplier: true,
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        nombres: true,
        apellidos: true,
        username: true,
        email: true,
        paymentStatus: true,
        countryCode: true,
        createdAt: true,
        paymentProofs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            rejectionNote: true,
            blobUrl: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.paymentProof.findMany({
      include: {
        user: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            username: true,
            email: true,
            paymentStatus: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.paymentConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    }),
    getOrCreateBonusConfig(),
    getOrCreateAppUiConfig(),
  ]);

  if (!rule) {
    throw new Error("No existe configuración de puntaje inicial.");
  }

  const serializedMatches = matches.map((match) => ({
    ...match,
    kickoff: match.kickoff.toISOString(),
  }));

  const serializedUsers = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    paymentProofs: u.paymentProofs.map((proof) => ({
      ...proof,
      createdAt: proof.createdAt.toISOString(),
    })),
  }));

  const serializedProofs = proofs.map((proof) => ({
    ...proof,
    createdAt: proof.createdAt.toISOString(),
    reviewedAt: proof.reviewedAt ? proof.reviewedAt.toISOString() : null,
  }));

  const serializedPaymentConfig = paymentConfig
    ? {
        id: paymentConfig.id,
        amount: paymentConfig.amount.toString(),
        currency: paymentConfig.currency,
        instructions: paymentConfig.instructions,
        qrBlobUrl: paymentConfig.qrBlobUrl,
        qrCropX: paymentConfig.qrCropX,
        qrCropY: paymentConfig.qrCropY,
        qrZoom: paymentConfig.qrZoom,
        qrWidth: paymentConfig.qrWidth,
        qrHeight: paymentConfig.qrHeight,
      }
    : null;

  return (
    <AdminPanelClient
      adminUser={{
        id: user.id,
        nombres: user.nombres,
        apellidos: user.apellidos,
        username: user.username,
        email: user.email,
      }}
      initialRule={rule}
      initialMatches={serializedMatches}
      initialUsers={serializedUsers}
      initialProofs={serializedProofs}
      initialPaymentConfig={serializedPaymentConfig}
      initialBonusConfig={{
        activatedAt: bonusConfig.activatedAt.toISOString(),
        x2EnabledGlobal: bonusConfig.x2EnabledGlobal,
        x2GroupEnabled: bonusConfig.x2GroupEnabled,
        x2RoundOf32Enabled: bonusConfig.x2RoundOf32Enabled,
        x2RoundOf16Enabled: bonusConfig.x2RoundOf16Enabled,
        x2QuarterFinalEnabled: bonusConfig.x2QuarterFinalEnabled,
        x2SemiFinalEnabled: bonusConfig.x2SemiFinalEnabled,
        x2ThirdPlaceEnabled: bonusConfig.x2ThirdPlaceEnabled,
        x2FinalEnabled: bonusConfig.x2FinalEnabled,
        topMatchEnabledGlobal: bonusConfig.topMatchEnabledGlobal,
        topGroupEnabled: bonusConfig.topGroupEnabled,
        topRoundOf32Enabled: bonusConfig.topRoundOf32Enabled,
        topRoundOf16Enabled: bonusConfig.topRoundOf16Enabled,
        topQuarterFinalEnabled: bonusConfig.topQuarterFinalEnabled,
        topSemiFinalEnabled: bonusConfig.topSemiFinalEnabled,
        topThirdPlaceEnabled: bonusConfig.topThirdPlaceEnabled,
        topFinalEnabled: bonusConfig.topFinalEnabled,
        topMatchAllowCombinationWithX2: bonusConfig.topMatchAllowCombinationWithX2,
        scorersEnabledGlobal: bonusConfig.scorersEnabledGlobal,
        scorersGroupEnabled: bonusConfig.scorersGroupEnabled,
        scorersRoundOf32Enabled: bonusConfig.scorersRoundOf32Enabled,
        scorersRoundOf16Enabled: bonusConfig.scorersRoundOf16Enabled,
        scorersQuarterFinalEnabled: bonusConfig.scorersQuarterFinalEnabled,
        scorersSemiFinalEnabled: bonusConfig.scorersSemiFinalEnabled,
        scorersThirdPlaceEnabled: bonusConfig.scorersThirdPlaceEnabled,
        scorersFinalEnabled: bonusConfig.scorersFinalEnabled,
        x2UsesGroup: bonusConfig.x2UsesGroup,
        topMultiplier: bonusConfig.topMultiplier,
        scorerPoint: bonusConfig.scorerPoint,
      }}
      initialUiConfig={{
        groupStandingsVisible: uiConfig.groupStandingsVisible,
      }}
    />
  );
}

