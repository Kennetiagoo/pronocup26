import { z } from "zod";

const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;

export const registerSchema = z
  .object({
    nombres: z.string().trim().min(2).max(80),
    apellidos: z.string().trim().min(2).max(80),
    username: z
      .string()
      .trim()
      .regex(
        usernamePattern,
        "El usuario debe tener 3-24 caracteres (letras, números y guion bajo).",
      ),
    email: z.string().trim().email(),
    password: z
      .string()
      .min(10)
      .max(128)
      .regex(/[A-Z]/, "Debe incluir al menos una mayúscula.")
      .regex(/[a-z]/, "Debe incluir al menos una minúscula.")
      .regex(/[0-9]/, "Debe incluir al menos un número.")
      .regex(/[^A-Za-z0-9]/, "Debe incluir al menos un símbolo."),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const completeProfileSchema = z.object({
  nombres: z.string().trim().min(2).max(80),
  apellidos: z.string().trim().min(2).max(80),
  username: z
    .string()
    .trim()
    .regex(
      usernamePattern,
      "El usuario debe tener 3-24 caracteres (letras, números y guion bajo).",
    ),
});

export const updatePaymentConfigSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  currency: z.string().trim().min(3).max(5).default("COP"),
  instructions: z.string().trim().min(5).max(2000),
  qrImageBase64: z.string().optional(),
  crop: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      zoom: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
});

export const rejectProofSchema = z.object({
  rejectionNote: z.string().trim().min(5).max(500),
});

export const updateUserPaymentStatusSchema = z.object({
  paymentStatus: z.enum(["SIN_COMPROBANTE", "EN_REVISION", "APROBADO", "RECHAZADO"]),
  rejectionNote: z.string().trim().min(5).max(500).optional(),
});

export const updateScoringRuleSchema = z.object({
  officialModeEnabled: z.boolean(),
  knockoutMultiplier: z.number().int().min(1).max(5),
  exactScorePoints: z.number().int().min(0).max(20),
  goalDifferencePoints: z.number().int().min(0).max(20),
  outcomePoints: z.number().int().min(0).max(20),
  singleTeamGoalsPoints: z.number().int().min(0).max(20),
  drawOutcomeBonus: z.number().int().min(0).max(20),
  lockMinutesBeforeKickoff: z.number().int().min(0).max(360),
  allowSelfRegistration: z.boolean(),
});

export const updateMatchResultSchema = z.object({
  homeScore: z.number().int().min(0).max(30).nullable(),
  awayScore: z.number().int().min(0).max(30).nullable(),
  status: z.enum(["SCHEDULED", "LIVE", "FINAL"]),
  homeTeam: z.string().trim().min(1).max(120).optional(),
  awayTeam: z.string().trim().min(1).max(120).optional(),
  homeTeamCode: z.string().trim().min(2).max(8).nullable().optional(),
  awayTeamCode: z.string().trim().min(2).max(8).nullable().optional(),
});

export const updateBonusConfigSchema = z.object({
  x2EnabledGlobal: z.boolean(),
  x2GroupEnabled: z.boolean(),
  x2RoundOf32Enabled: z.boolean(),
  x2RoundOf16Enabled: z.boolean(),
  x2QuarterFinalEnabled: z.boolean(),
  x2SemiFinalEnabled: z.boolean(),
  x2ThirdPlaceEnabled: z.boolean(),
  x2FinalEnabled: z.boolean(),

  topMatchEnabledGlobal: z.boolean(),
  topGroupEnabled: z.boolean(),
  topRoundOf32Enabled: z.boolean(),
  topRoundOf16Enabled: z.boolean(),
  topQuarterFinalEnabled: z.boolean(),
  topSemiFinalEnabled: z.boolean(),
  topThirdPlaceEnabled: z.boolean(),
  topFinalEnabled: z.boolean(),
  topMatchAllowCombinationWithX2: z.boolean(),

  scorersEnabledGlobal: z.boolean(),
  scorersGroupEnabled: z.boolean(),
  scorersRoundOf32Enabled: z.boolean(),
  scorersRoundOf16Enabled: z.boolean(),
  scorersQuarterFinalEnabled: z.boolean(),
  scorersSemiFinalEnabled: z.boolean(),
  scorersThirdPlaceEnabled: z.boolean(),
  scorersFinalEnabled: z.boolean(),

  x2UsesGroup: z.number().int().min(0).max(30),
  topMultiplier: z.number().min(1).max(5),
  scorerPoint: z.number().int().min(0).max(10),
});

export const updateTopMatchSchema = z.object({
  isTopMatch: z.boolean(),
  topMultiplier: z.number().min(1).max(5).optional(),
});

export const updateTeamPlayersSchema = z.object({
  players: z.array(
    z.object({
      name: z.string().trim().min(2).max(80),
      number: z.number().int().min(0).max(99).optional(),
    }),
  ).max(26),
});

export const updateMatchScorersSchema = z.object({
  homePlayerIds: z.array(z.number().int().positive()),
  awayPlayerIds: z.array(z.number().int().positive()),
});

export const updatePredictionScorersSchema = z.object({
  homePlayerIds: z.array(z.number().int().positive()).max(15),
  awayPlayerIds: z.array(z.number().int().positive()).max(15),
});

export const acceptedProofMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

export const maxProofSizeBytes = 8 * 1024 * 1024;

