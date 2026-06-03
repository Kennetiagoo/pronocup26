import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, PaymentStatus, UserRole } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está configurado.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@prono2026.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
  const adminName = process.env.ADMIN_NAME ?? "Admin";
  const adminUsername = "admin";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: adminName,
        nombres: adminName,
        apellidos: "Prono",
        username: adminUsername,
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        paymentStatus: PaymentStatus.APROBADO,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        name: existingAdmin.name || adminName,
        nombres: existingAdmin.nombres || adminName,
        apellidos: existingAdmin.apellidos || "Prono",
        username: existingAdmin.username ?? `admin_${existingAdmin.id}`,
        role: UserRole.ADMIN,
        paymentStatus: PaymentStatus.APROBADO,
      },
    });
  }

  const existingConfig = await prisma.paymentConfig.findFirst({
    where: { isActive: true },
  });

  if (!existingConfig) {
    await prisma.paymentConfig.create({
      data: {
        isActive: true,
        amount: "50000.00",
        currency: "COP",
        instructions:
          "Realiza el pago por Bre-B/Nequi y sube el comprobante para aprobación del administrador.",
      },
    });
  }

  await prisma.bonusConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      x2EnabledGlobal: true,
      x2GroupEnabled: true,
      x2RoundOf32Enabled: false,
      x2RoundOf16Enabled: false,
      x2QuarterFinalEnabled: false,
      x2SemiFinalEnabled: false,
      x2ThirdPlaceEnabled: false,
      x2FinalEnabled: false,
      topMatchEnabledGlobal: true,
      topGroupEnabled: true,
      topRoundOf32Enabled: true,
      topRoundOf16Enabled: true,
      topQuarterFinalEnabled: true,
      topSemiFinalEnabled: true,
      topThirdPlaceEnabled: true,
      topFinalEnabled: true,
      topMatchAllowCombinationWithX2: false,
      scorersEnabledGlobal: true,
      scorersGroupEnabled: false,
      scorersRoundOf32Enabled: true,
      scorersRoundOf16Enabled: true,
      scorersQuarterFinalEnabled: true,
      scorersSemiFinalEnabled: true,
      scorersThirdPlaceEnabled: true,
      scorersFinalEnabled: true,
      x2UsesGroup: 12,
      topMultiplier: 1.5,
      scorerPoint: 1,
      activatedAt: new Date(),
    },
  });

  await prisma.scoringRule.upsert({
    where: { id: 1 },
    update: {
      officialModeEnabled: true,
      knockoutMultiplier: 2,
      exactScorePoints: 0,
      outcomePoints: 5,
      singleTeamGoalsPoints: 2,
      goalDifferencePoints: 1,
      drawOutcomeBonus: 0,
      lockMinutesBeforeKickoff: 10,
      updatedAt: new Date(),
    },
    create: {
      id: 1,
      officialModeEnabled: true,
      knockoutMultiplier: 2,
      exactScorePoints: 0,
      outcomePoints: 5,
      singleTeamGoalsPoints: 2,
      goalDifferencePoints: 1,
      drawOutcomeBonus: 0,
      lockMinutesBeforeKickoff: 10,
      allowSelfRegistration: true,
      updatedAt: new Date(),
    },
  });

  console.log("Seed completo.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
