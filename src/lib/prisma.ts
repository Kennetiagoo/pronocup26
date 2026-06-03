import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurado.");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const cached = global.prisma;
function hasModelField(
  client: PrismaClient | undefined,
  modelName: string,
  fieldName: string,
) {
  if (!client) return false;
  const runtimeModel = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: Array<{ name?: string }> }>;
      };
    }
  )._runtimeDataModel;
  const model = runtimeModel?.models?.[modelName];
  const fields = model?.fields ?? [];
  return fields.some((field) => field.name === fieldName);
}

const hasBonusDelegate =
  typeof cached !== "undefined" &&
  typeof (cached as unknown as { bonusConfig?: unknown }).bonusConfig !== "undefined";
const hasOfficialModeField = hasModelField(cached, "ScoringRule", "officialModeEnabled");
const hasKnockoutMultiplierField = hasModelField(cached, "ScoringRule", "knockoutMultiplier");

export const prisma =
  hasBonusDelegate && hasOfficialModeField && hasKnockoutMultiplierField
    ? cached
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

