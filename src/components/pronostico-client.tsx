"use client";

import { MatchStatus, MatchStage, PaymentStatus, UserRole } from "@prisma/client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FileUploadField } from "@/components/file-upload-field";
import { TeamBadge } from "@/components/team-badge";
import { STAGE_FILTERS_ES, STAGE_LABELS_ES } from "@/lib/i18n/es";
import { getTeamPresentation } from "@/lib/teams";
import { buildWorldCupGroupStandings } from "@/lib/world-cup-regulations";

type UserSession = {
  id: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  email: string;
  role: UserRole;
  paymentStatus: PaymentStatus;
};

type PaymentConfigClient = {
  id: number;
  amount: string;
  currency: string;
  instructions: string;
  qrBlobUrl: string | null;
} | null;

type MatchClient = {
  id: string;
  matchNumber: number;
  stage: MatchStage;
  groupName: string | null;
  groupMatchday: 1 | 2 | 3 | null;
  kickoff: string;
  kickoffLocal: string;
  city: string;
  stadium: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  ownPredictionHome: number | null;
  ownPredictionAway: number | null;
  ownPredictionPoints: number;
  ownPredictionBasePoints: number;
  ownPredictionBonusPoints: number;
  ownPredictionScorerPoints: number;
  ownPredictionUsedX2: boolean;
  ownPredictionX2Returned: boolean;
  ownPredictionTopApplied: boolean;
  ownPredictionAppliedMultiplier: number;
  ownPredictionScorerPointApplied: number;
  ownScorerPicks: Array<{ side: "HOME" | "AWAY"; playerId: number }>;
};

type ScoringRuleClient = {
  id: number;
  officialModeEnabled: boolean;
  knockoutMultiplier: number;
  exactScorePoints: number;
  goalDifferencePoints: number;
  outcomePoints: number;
  singleTeamGoalsPoints: number;
  drawOutcomeBonus: number;
  lockMinutesBeforeKickoff: number;
  allowSelfRegistration: boolean;
} | null;

type ProofClient = {
  id: number;
  blobUrl: string;
  status: PaymentStatus;
  rejectionNote: string | null;
  createdAt: string;
};

type BettorStanding = {
  position: number;
  sortOrder: number;
  userId: string;
  nombres: string;
  apellidos: string;
  username: string;
  paymentStatus: PaymentStatus;
  totalPoints: number;
  predictionCount: number;
  groupPoints: number;
  knockoutPoints: number;
  perfectHits: number;
  partialLevel2: number;
  partialLevel3: number;
  partialLevel4: number;
  x2UsedCount: number;
  x2LeftCount: number;
  registeredAt: string;
  previousPosition: number;
  movement: "UP" | "DOWN" | "SAME";
  movementDelta: number;
  remainingPotentialPoints: number;
  podiumPaths: Array<{
    targetPosition: 1 | 2 | 3;
    label: string;
    referenceName: string | null;
    currentCutPoints: number | null;
    pointsBehind: number;
    neededPoints: number;
    maxReachablePoints: number;
    alreadyInZone: boolean;
    canReach: boolean;
    verdict: "IN_ZONE" | "CAN_REACH" | "CANNOT_REACH";
  }>;
  lastFive: Array<{
    matchNumber: number;
    status: "MISS" | "POINTS" | "MAX" | "ZERO";
    points: number;
  }>;
};

type BonusConfigClient = {
  activatedAt: string;
  x2EnabledGlobal: boolean;
  x2GroupEnabled: boolean;
  x2RoundOf32Enabled: boolean;
  x2RoundOf16Enabled: boolean;
  x2QuarterFinalEnabled: boolean;
  x2SemiFinalEnabled: boolean;
  x2ThirdPlaceEnabled: boolean;
  x2FinalEnabled: boolean;
  scorersEnabledGlobal: boolean;
  scorersGroupEnabled: boolean;
  scorersRoundOf32Enabled: boolean;
  scorersRoundOf16Enabled: boolean;
  scorersQuarterFinalEnabled: boolean;
  scorersSemiFinalEnabled: boolean;
  scorersThirdPlaceEnabled: boolean;
  scorersFinalEnabled: boolean;
  topGroupEnabled: boolean;
  topRoundOf32Enabled: boolean;
  topRoundOf16Enabled: boolean;
  topQuarterFinalEnabled: boolean;
  topSemiFinalEnabled: boolean;
  topThirdPlaceEnabled: boolean;
  topFinalEnabled: boolean;
  x2UsesGroup: number;
  scorerPoint: number;
};

type Props = {
  user: UserSession;
  paymentConfig: PaymentConfigClient;
  matches: MatchClient[];
  scoringRule: ScoringRuleClient;
  proofs: ProofClient[];
  bettorStandings: BettorStanding[];
  rankingStarted: boolean;
  hasLiveMatches: boolean;
  bonusConfig: BonusConfigClient;
  teamPlayersByCode: Record<string, Array<{ id: number; name: string; number: number | null }>>;
  serverNowIso: string;
};

type ApiError = { error?: { message?: string } };

type ToastState = {
  id: number;
  kind: "success" | "error";
  text: string;
};

type X2InfoModalState = {
  matchId: string;
  matchNumber: number;
  groupMatchday: number;
  remainingDateBefore: number;
  remainingDateAfter: number;
  remainingGroupBefore: number;
  remainingGroupAfter: number;
  remainingDayBefore: number;
  remainingDayAfter: number;
  matchDateLabel: string;
};

type RevealedPredictionRow = {
  userId: string;
  name: string;
  homeScore: number;
  awayScore: number;
  usedX2: boolean;
  x2Returned: boolean;
  points: number;
  basePoints: number;
  bonusPoints: number;
  scorerPoints: number;
  pointsKind: "OFFICIAL" | "PROVISIONAL";
  scorerPicks: Array<{
    side: "HOME" | "AWAY";
    slotIndex: number;
    playerId: number;
    playerName: string;
    playerNumber: number | null;
  }>;
};

type RevealedPredictionsModalState = {
  loading: boolean;
  error: string | null;
  match: {
    id: string;
    matchNumber: number;
    status: MatchStatus;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    kickoff: string;
  } | null;
  predictions: RevealedPredictionRow[];
};

type PickFilter = "ALL" | "PENDING" | "SAVED" | "OPEN";

const DEFAULT_ENTRY_FEE_COP = 50000;
const PRIZE_TIERS = [
  {
    position: 1,
    label: "Primer lugar",
    shortLabel: "1er lugar",
    share: 0.7,
    badgeClass: "border-amber-300 bg-amber-100 text-amber-900",
    rowClass: "bg-amber-50",
  },
  {
    position: 2,
    label: "Segundo lugar",
    shortLabel: "2do lugar",
    share: 0.2,
    badgeClass: "border-slate-300 bg-slate-100 text-slate-800",
    rowClass: "bg-slate-50",
  },
  {
    position: 3,
    label: "Tercer lugar",
    shortLabel: "3er lugar",
    share: 0.1,
    badgeClass: "border-orange-300 bg-orange-100 text-orange-900",
    rowClass: "bg-orange-50",
  },
] as const;

const GROUP_FILTERS = [
  "ALL",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
] as const;

type GroupFilter = (typeof GROUP_FILTERS)[number];
type GroupKey = Exclude<GroupFilter, "ALL">;

const GROUP_COLOR_STYLES: Record<
  GroupKey,
  {
    filterIdle: string;
    filterActive: string;
    tag: string;
    tableHeader: string;
    tableHeaderText: string;
  }
> = {
  A: {
    filterIdle: "border-[#4ea64b] bg-[#d6f3d4] text-[#1f5f1f] hover:bg-[#c6ecc3]",
    filterActive: "border-[#3b9638] bg-[#45a642] text-white shadow-[0_4px_12px_rgba(34,139,34,0.34)]",
    tag: "border-[#4ea64b] bg-[#d6f3d4] text-[#1f5f1f]",
    tableHeader: "bg-[#3f9f44]",
    tableHeaderText: "text-white",
  },
  B: {
    filterIdle: "border-[#d74b4b] bg-[#ffdcdc] text-[#8f1f1f] hover:bg-[#ffcaca]",
    filterActive: "border-[#c93636] bg-[#d93a3a] text-white shadow-[0_4px_12px_rgba(220,38,38,0.34)]",
    tag: "border-[#d74b4b] bg-[#ffdcdc] text-[#8f1f1f]",
    tableHeader: "bg-[#d43b3b]",
    tableHeaderText: "text-white",
  },
  C: {
    filterIdle: "border-[#ccb93d] bg-[#fff8c7] text-[#5e5500] hover:bg-[#fff0a8]",
    filterActive: "border-[#bba620] bg-[#d1bc23] text-white shadow-[0_4px_12px_rgba(202,179,8,0.34)]",
    tag: "border-[#ccb93d] bg-[#fff8c7] text-[#5e5500]",
    tableHeader: "bg-[#9f8d00]",
    tableHeaderText: "text-white",
  },
  D: {
    filterIdle: "border-[#5f79d8] bg-[#dfe7ff] text-[#1f3f96] hover:bg-[#d0dbff]",
    filterActive: "border-[#4c67ca] bg-[#4964c8] text-white shadow-[0_4px_12px_rgba(59,130,246,0.34)]",
    tag: "border-[#5f79d8] bg-[#dfe7ff] text-[#1f3f96]",
    tableHeader: "bg-[#3758c7]",
    tableHeaderText: "text-white",
  },
  E: {
    filterIdle: "border-[#df7f31] bg-[#ffe7d2] text-[#8f4d18] hover:bg-[#ffd9b6]",
    filterActive: "border-[#cf6f22] bg-[#e4731e] text-white shadow-[0_4px_12px_rgba(234,88,12,0.34)]",
    tag: "border-[#df7f31] bg-[#ffe7d2] text-[#8f4d18]",
    tableHeader: "bg-[#d56412]",
    tableHeaderText: "text-white",
  },
  F: {
    filterIdle: "border-[#369066] bg-[#d9f5e8] text-[#1f5a48] hover:bg-[#c8efdf]",
    filterActive: "border-[#227f54] bg-[#2e9766] text-white shadow-[0_4px_12px_rgba(16,185,129,0.34)]",
    tag: "border-[#369066] bg-[#d9f5e8] text-[#1f5a48]",
    tableHeader: "bg-[#2b885b]",
    tableHeaderText: "text-white",
  },
  G: {
    filterIdle: "border-[#7e85cf] bg-[#e3e6ff] text-[#3f468e] hover:bg-[#d6dbff]",
    filterActive: "border-[#6b72c2] bg-[#737ad1] text-white shadow-[0_4px_12px_rgba(99,102,241,0.32)]",
    tag: "border-[#7e85cf] bg-[#e3e6ff] text-[#3f468e]",
    tableHeader: "bg-[#6d74c9]",
    tableHeaderText: "text-white",
  },
  H: {
    filterIdle: "border-[#3fc2b8] bg-[#d9f8f5] text-[#145e59] hover:bg-[#c8f1ed]",
    filterActive: "border-[#2cb2a7] bg-[#2fb8ad] text-white shadow-[0_4px_12px_rgba(20,184,166,0.34)]",
    tag: "border-[#3fc2b8] bg-[#d9f8f5] text-[#145e59]",
    tableHeader: "bg-[#23a99e]",
    tableHeaderText: "text-white",
  },
  I: {
    filterIdle: "border-[#4658bc] bg-[#e0e6ff] text-[#22317f] hover:bg-[#d3dcff]",
    filterActive: "border-[#3347ad] bg-[#3d51bc] text-white shadow-[0_4px_12px_rgba(67,86,174,0.34)]",
    tag: "border-[#4658bc] bg-[#e0e6ff] text-[#22317f]",
    tableHeader: "bg-[#3246b2]",
    tableHeaderText: "text-white",
  },
  J: {
    filterIdle: "border-[#d2788a] bg-[#ffe2e8] text-[#7d2e40] hover:bg-[#ffd2dc]",
    filterActive: "border-[#c35f74] bg-[#d66f84] text-white shadow-[0_4px_12px_rgba(219,39,119,0.3)]",
    tag: "border-[#d2788a] bg-[#ffe2e8] text-[#7d2e40]",
    tableHeader: "bg-[#c85c74]",
    tableHeaderText: "text-white",
  },
  K: {
    filterIdle: "border-[#b24e97] bg-[#ffe0f4] text-[#76205d] hover:bg-[#ffd0ec]",
    filterActive: "border-[#a73f8b] bg-[#b74197] text-white shadow-[0_4px_12px_rgba(192,80,160,0.34)]",
    tag: "border-[#b24e97] bg-[#ffe0f4] text-[#76205d]",
    tableHeader: "bg-[#ac328f]",
    tableHeaderText: "text-white",
  },
  L: {
    filterIdle: "border-[#885252] bg-[#ffe2e2] text-[#622f2f] hover:bg-[#ffd3d3]",
    filterActive: "border-[#7a4545] bg-[#8a4b4b] text-white shadow-[0_4px_12px_rgba(127,29,29,0.34)]",
    tag: "border-[#885252] bg-[#ffe2e2] text-[#622f2f]",
    tableHeader: "bg-[#7a3f3f]",
    tableHeaderText: "text-white",
  },
};

function resolveGroupKey(groupName: string | null | undefined): GroupKey | null {
  if (!groupName) return null;
  const normalized = groupName.toUpperCase() as GroupKey;
  return normalized in GROUP_COLOR_STYLES ? normalized : null;
}

function isEnabledForStage(config: BonusConfigClient, kind: "x2" | "scorers", stage: MatchStage) {
  const matrix: Record<MatchStage, boolean> =
    kind === "x2"
      ? {
          GROUP: config.x2GroupEnabled,
          ROUND_OF_32: config.x2RoundOf32Enabled,
          ROUND_OF_16: config.x2RoundOf16Enabled,
          QUARTER_FINAL: config.x2QuarterFinalEnabled,
          SEMI_FINAL: config.x2SemiFinalEnabled,
          THIRD_PLACE: config.x2ThirdPlaceEnabled,
          FINAL: config.x2FinalEnabled,
        }
      : {
            GROUP: config.scorersGroupEnabled,
            ROUND_OF_32: config.scorersRoundOf32Enabled,
            ROUND_OF_16: config.scorersRoundOf16Enabled,
            QUARTER_FINAL: config.scorersQuarterFinalEnabled,
            SEMI_FINAL: config.scorersSemiFinalEnabled,
            THIRD_PLACE: config.scorersThirdPlaceEnabled,
            FINAL: config.scorersFinalEnabled,
          };

  const globalEnabled =
    kind === "x2"
      ? config.x2EnabledGlobal
      : config.scorersEnabledGlobal;

  return globalEnabled && matrix[stage];
}

function isStageVisibleForUsers(config: BonusConfigClient, stage: MatchStage) {
  if (stage === "GROUP") return config.topGroupEnabled;
  if (stage === "ROUND_OF_32") return config.topRoundOf32Enabled;
  if (stage === "ROUND_OF_16") return config.topRoundOf16Enabled;
  if (stage === "QUARTER_FINAL") return config.topQuarterFinalEnabled;
  if (stage === "SEMI_FINAL") return config.topSemiFinalEnabled;
  if (stage === "THIRD_PLACE") return config.topThirdPlaceEnabled;
  return config.topFinalEnabled;
}

function paymentBadgeClass(status: PaymentStatus) {
  if (status === "APROBADO") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "EN_REVISION") return "bg-amber-100 text-amber-700 border-amber-300";
  if (status === "RECHAZADO") return "bg-rose-100 text-rose-700 border-rose-300";
  return "bg-zinc-100 text-zinc-700 border-zinc-300";
}

function paymentLabel(status: PaymentStatus) {
  if (status === "APROBADO") return "Aprobado";
  if (status === "EN_REVISION") return "En revision";
  if (status === "RECHAZADO") return "Rechazado";
  return "Sin comprobante";
}

function formatUtcDate(iso: string) {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function formatMoneyCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function formatKickoffTimeColombia(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

function formatKickoffDateColombia(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  })
    .format(new Date(iso))
    .replaceAll(".", "");
}

function dayKeyBogota(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

function buildStandings(matches: MatchClient[]) {
  return buildWorldCupGroupStandings(matches);
}

function hasSavedPrediction(match: MatchClient) {
  return match.ownPredictionHome !== null && match.ownPredictionAway !== null;
}

function formatPoints(points: number) {
  return `${points} pts`;
}

function rankingMedal(position: number) {
  if (position === 1) {
    return {
      label: "ORO",
      className: "border-amber-400 bg-amber-200 text-amber-950 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]",
    };
  }
  if (position === 2) {
    return {
      label: "PLATA",
      className: "border-slate-300 bg-slate-200 text-slate-900 shadow-[0_0_0_4px_rgba(148,163,184,0.18)]",
    };
  }
  if (position === 3) {
    return {
      label: "BRONCE",
      className: "border-orange-300 bg-orange-200 text-orange-950 shadow-[0_0_0_4px_rgba(251,146,60,0.18)]",
    };
  }
  return null;
}

function movementPresentation(row: BettorStanding) {
  if (row.movement === "UP") {
    return {
      label: row.movementDelta > 0 ? `Subio ${row.movementDelta}` : "Subio",
      className: "border-zinc-300 bg-white text-zinc-800",
    };
  }
  if (row.movement === "DOWN") {
    return {
      label: row.movementDelta > 0 ? `Bajo ${row.movementDelta}` : "Bajo",
      className: "border-zinc-300 bg-white text-zinc-800",
    };
  }
  return {
    label: "Igual",
    className: "border-zinc-300 bg-white text-zinc-700",
  };
}

function streakPresentation(status: BettorStanding["lastFive"][number]["status"]) {
  if (status === "MAX") return { label: "Pleno", className: "border-emerald-600 bg-emerald-500 text-white" };
  if (status === "POINTS") return { label: "Sumo puntos", className: "border-amber-500 bg-amber-400 text-amber-950" };
  if (status === "ZERO") return { label: "Sin puntos", className: "border-rose-600 bg-rose-500 text-white" };
  return { label: "Sin pick", className: "border-zinc-300 bg-zinc-300 text-zinc-700" };
}

function podiumPathPresentation(path: BettorStanding["podiumPaths"][number]) {
  if (path.verdict === "IN_ZONE") {
    return {
      label: "Ya esta en zona",
      className: "border-emerald-300 bg-emerald-50 text-emerald-900",
    };
  }
  if (path.verdict === "CAN_REACH") {
    return {
      label: "Puede alcanzarlo",
      className: "border-amber-300 bg-amber-50 text-amber-900",
    };
  }
  return {
    label: "No le alcanza",
    className: "border-rose-300 bg-rose-50 text-rose-900",
  };
}

async function readErrorMessage(res: Response) {
  try {
    const payload = (await res.json()) as ApiError;
    return payload?.error?.message ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export default function PronosticoClient({
  user,
  paymentConfig,
  matches: initialMatches,
  scoringRule,
  proofs,
  bettorStandings,
  rankingStarted,
  hasLiveMatches,
  bonusConfig,
  teamPlayersByCode,
  serverNowIso,
}: Props) {
  const router = useRouter();
  const [matches, setMatches] = useState(initialMatches);
  const [activeStage, setActiveStage] = useState<"ALL" | MatchStage>("ALL");
  const [activeGroup, setActiveGroup] = useState<GroupFilter>("ALL");
  const [activePickFilter, setActivePickFilter] = useState<PickFilter>("ALL");
  const [busySaveId, setBusySaveId] = useState<string | null>(null);
  const [busyUpload, setBusyUpload] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [x2InfoModal, setX2InfoModal] = useState<X2InfoModalState | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.parse(serverNowIso));
  const [showRankingInfo, setShowRankingInfo] = useState(false);
  const [selectedBettor, setSelectedBettor] = useState<BettorStanding | null>(null);
  const [revealedPredictions, setRevealedPredictions] = useState<RevealedPredictionsModalState | null>(null);
  const [editingSavedMatchById, setEditingSavedMatchById] = useState<Record<string, boolean>>({});
  const [formByMatch, setFormByMatch] = useState<
    Record<
      string,
      { home: string; away: string; useX2: boolean; homeScorerIds: number[]; awayScorerIds: number[] }
    >
  >(
    () =>
      Object.fromEntries(
        initialMatches.map((match) => [
          match.id,
          {
            home: match.ownPredictionHome === null ? "" : String(match.ownPredictionHome),
            away: match.ownPredictionAway === null ? "" : String(match.ownPredictionAway),
            useX2: match.ownPredictionUsedX2,
            homeScorerIds: match.ownScorerPicks
              .filter((pick) => pick.side === "HOME")
              .map((pick) => pick.playerId),
            awayScorerIds: match.ownScorerPicks
              .filter((pick) => pick.side === "AWAY")
              .map((pick) => pick.playerId),
          },
        ]),
      ),
  );

  const canSubmitPredictions = user.role === "ADMIN" || user.paymentStatus === "APROBADO";
  const shouldShowPaymentInfo = user.role !== "ADMIN" && user.paymentStatus !== "APROBADO";
  const latestProof = proofs[0] ?? null;
  const totalPredictionPoints = useMemo(
    () => matches.reduce((sum, match) => sum + (match.ownPredictionPoints ?? 0), 0),
    [matches],
  );
  const entryFeeCop = Number(paymentConfig?.amount ?? DEFAULT_ENTRY_FEE_COP);
  const normalizedEntryFeeCop = Number.isFinite(entryFeeCop) && entryFeeCop > 0 ? entryFeeCop : DEFAULT_ENTRY_FEE_COP;
  const approvedBettorCount = bettorStandings.filter((row) => row.paymentStatus === "APROBADO").length;
  const prizePoolCop = approvedBettorCount * normalizedEntryFeeCop;
  const prizeTiers = PRIZE_TIERS.map((tier) => ({
    ...tier,
    amount: Math.round(prizePoolCop * tier.share),
  }));
  const scoringSummaryCards = scoringRule
    ? [
        ...(scoringRule.officialModeEnabled
          ? []
          : [
              {
                key: "exact-score",
                label: "Marcador exacto",
                value: scoringRule.exactScorePoints,
                help: "Pleno clasico",
                className: "border-emerald-200 bg-emerald-50 text-emerald-800",
              },
            ]),
        {
          key: "outcome",
          label: scoringRule.officialModeEnabled ? "Resultado correcto" : "Ganador / empate",
          value: scoringRule.outcomePoints,
          help: "Ganador o empate",
          className: scoringRule.officialModeEnabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-lime-200 bg-lime-50 text-lime-800",
        },
        {
          key: "home-goals",
          label: "Goles local",
          value: scoringRule.singleTeamGoalsPoints,
          help: "Marcador del local",
          className: "border-cyan-200 bg-cyan-50 text-cyan-800",
        },
        {
          key: "away-goals",
          label: "Goles visitante",
          value: scoringRule.singleTeamGoalsPoints,
          help: "Marcador del visitante",
          className: "border-sky-200 bg-sky-50 text-sky-800",
        },
        {
          key: "goal-difference",
          label: "Diferencia",
          value: scoringRule.goalDifferencePoints,
          help: "Diferencia exacta",
          className: "border-amber-200 bg-amber-50 text-amber-800",
        },
        {
          key: "draw-bonus",
          label: "Bonus empate",
          value: scoringRule.drawOutcomeBonus,
          help: "Si el empate coincide",
          className: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
        },
        {
          key: "lock",
          label: "Cierre de picks",
          value: scoringRule.lockMinutesBeforeKickoff,
          suffix: "min",
          help: "Antes del inicio",
          className: "border-rose-200 bg-rose-50 text-rose-800",
        },
      ]
    : [];

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const standings = useMemo(() => buildStandings(matches), [matches]);
  const groupMatchdayByMatch = useMemo(() => {
    const map = new Map<string, number>();
    const grouped = new Map<string, MatchClient[]>();
    for (const match of matches) {
      if (match.stage !== "GROUP" || !match.groupName) continue;
      const key = match.groupName.toUpperCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(match);
    }
    for (const entries of grouped.values()) {
      entries
        .slice()
        .sort((a, b) => {
          const kickoffA = new Date(a.kickoff).getTime();
          const kickoffB = new Date(b.kickoff).getTime();
          if (kickoffA !== kickoffB) return kickoffA - kickoffB;
          return a.matchNumber - b.matchNumber;
        })
        .forEach((match, idx) => {
          map.set(match.id, Math.min(3, Math.floor(idx / 2) + 1));
        });
    }
    return map;
  }, [matches]);
  const x2ActiveUsages = useMemo(
    () =>
      matches.filter(
        (match) =>
          match.stage === "GROUP" && match.ownPredictionUsedX2 && !match.ownPredictionX2Returned,
      ).length,
    [matches],
  );
  const x2LeftGroup = Math.max(0, bonusConfig.x2UsesGroup - x2ActiveUsages);
  const x2ByMatchday = useMemo(() => {
    const counter = new Map<number, number>([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    for (const match of matches) {
      if (match.stage !== "GROUP" || !match.ownPredictionUsedX2 || match.ownPredictionX2Returned) continue;
      const md = groupMatchdayByMatch.get(match.id) ?? match.groupMatchday ?? 1;
      counter.set(md, (counter.get(md) ?? 0) + 1);
    }
    return counter;
  }, [matches, groupMatchdayByMatch]);
  const x2ByKickoffDay = useMemo(() => {
    const counter = new Map<string, number>();
    for (const match of matches) {
      if (match.stage !== "GROUP" || !match.ownPredictionUsedX2 || match.ownPredictionX2Returned) continue;
      const key = dayKeyBogota(match.kickoff);
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    return counter;
  }, [matches]);
  const isLocked = useCallback(
    (match: MatchClient) => {
      if (match.status === "FINAL" || match.status === "LIVE") return true;
      if (!scoringRule) return false;
      const deadline = new Date(match.kickoff).getTime() - scoringRule.lockMinutesBeforeKickoff * 60 * 1000;
      return nowMs >= deadline;
    },
    [nowMs, scoringRule],
  );
  const visibleMatches = useMemo(
    () =>
      matches.filter((match) => {
        if (!isStageVisibleForUsers(bonusConfig, match.stage)) return false;
        if (match.stage === "GROUP") return true;
        return Boolean(match.homeTeamCode && match.awayTeamCode);
      }),
    [bonusConfig, matches],
  );
  const visibleStageFilters = useMemo(
    () =>
      STAGE_FILTERS_ES.filter((item) => {
        if (item.key === "ALL") return true;
        return visibleMatches.some((match) => match.stage === item.key);
      }),
    [visibleMatches],
  );
  const visibleKnockoutMatches = useMemo(
    () =>
      visibleMatches
        .filter((match) => match.stage !== "GROUP")
        .slice()
        .sort((a, b) => a.matchNumber - b.matchNumber),
    [visibleMatches],
  );
  const pickFilterOptions = useMemo(
    () => [
      { key: "ALL" as const, label: "Todos", count: visibleMatches.length },
      {
        key: "PENDING" as const,
        label: "Pendientes",
        count: visibleMatches.filter((match) => !hasSavedPrediction(match)).length,
      },
      {
        key: "SAVED" as const,
        label: "Guardados",
        count: visibleMatches.filter((match) => hasSavedPrediction(match)).length,
      },
      {
        key: "OPEN" as const,
        label: "Abiertos",
        count: visibleMatches.filter((match) => !isLocked(match)).length,
      },
    ],
    [isLocked, visibleMatches],
  );
  const filteredMatches = useMemo(() => {
    let scoped = visibleMatches;
    if (activeStage !== "ALL") {
      scoped = scoped.filter((match) => match.stage === activeStage);
    }
    if (activeGroup !== "ALL") {
      scoped = scoped.filter(
        (match) => match.stage === "GROUP" && (match.groupName ?? "").toUpperCase() === activeGroup,
      );
    }
    if (activePickFilter === "PENDING") {
      scoped = scoped.filter((match) => !hasSavedPrediction(match));
    }
    if (activePickFilter === "SAVED") {
      scoped = scoped.filter((match) => hasSavedPrediction(match));
    }
    if (activePickFilter === "OPEN") {
      scoped = scoped.filter((match) => !isLocked(match));
    }
    return scoped;
  }, [visibleMatches, activeStage, activeGroup, activePickFilter, isLocked]);

  function pushToast(kind: "success" | "error", text: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3600);
  }

  async function onLogout() {
    setError(null);
    setMessage(null);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function onUploadProof(e: FormEvent) {
    e.preventDefault();
    if (!proofFile) return;
    setBusyUpload(true);
    setMessage(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("proof", proofFile);
      const res = await fetch("/api/payment-proofs", { method: "POST", body: formData });
      if (!res.ok) {
        const msg = await readErrorMessage(res);
        setError(msg);
        pushToast("error", msg);
        return;
      }
      setMessage("Comprobante enviado. Queda en revision.");
      pushToast("success", "Comprobante enviado correctamente.");
      setProofFile(null);
      router.refresh();
    } finally {
      setBusyUpload(false);
    }
  }

  async function onSavePrediction(matchId: string) {
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      setError("Partido no encontrado en pantalla.");
      pushToast("error", "No se guardo: partido no encontrado.");
      return;
    }
    if (hasSavedPrediction(match) && !editingSavedMatchById[matchId]) {
      setEditingSavedMatchById((current) => ({ ...current, [matchId]: true }));
      pushToast("success", "Pronostico habilitado para editar.");
      return;
    }

    const form = formByMatch[matchId];
    if (!form || form.home === "" || form.away === "") {
      setError("Debes ingresar ambos marcadores.");
      pushToast("error", "No se guardo: faltan marcadores.");
      return;
    }

    const home = Number(form.home);
    const away = Number(form.away);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      setError("Los marcadores deben ser numeros enteros mayores o iguales a 0.");
      pushToast("error", "No se guardo: marcadores invalidos.");
      return;
    }

    setBusySaveId(matchId);
    setError(null);
    setMessage(null);
    try {
      const activationMs = Date.parse(bonusConfig.activatedAt);
      const isFutureForBonus = Date.parse(match.kickoff) > activationMs;
      const x2Enabled = isFutureForBonus && isEnabledForStage(bonusConfig, "x2", match.stage);
      const scorersEnabled = isFutureForBonus && isEnabledForStage(bonusConfig, "scorers", match.stage);

      const goalsHome = Number(form.home);
      const goalsAway = Number(form.away);
      const compactHomeScorers = form.homeScorerIds
        .slice(0, Math.max(0, goalsHome))
        .filter((playerId) => Number.isInteger(playerId) && playerId > 0);
      const compactAwayScorers = form.awayScorerIds
        .slice(0, Math.max(0, goalsAway))
        .filter((playerId) => Number.isInteger(playerId) && playerId > 0);
      const totalGoals = Math.max(0, goalsHome) + Math.max(0, goalsAway);
      const totalScorers = compactHomeScorers.length + compactAwayScorers.length;
      if (scorersEnabled && totalGoals > 0 && totalScorers === 0) {
        const confirmed = window.confirm(
          "Estas guardando un marcador con goles sin goleadores. Puedes sumar puntos extra con goleadores. ¿Deseas continuar?",
        );
        if (!confirmed) {
          pushToast("error", "Guardado cancelado para que completes goleadores.");
          return;
        }
      }

      const res = await fetch(`/api/predictions/${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeScore: home,
          awayScore: away,
          useX2: x2Enabled ? form.useX2 : false,
        }),
      });
      if (!res.ok) {
        const msg = await readErrorMessage(res);
        setError(msg);
        pushToast("error", msg);
        return;
      }
      if (scorersEnabled) {
        const scorersRes = await fetch(`/api/predictions/${matchId}/scorers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homePlayerIds: compactHomeScorers,
            awayPlayerIds: compactAwayScorers,
          }),
        });
        if (!scorersRes.ok) {
          const msg = await readErrorMessage(scorersRes);
          setError(msg);
          pushToast("error", msg);
          return;
        }
      }

      const payload = (await res.json()) as {
        prediction: {
          homeScore: number;
          awayScore: number;
          points: number;
          basePoints: number;
          bonusPoints: number;
          scorerPoints: number;
          usedX2: boolean;
          x2Returned: boolean;
          topApplied: boolean;
          appliedMultiplier: number;
          scorerPointApplied: number;
        };
      };
      setMatches((current) =>
        current.map((match) =>
          match.id === matchId
            ? {
                ...match,
                ownPredictionHome: payload.prediction.homeScore,
                ownPredictionAway: payload.prediction.awayScore,
                ownPredictionPoints: payload.prediction.points,
                ownPredictionBasePoints: payload.prediction.basePoints,
                ownPredictionBonusPoints: payload.prediction.bonusPoints,
                ownPredictionScorerPoints: payload.prediction.scorerPoints,
                ownPredictionUsedX2: payload.prediction.usedX2,
                ownPredictionX2Returned: payload.prediction.x2Returned,
                ownPredictionTopApplied: payload.prediction.topApplied,
                ownPredictionAppliedMultiplier: payload.prediction.appliedMultiplier,
                ownPredictionScorerPointApplied: payload.prediction.scorerPointApplied,
                ownScorerPicks: [
                  ...compactHomeScorers.map((playerId) => ({ side: "HOME" as const, playerId })),
                  ...compactAwayScorers.map((playerId) => ({ side: "AWAY" as const, playerId })),
                ],
              }
            : match,
        ),
      );
      setEditingSavedMatchById((current) => ({ ...current, [matchId]: false }));
      setMessage("Pronostico guardado.");
      pushToast("success", "Pronostico guardado correctamente.");
    } finally {
      setBusySaveId(null);
    }
  }

  function canRevealMatchPredictions(match: MatchClient) {
    return isLocked(match) && nowMs >= Date.parse(match.kickoff);
  }

  async function openMatchPredictions(match: MatchClient) {
    if (!canRevealMatchPredictions(match)) return;
    setRevealedPredictions({
      loading: true,
      error: null,
      match: {
        id: match.id,
        matchNumber: match.matchNumber,
        status: match.status,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        kickoff: match.kickoff,
      },
      predictions: [],
    });
    try {
      const res = await fetch(`/api/matches/${match.id}/predictions`);
      if (!res.ok) {
        const msg = await readErrorMessage(res);
        setRevealedPredictions((current) =>
          current
            ? {
                ...current,
                loading: false,
                error: msg,
              }
            : current,
        );
        return;
      }
      const payload = (await res.json()) as {
        match: RevealedPredictionsModalState["match"];
        predictions: RevealedPredictionRow[];
      };
      setRevealedPredictions({
        loading: false,
        error: null,
        match: payload.match,
        predictions: payload.predictions,
      });
    } catch {
      setRevealedPredictions((current) =>
        current
          ? {
              ...current,
              loading: false,
              error: "No se pudieron cargar los pronosticos.",
            }
          : current,
      );
    }
  }

  return (
    <main className="wc-page min-h-screen px-3 py-6 text-zinc-900 sm:px-4 sm:py-8 md:px-8">
      <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-semibold shadow-[0_12px_28px_rgba(0,0,0,0.22)] ${
              toast.kind === "success"
                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                : "border-rose-300 bg-rose-100 text-rose-800"
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-6">
        <section className="wc-card rounded-[2rem] p-4 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 text-center lg:text-left">
              <p className="wc-eyebrow">Mundial 2026</p>
              <h1 className="wc-title text-3xl text-zinc-950 sm:text-5xl lg:text-7xl">Concejo de Mufas</h1>
              <p className="mx-auto mt-1 max-w-2xl text-sm text-zinc-700 sm:text-base lg:mx-0">
                Pronostica todos los partidos y sube en la tabla.
              </p>
            </div>
            <div className="mx-auto grid w-full max-w-xl gap-2 sm:grid-cols-2 lg:mx-0 lg:flex lg:w-auto lg:flex-wrap lg:justify-end lg:gap-3">
              {user.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  className="rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-2.5 text-center text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-cyan-900 shadow-[0_4px_12px_rgba(8,145,178,0.16)]"
                >
                  Panel Admin
                </Link>
              ) : null}
              <span className="rounded-2xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-center text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-violet-900 shadow-[0_4px_12px_rgba(109,40,217,0.14)]">
                {user.nombres} {user.apellidos}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-center text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-rose-800 shadow-[0_4px_12px_rgba(225,29,72,0.14)] transition hover:bg-rose-100 sm:col-span-2 lg:col-auto"
              >
                Cerrar sesion
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <p className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-emerald-700">{message}</p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-rose-300 bg-rose-100 px-4 py-3 text-rose-700">{error}</p>
        ) : null}

        <section className="wc-card-soft rounded-[1.8rem] p-5">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            {shouldShowPaymentInfo ? (
              <div className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] ${paymentBadgeClass(user.paymentStatus)}`}>
                Estado de pago: {paymentLabel(user.paymentStatus)}
              </div>
            ) : (
              <div className="rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">
                Acceso habilitado
              </div>
            )}
            <p className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold tracking-[0.04em] text-blue-900">
              Puntaje acumulado: <strong>{totalPredictionPoints} pts</strong>
            </p>
          </div>
          {bonusConfig.x2EnabledGlobal && bonusConfig.x2GroupEnabled ? (
            <p className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900">
              X2 en grupos disponibles: <strong>{x2LeftGroup}</strong> / {bonusConfig.x2UsesGroup}
            </p>
          ) : null}
          {shouldShowPaymentInfo && user.paymentStatus === "RECHAZADO" && latestProof?.rejectionNote ? (
            <p className="mt-3 rounded-xl bg-rose-100 p-3 text-sm text-rose-700">Motivo de rechazo: {latestProof.rejectionNote}</p>
          ) : null}
          {shouldShowPaymentInfo && !canSubmitPredictions ? (
            <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-700">
              Aun no puedes guardar pronosticos. Sube comprobante y espera aprobacion del admin.
            </p>
          ) : null}
        </section>

        {shouldShowPaymentInfo ? (
          <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="wc-card-soft rounded-[1.7rem] p-5">
              <p className="wc-eyebrow">Pago</p>
              <h2 className="wc-title mt-2 text-5xl text-zinc-950">Bre-B / Nequi</h2>
              <p className="mt-2 text-zinc-800">
                {paymentConfig?.amount ?? "50000.00"} {paymentConfig?.currency ?? "COP"}
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                {paymentConfig?.instructions ?? "Realiza el pago y sube tu comprobante para validacion."}
              </p>
              {paymentConfig?.qrBlobUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={paymentConfig.qrBlobUrl}
                  alt="QR de pago"
                  className="mt-4 h-56 w-56 rounded-xl border border-zinc-300 bg-white object-contain"
                />
              ) : (
                <p className="mt-4 text-sm text-amber-700">El QR no ha sido publicado todavia.</p>
              )}
            </div>

            <form onSubmit={onUploadProof} className="wc-card-soft rounded-[1.7rem] p-5">
              <p className="wc-eyebrow">Validacion</p>
              <h2 className="wc-title mt-2 text-5xl text-zinc-950">Subir comprobante</h2>
              <p className="mt-2 text-sm text-zinc-700">Permitidos: JPG, PNG, PDF. Maximo 8 MB.</p>
              {latestProof ? (
                <p className="mt-2 text-xs text-zinc-600">
                  Ultimo envio: {formatUtcDate(latestProof.createdAt)} - {" "}
                  <a href={latestProof.blobUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                    Ver comprobante
                  </a>
                </p>
              ) : null}
              <FileUploadField
                id="pronostico-proof-file"
                label="Adjuntar comprobante"
                hint="Permitidos: JPG, PNG, PDF. Maximo 8 MB."
                accept=".jpg,.jpeg,.png,.pdf"
                file={proofFile}
                onChange={setProofFile}
                className="mt-4"
              />
              <button type="submit" disabled={busyUpload || !proofFile} className="wc-button-primary mt-4 px-5 py-3 text-sm disabled:opacity-60">
                Enviar comprobante
              </button>
            </form>
          </section>
        ) : null}

        <section className="wc-card-soft rounded-[1.8rem] p-5">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row sm:items-center">
            <div className="text-center sm:text-left">
              <p className="wc-eyebrow">Ranking</p>
              <h2 className="wc-title mt-1 text-4xl text-zinc-950 sm:text-5xl">Tabla de Apostadores</h2>
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowRankingInfo((value) => !value)}
                className="rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-indigo-800 hover:bg-indigo-100"
              >
                {showRankingInfo ? "Ocultar detalle" : "Como se ordena"}
              </button>
              <span className="rounded-full border border-zinc-300 bg-zinc-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-700">
                {bettorStandings.length} {pluralize(bettorStandings.length, "jugador", "jugadores")}
              </span>
            </div>
          </div>
          {showRankingInfo ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 lg:grid-cols-[1.35fr_1fr]">
              <div>
                <p className="font-black uppercase tracking-[0.08em]">Orden de desempate</p>
                <p className="mt-2">
                  Antes del primer resultado todos comparten el #1. Luego la tabla ordena por puntos totales, menos X2
                  activos, mas X2 libres, plenos, parciales, picks guardados y fecha de registro. Si todo empata, se
                  comparte posicion con ranking deportivo.
                </p>
              </div>
              <div>
                <p className="font-black uppercase tracking-[0.08em]">Racha ultimos 5</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                  {[
                    ["MAX", "Pleno"],
                    ["POINTS", "Sumo puntos"],
                    ["ZERO", "Pick sin puntos"],
                    ["MISS", "Sin pick"],
                  ].map(([status, label]) => {
                    const item = streakPresentation(status as BettorStanding["lastFive"][number]["status"]);
                    return (
                      <span key={status} className="inline-flex items-center gap-1">
                        <span className={`h-3 w-3 rounded-full border ${item.className}`} />
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
          {!rankingStarted ? (
            <p className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700">
              El torneo aun no tiene resultados oficiales: todos comparten el primer lugar hasta que se publique el
              primer partido.
            </p>
          ) : null}
          {hasLiveMatches ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
              Tabla provisional: incluye partidos en vivo y puede cambiar hasta que el admin marque el resultado como
              finalizado.
            </p>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="wc-eyebrow text-blue-800">Bolsa acumulada</p>
              <p className="mt-2 text-2xl font-black text-blue-950">{formatMoneyCOP(prizePoolCop)}</p>
              <p className="mt-1 text-xs text-blue-800">
                {approvedBettorCount} {pluralize(approvedBettorCount, "apostador aprobado", "apostadores aprobados")} x{" "}
                {formatMoneyCOP(normalizedEntryFeeCop)}
              </p>
            </div>
            {prizeTiers.map((tier) => (
              <div key={tier.position} className={`rounded-2xl border p-4 ${tier.badgeClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="wc-eyebrow">{tier.label}</p>
                  <span className="rounded-full border border-current px-2 py-1 text-[10px] font-black">
                    {rankingMedal(tier.position)?.label}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-black">{formatMoneyCOP(tier.amount)}</p>
                <p className="mt-1 text-xs font-semibold">{Math.round(tier.share * 100)}% de la bolsa</p>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[1260px] table-fixed text-left text-sm text-zinc-900">
              <thead className="bg-zinc-50 text-zinc-700">
                <tr className="border-b border-zinc-200">
                  <th className="w-16 px-3 py-2">#</th>
                  <th className="px-3 py-2">Apostador</th>
                  <th className="w-28 px-3 py-2">Mov.</th>
                  <th className="w-32 px-3 py-2">Ultimos 5</th>
                  <th className="w-24 px-3 py-2">Grupo</th>
                  <th className="w-24 px-3 py-2">KO</th>
                  <th className="w-24 px-3 py-2">Plenos</th>
                  <th className="w-28 px-3 py-2">Puntos</th>
                  <th className="w-28 px-3 py-2">X2</th>
                  <th className="w-40 px-3 py-2">Premio</th>
                  <th className="w-28 px-3 py-2">Picks</th>
                </tr>
              </thead>
              <tbody>
                {bettorStandings.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-4 text-zinc-600">
                      Aun no hay apostadores con perfil completo.
                    </td>
                  </tr>
                ) : (
                  bettorStandings.map((row) => {
                    const isCurrentUser = row.userId === user.id;
                    const prizeTier = rankingStarted ? prizeTiers.find((tier) => tier.position === row.position) : null;
                    const medal = rankingStarted ? rankingMedal(row.position) : null;
                    const movement = movementPresentation(row);
                    return (
                      <tr
                        key={row.userId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedBettor(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedBettor(row);
                          }
                        }}
                        className={`cursor-pointer border-b border-zinc-100 transition hover:bg-zinc-50 ${
                          prizeTier?.rowClass ?? "bg-white"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex min-w-9 justify-center rounded-full border px-2 py-1 text-xs font-black ${
                              medal?.className ?? prizeTier?.badgeClass ?? "border-zinc-300 bg-zinc-100 text-zinc-800"
                            }`}
                          >
                            {row.position}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-zinc-900">
                            {(row.username || `${row.nombres} ${row.apellidos}`).toUpperCase()}
                          </p>
                          {prizeTier ? (
                            <span
                              className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${prizeTier.badgeClass}`}
                            >
                              {medal?.label ?? prizeTier.shortLabel} - {prizeTier.shortLabel}
                            </span>
                          ) : null}
                          {isCurrentUser ? (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
                              Tu
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-black uppercase tracking-[0.06em] ${movement.className}`}
                          >
                            {movement.label}
                          </span>
                          <p className="mt-1 text-[10px] text-zinc-500">Antes #{row.previousPosition}</p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {row.lastFive.length === 0 ? (
                              <span className="text-[11px] text-zinc-500">Sin resultados</span>
                            ) : (
                              row.lastFive.map((item) => {
                                const streak = streakPresentation(item.status);
                                return (
                                  <span
                                    key={`${row.userId}-${item.matchNumber}`}
                                    title={`Partido ${item.matchNumber}: ${streak.label} (${item.points} pts)`}
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-black ${streak.className}`}
                                  >
                                    {item.status === "MISS" ? "-" : item.points}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-zinc-700">{row.groupPoints}</td>
                        <td className="px-3 py-2 text-zinc-700">{row.knockoutPoints}</td>
                        <td className="px-3 py-2 text-zinc-700">
                          {row.perfectHits}
                          <span className="ml-1 text-[11px] text-zinc-500">
                            ({row.partialLevel2}/{row.partialLevel3}/{row.partialLevel4})
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold text-zinc-900">{row.totalPoints}</td>
                        <td className="px-3 py-2 text-zinc-700">
                          <span className="font-bold text-zinc-900">{row.x2UsedCount}</span>
                          <span className="text-[11px] text-zinc-500"> usados</span>
                          <span className="ml-1 text-[11px] text-zinc-500">/ {row.x2LeftCount} libres</span>
                        </td>
                        <td className="px-3 py-2 font-bold text-zinc-900">
                          {prizeTier ? formatMoneyCOP(prizeTier.amount) : "-"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700">{row.predictionCount}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-zinc-200 bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {scoringSummaryCards.map((card) => (
              <div key={card.key} className={`min-h-32 rounded-2xl border p-4 ${card.className}`}>
                <p className="wc-eyebrow">{card.label}</p>
                <p className="wc-title mt-3 text-4xl sm:text-5xl">
                  {card.value} {card.suffix ?? "pts"}
                </p>
                <p className="mt-2 text-xs font-semibold text-zinc-700">{card.help}</p>
              </div>
            ))}
          </div>
          {scoringRule ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-zinc-700">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
                Pleno grupos:{" "}
                {formatPoints(
                  scoringRule.outcomePoints +
                    scoringRule.singleTeamGoalsPoints * 2 +
                    scoringRule.goalDifferencePoints,
                )}
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
                Pleno eliminatorias:{" "}
                {formatPoints(
                  (scoringRule.outcomePoints +
                    scoringRule.singleTeamGoalsPoints * 2 +
                    scoringRule.goalDifferencePoints) *
                    Math.max(1, scoringRule.knockoutMultiplier),
                )}
              </span>
            </div>
          ) : null}
        </section>

        {scoringRule?.officialModeEnabled ? (
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            Modo oficial activo: solo 90 min + reposicion. En eliminatorias el puntaje base usa x
            {scoringRule.knockoutMultiplier}.
          </section>
        ) : null}

        <section className="wc-card-soft rounded-[1.8rem] p-5">
          <p className="wc-eyebrow text-center md:text-left">Tabla de posiciones</p>
          <h2 className="wc-title mt-1 text-center text-4xl text-zinc-950 sm:text-5xl md:text-left md:text-6xl">Fase de grupos</h2>
          <p className="mt-1 text-center text-zinc-700 md:text-left">Se actualiza cuando el admin publica resultados.</p>
          {standings.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-700">Aun no hay datos de posiciones.</p>
          ) : (
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {standings.map((group) => (
                <div key={group.groupName} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  <div
                    className={`px-4 py-3 ${
                      (() => {
                        const key = resolveGroupKey(group.groupName);
                        return key
                          ? `${GROUP_COLOR_STYLES[key].tableHeader} ${GROUP_COLOR_STYLES[key].tableHeaderText}`
                          : "bg-zinc-700 text-white";
                      })()
                    }`}
                  >
                    <h3 className="wc-title text-3xl sm:text-4xl">Grupo {group.groupName}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[540px] table-fixed bg-white text-left text-sm text-zinc-900 sm:min-w-[640px]">
                      <thead className="text-zinc-700">
                        <tr className="border-b border-zinc-200">
                          <th className="px-3 py-2">#</th>
                          <th className="w-[42%] px-3 py-2">Equipo</th>
                          <th className="px-2 py-2">PJ</th>
                          <th className="px-2 py-2">G</th>
                          <th className="px-2 py-2">E</th>
                          <th className="px-2 py-2">P</th>
                          <th className="px-2 py-2">GF</th>
                          <th className="hidden px-2 py-2 sm:table-cell">GC</th>
                          <th className="hidden px-2 py-2 sm:table-cell">DG</th>
                          <th className="px-2 py-2">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, idx) => (
                          <tr key={row.team} className="border-b border-zinc-100">
                            <td className="px-3 py-2 font-bold text-zinc-900">{idx + 1}</td>
                            <td className="px-3 py-2 font-semibold">
                              {(() => {
                                const team = getTeamPresentation(row.team, row.teamCode);
                                return <TeamBadge team={team} compact />;
                              })()}
                            </td>
                            <td className="px-2 py-2">{row.pj}</td>
                            <td className="px-2 py-2">{row.g}</td>
                            <td className="px-2 py-2">{row.e}</td>
                            <td className="px-2 py-2">{row.p}</td>
                            <td className="px-2 py-2">{row.gf}</td>
                            <td className="hidden px-2 py-2 sm:table-cell">{row.gc}</td>
                            <td className="hidden px-2 py-2 sm:table-cell">{row.dg}</td>
                            <td className="px-2 py-2 font-bold text-zinc-900">{row.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_6px_18px_rgba(0,0,0,0.07)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="wc-eyebrow">Mis picks</p>
              <p className="text-sm text-zinc-600">Filtra la lista para avanzar mas rapido.</p>
            </div>
            <div className="wc-scrollbar-none flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              {pickFilterOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setActivePickFilter(option.key)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                    activePickFilter === option.key
                      ? "border-blue-300 bg-blue-100 text-blue-900 shadow-[0_4px_12px_rgba(37,99,235,0.16)]"
                      : "border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {option.label} ({option.count})
                </button>
              ))}
            </div>
          </div>
          <div className="wc-scrollbar-none mb-3 overflow-x-auto pb-1">
            <div className="flex w-max min-w-full gap-2 px-1 md:w-full md:min-w-0 md:flex-wrap md:justify-center">
              {visibleStageFilters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveStage(item.key);
                    if (item.key !== "GROUP") setActiveGroup("ALL");
                  }}
                  className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition sm:px-5 sm:text-sm ${
                    activeStage === item.key
                      ? "border-cyan-200 bg-[linear-gradient(90deg,rgba(21,175,200,0.94),rgba(36,94,214,0.92),rgba(114,45,212,0.9))] text-white shadow-[0_4px_14px_rgba(36,94,214,0.28)]"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="wc-scrollbar-none mb-4 overflow-x-auto pb-1">
            <div className="flex w-max min-w-full gap-2 px-1 md:w-full md:min-w-0 md:flex-wrap md:justify-center">
              {GROUP_FILTERS.map((group) => {
                const isActive = activeGroup === group;
                const groupStyle = group === "ALL" ? null : GROUP_COLOR_STYLES[group];
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => {
                      setActiveGroup(group);
                      if (group !== "ALL") setActiveStage("GROUP");
                    }}
                    className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition sm:px-5 sm:text-sm ${
                      group === "ALL"
                        ? isActive
                          ? "border-violet-200 bg-[linear-gradient(90deg,rgba(102,45,215,0.92),rgba(31,94,221,0.92),rgba(23,185,179,0.9))] text-white shadow-[0_4px_12px_rgba(102,45,215,0.24)]"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                        : isActive
                          ? groupStyle?.filterActive
                          : groupStyle?.filterIdle
                    }`}
                  >
                    {group === "ALL" ? "Todos los grupos" : `Grupo ${group}`}
                  </button>
                );
              })}
            </div>
          </div>

          {visibleKnockoutMatches.length > 0 ? (
            <div className="mb-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_6px_18px_rgba(0,0,0,0.07)]">
              <div className="flex min-w-[980px] gap-4">
                {(
                  [
                    ["ROUND_OF_32", "1/16"],
                    ["ROUND_OF_16", "Octavos"],
                    ["QUARTER_FINAL", "Cuartos"],
                    ["SEMI_FINAL", "Semifinales"],
                    ["FINAL", "Final"],
                  ] as const
                ).map(([stage, label]) => {
                  const stageMatches = visibleKnockoutMatches.filter((match) => match.stage === stage);
                  if (stageMatches.length === 0) return null;
                  return (
                    <div key={stage} className="min-w-[180px] flex-1">
                      <p className="mb-2 text-center text-xs font-black uppercase tracking-[0.16em] text-zinc-700">
                        {label}
                      </p>
                      <div className="space-y-3">
                        {stageMatches.map((match) => (
                          <button
                            key={`bracket-${match.id}`}
                            type="button"
                            onClick={() => {
                              setActiveStage(match.stage);
                              setActiveGroup("ALL");
                              window.setTimeout(() => {
                                document.getElementById(`match-${match.id}`)?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                              }, 80);
                            }}
                            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 p-2 text-left text-xs transition hover:border-cyan-300 hover:bg-cyan-50"
                          >
                            <span className="font-black text-zinc-500">P{match.matchNumber}</span>
                            <span className="mt-1 block truncate font-bold text-zinc-900">{match.homeTeam}</span>
                            <span className="block truncate font-bold text-zinc-900">{match.awayTeam}</span>
                            {(match.status === "FINAL" || match.status === "LIVE") &&
                            match.homeScore !== null &&
                            match.awayScore !== null ? (
                              <span
                                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 font-bold ${
                                  match.status === "LIVE"
                                    ? "border-rose-300 bg-rose-100 text-rose-700"
                                    : "border-emerald-300 bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {match.status === "LIVE" ? "EN VIVO " : ""}
                                {match.homeScore}-{match.awayScore}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {filteredMatches.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-center text-sm text-zinc-600 shadow-[0_6px_18px_rgba(0,0,0,0.07)]">
              No hay partidos para los filtros seleccionados.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredMatches.map((match) => {
              const locked = isLocked(match);
              const finalized = match.status === "FINAL";
              const live = match.status === "LIVE";
              const revealable = canRevealMatchPredictions(match);
              const savedPrediction = hasSavedPrediction(match);
              const editingSavedPrediction = Boolean(editingSavedMatchById[match.id]);
              const inputsDisabled =
                locked || !canSubmitPredictions || (savedPrediction && !editingSavedPrediction);
              const saveButtonDisabled = busySaveId === match.id || locked || !canSubmitPredictions;
              const saveButtonText =
                busySaveId === match.id
                  ? "Guardando..."
                  : !canSubmitPredictions
                    ? "Pago pendiente"
                    : locked
                      ? savedPrediction
                        ? "Guardado"
                        : "Bloqueado"
                      : savedPrediction && !editingSavedPrediction
                        ? "Editar pronostico"
                        : savedPrediction
                          ? "Guardar cambios"
                          : "Guardar";
              const form = formByMatch[match.id] ?? {
                home: "",
                away: "",
                useX2: false,
                homeScorerIds: [],
                awayScorerIds: [],
              };
              const kickoffDateCol = formatKickoffDateColombia(match.kickoff);
              const kickoffTimeCol = formatKickoffTimeColombia(match.kickoff);
              const activationMs = Date.parse(bonusConfig.activatedAt);
              const isFutureForBonus = Date.parse(match.kickoff) > activationMs;
              const x2Enabled = isFutureForBonus && isEnabledForStage(bonusConfig, "x2", match.stage);
              const scorersEnabled = isFutureForBonus && isEnabledForStage(bonusConfig, "scorers", match.stage);
              const matchday = groupMatchdayByMatch.get(match.id) ?? match.groupMatchday ?? 1;
              const x2ByThisMatchday = x2ByMatchday.get(matchday) ?? 0;
              const x2LeftMatchday = Math.max(0, 4 - x2ByThisMatchday);
              const kickoffDayKey = dayKeyBogota(match.kickoff);
              const x2ByThisKickoffDay = x2ByKickoffDay.get(kickoffDayKey) ?? 0;
              const x2LeftKickoffDay = Math.max(0, 1 - x2ByThisKickoffDay);
              const x2LimitReached =
                match.stage === "GROUP" &&
                !form.useX2 &&
                (x2LeftGroup <= 0 || x2LeftMatchday <= 0 || x2LeftKickoffDay <= 0);
              const homePlayers = match.homeTeamCode ? (teamPlayersByCode[match.homeTeamCode] ?? []) : [];
              const awayPlayers = match.awayTeamCode ? (teamPlayersByCode[match.awayTeamCode] ?? []) : [];
              const homeSlots = Math.max(0, Math.min(15, Number(form.home) || 0));
              const awaySlots = Math.max(0, Math.min(15, Number(form.away) || 0));
              return (
                <article
                  id={`match-${match.id}`}
                  key={match.id}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button,input,select,label,a")) return;
                    void openMatchPredictions(match);
                  }}
                  className={`overflow-hidden rounded-[1.6rem] border p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)] ${
                    savedPrediction && !editingSavedPrediction
                      ? "border-emerald-300 bg-emerald-50/95"
                      : "border-zinc-200 bg-white"
                  } ${revealable ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(0,0,0,0.18)]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="wc-eyebrow text-zinc-700">Partido {match.matchNumber}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      {savedPrediction ? (
                        <span className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-[10px] font-extrabold tracking-[0.15em] text-emerald-700">
                          Guardado
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-extrabold tracking-[0.15em] ${
                          finalized
                            ? "border-zinc-300 bg-zinc-100 text-zinc-700"
                            : live
                            ? "border-rose-400 bg-rose-600 text-white"
                            : locked
                            ? "border-rose-300 bg-rose-100 text-rose-700"
                            : "border-emerald-300 bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {finalized ? "Finalizado" : live ? "En vivo" : locked ? "Bloqueado" : "Abierto"}
                      </span>
                      {revealable ? (
                        <button
                          type="button"
                          onClick={() => {
                            void openMatchPredictions(match);
                          }}
                          className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-cyan-800 hover:bg-cyan-100"
                        >
                          Ver picks
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2">
                    <p className="wc-title text-4xl text-zinc-950 sm:text-5xl">{STAGE_LABELS_ES[match.stage]}</p>
                    {match.groupName ? (
                      <span
                        className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold uppercase tracking-[0.12em] ${
                          (() => {
                            const key = resolveGroupKey(match.groupName);
                            return key ? GROUP_COLOR_STYLES[key].tag : "border-zinc-300 bg-zinc-100 text-zinc-700";
                          })()
                        }`}
                      >
                        Grupo {match.groupName}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {match.stage === "GROUP" ? (
                      <span className="rounded-full border border-indigo-300 bg-indigo-100 px-3 py-1 font-semibold uppercase tracking-[0.1em] text-indigo-800">
                        Fecha {matchday}
                      </span>
                    ) : (
                      <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 font-semibold uppercase tracking-[0.1em] text-zinc-700">
                        Eliminatoria
                      </span>
                    )}
                    <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 font-semibold uppercase tracking-[0.1em] text-zinc-700">
                      {kickoffDateCol} · {kickoffTimeCol} GMT-5
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">
                    {match.stadium}, {match.city}
                  </p>

                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {(() => {
                          const team = getTeamPresentation(match.homeTeam, match.homeTeamCode);
                          return <TeamBadge team={team} className="w-full text-xl font-bold" />;
                        })()}
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={form.home}
                        disabled={inputsDisabled}
                        onChange={(e) =>
                          setFormByMatch((value) => ({
                            ...value,
                            [match.id]: { ...form, home: e.target.value },
                          }))
                        }
                        className="h-11 w-16 rounded-xl border border-zinc-300 bg-white px-2 text-center text-2xl font-black text-zinc-900 outline-none disabled:opacity-60"
                      />
                    </div>
                    <div className="my-2 border-t border-zinc-200" />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {(() => {
                          const team = getTeamPresentation(match.awayTeam, match.awayTeamCode);
                          return <TeamBadge team={team} className="w-full text-xl font-bold" />;
                        })()}
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={form.away}
                        disabled={inputsDisabled}
                        onChange={(e) =>
                          setFormByMatch((value) => ({
                            ...value,
                            [match.id]: { ...form, away: e.target.value },
                          }))
                        }
                        className="h-11 w-16 rounded-xl border border-zinc-300 bg-white px-2 text-center text-2xl font-black text-zinc-900 outline-none disabled:opacity-60"
                      />
                    </div>
                  </div>

                  {x2Enabled ? (
                    <div className="mt-3">
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                        <span className="font-semibold">Aplicar X2 a este partido</span>
                        <input
                          type="checkbox"
                          checked={form.useX2}
                          disabled={
                            inputsDisabled ||
                            x2LimitReached
                          }
                          onChange={(e) => {
                            if (!e.target.checked) {
                              setFormByMatch((value) => ({
                                ...value,
                                [match.id]: { ...form, useX2: false },
                              }));
                              return;
                            }
                            setX2InfoModal({
                              matchId: match.id,
                              matchNumber: match.matchNumber,
                              groupMatchday: matchday,
                              remainingDateBefore: x2LeftMatchday,
                              remainingDateAfter: Math.max(0, x2LeftMatchday - 1),
                              remainingGroupBefore: x2LeftGroup,
                              remainingGroupAfter: Math.max(0, x2LeftGroup - 1),
                              remainingDayBefore: x2LeftKickoffDay,
                              remainingDayAfter: Math.max(0, x2LeftKickoffDay - 1),
                              matchDateLabel: kickoffDateCol,
                            });
                          }}
                        />
                      </label>
                      {x2LimitReached ? (
                        <p className="mt-1 text-xs text-indigo-800">
                          Limite alcanzado: revisa total de grupos (12), fecha (4) y dia (1).
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {scorersEnabled ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-700">
                        Goleadores (+{bonusConfig.scorerPoint} por acierto)
                      </p>
                      <div className="mt-2 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-zinc-200 bg-white p-2">
                          <p className="text-xs font-semibold text-zinc-700">{match.homeTeam}</p>
                          <div className="mt-2 space-y-2">
                            {Array.from({ length: homeSlots }).map((_, slot) => (
                              <select
                                key={`home-${slot}`}
                                value={form.homeScorerIds[slot] ?? ""}
                                disabled={inputsDisabled}
                                onChange={(e) => {
                                  const playerId = Number(e.target.value);
                                  setFormByMatch((value) => {
                                    const nextHome = [...form.homeScorerIds];
                                    nextHome[slot] = Number.isInteger(playerId) && playerId > 0 ? playerId : 0;
                                    return {
                                      ...value,
                                      [match.id]: {
                                        ...form,
                                        homeScorerIds: nextHome,
                                      },
                                    };
                                  });
                                }}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-800"
                              >
                                <option value="">Jugador {slot + 1}</option>
                                {homePlayers.map((player) => (
                                  <option key={player.id} value={player.id}>
                                    {player.number !== null ? `${player.number}. ` : ""}
                                    {player.name}
                                  </option>
                                ))}
                              </select>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-white p-2">
                          <p className="text-xs font-semibold text-zinc-700">{match.awayTeam}</p>
                          <div className="mt-2 space-y-2">
                            {Array.from({ length: awaySlots }).map((_, slot) => (
                              <select
                                key={`away-${slot}`}
                                value={form.awayScorerIds[slot] ?? ""}
                                disabled={inputsDisabled}
                                onChange={(e) => {
                                  const playerId = Number(e.target.value);
                                  setFormByMatch((value) => {
                                    const nextAway = [...form.awayScorerIds];
                                    nextAway[slot] = Number.isInteger(playerId) && playerId > 0 ? playerId : 0;
                                    return {
                                      ...value,
                                      [match.id]: {
                                        ...form,
                                        awayScorerIds: nextAway,
                                      },
                                    };
                                  });
                                }}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-800"
                              >
                                <option value="">Jugador {slot + 1}</option>
                                {awayPlayers.map((player) => (
                                  <option key={player.id} value={player.id}>
                                    {player.number !== null ? `${player.number}. ` : ""}
                                    {player.name}
                                  </option>
                                ))}
                              </select>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-center justify-between gap-2 text-sm text-zinc-700">
                    <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 font-bold text-zinc-900">
                      {match.ownPredictionPoints > 0
                        ? `${live ? "Prov. " : ""}${match.ownPredictionPoints} pts`
                        : live
                          ? "Prov. 0 pts"
                          : "Sin puntos"}
                    </span>
                    {(match.status === "FINAL" || match.status === "LIVE") &&
                    match.homeScore !== null &&
                    match.awayScore !== null ? (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] ${
                          match.status === "LIVE"
                            ? "border-rose-300 bg-rose-100 text-rose-700"
                            : "border-emerald-300 bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {match.status === "LIVE" ? "Provisional" : "Oficial"} {match.homeScore}-{match.awayScore}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Tu pronostico</span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={saveButtonDisabled}
                    onClick={() => onSavePrediction(match.id)}
                    className={`mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] shadow-[0_6px_16px_rgba(37,99,235,0.24)] transition hover:brightness-105 disabled:opacity-60 ${
                      savedPrediction && !editingSavedPrediction && !locked
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-indigo-200 bg-[linear-gradient(90deg,rgba(102,45,215,0.96),rgba(31,94,221,0.96),rgba(23,185,179,0.93))] text-white"
                    }`}
                  >
                    {saveButtonText}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      {revealedPredictions ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="wc-eyebrow text-zinc-700">
                  Partido {revealedPredictions.match?.matchNumber ?? ""}
                </p>
                <h3 className="wc-title mt-1 text-3xl text-zinc-950">
                  {revealedPredictions.match
                    ? `${revealedPredictions.match.homeTeam} vs ${revealedPredictions.match.awayTeam}`
                    : "Pronosticos"}
                </h3>
                {revealedPredictions.match?.homeScore !== null &&
                revealedPredictions.match?.awayScore !== null &&
                revealedPredictions.match ? (
                  <p className="mt-2 text-sm font-semibold text-zinc-700">
                    {revealedPredictions.match.status === "LIVE" ? "EN VIVO" : "FINAL"}:{" "}
                    {revealedPredictions.match.homeScore}-{revealedPredictions.match.awayScore}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setRevealedPredictions(null)}
                className="self-start rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-800"
              >
                Cerrar
              </button>
            </div>

            {revealedPredictions.loading ? (
              <p className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                Cargando pronosticos...
              </p>
            ) : null}
            {revealedPredictions.error ? (
              <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {revealedPredictions.error}
              </p>
            ) : null}
            {!revealedPredictions.loading && !revealedPredictions.error ? (
              <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200">
                <table className="min-w-[760px] w-full text-left text-sm text-zinc-900">
                  <thead className="bg-zinc-900 text-white">
                    <tr>
                      <th className="px-3 py-2">Usuario</th>
                      <th className="px-3 py-2">Pronostico</th>
                      <th className="px-3 py-2">Puntos</th>
                      <th className="px-3 py-2">X2</th>
                      <th className="px-3 py-2">Goleadores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revealedPredictions.predictions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">
                          No hay pronosticos guardados para este partido.
                        </td>
                      </tr>
                    ) : (
                      revealedPredictions.predictions.map((row) => (
                        <tr key={row.userId} className="border-t border-zinc-200">
                          <td className="px-3 py-3 font-bold">{row.name}</td>
                          <td className="px-3 py-3">
                            {row.homeScore}-{row.awayScore}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-black ${
                                row.pointsKind === "PROVISIONAL"
                                  ? "border-rose-300 bg-rose-100 text-rose-700"
                                  : "border-emerald-300 bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {row.points} pts {row.pointsKind === "PROVISIONAL" ? "prov." : "oficial"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {row.usedX2 ? (
                              <span className="rounded-full border border-indigo-300 bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-800">
                                X2{row.x2Returned ? " devuelto" : ""}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-500">No</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-zinc-700">
                            {row.scorerPicks.length === 0
                              ? "Sin picks"
                              : row.scorerPicks
                                  .map((pick) => `${pick.side === "HOME" ? "L" : "V"}: ${pick.playerName}`)
                                  .join(", ")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {selectedBettor ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="wc-eyebrow text-zinc-700">Camino al podio</p>
                <h3 className="wc-title mt-1 text-3xl text-zinc-950">
                  {(selectedBettor.username || `${selectedBettor.nombres} ${selectedBettor.apellidos}`).toUpperCase()}
                </h3>
                <p className="mt-2 text-sm text-zinc-700">
                  Posicion actual #{selectedBettor.position} · {selectedBettor.totalPoints} pts · Maximo restante{" "}
                  <strong>{selectedBettor.remainingPotentialPoints} pts</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBettor(null)}
                className="self-start rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-800"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">X2</p>
                <p className="mt-1 text-xl font-black text-zinc-950">
                  {selectedBettor.x2UsedCount} usados / {selectedBettor.x2LeftCount} libres
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">Picks</p>
                <p className="mt-1 text-xl font-black text-zinc-950">{selectedBettor.predictionCount}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">Racha</p>
                <div className="mt-2 flex gap-1">
                  {selectedBettor.lastFive.length === 0 ? (
                    <span className="text-xs text-zinc-500">Sin resultados</span>
                  ) : (
                    selectedBettor.lastFive.map((item) => {
                      const streak = streakPresentation(item.status);
                      return (
                        <span
                          key={`modal-${selectedBettor.userId}-${item.matchNumber}`}
                          title={`Partido ${item.matchNumber}: ${streak.label} (${item.points} pts)`}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black ${streak.className}`}
                        >
                          {item.status === "MISS" ? "-" : item.points}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {selectedBettor.podiumPaths.map((path) => {
                const presentation = podiumPathPresentation(path);
                const medal = rankingMedal(path.targetPosition);
                return (
                  <div key={path.targetPosition} className={`rounded-2xl border p-4 ${presentation.className}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="wc-eyebrow">{path.label}</p>
                      {medal ? (
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${medal.className}`}>
                          {medal.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm font-black uppercase tracking-[0.08em]">{presentation.label}</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p>
                        Corte actual:{" "}
                        <strong>
                          {path.referenceName ?? "Sin referencia"}{" "}
                          {path.currentCutPoints !== null ? `(${path.currentCutPoints} pts)` : ""}
                        </strong>
                      </p>
                      <p>Diferencia actual: {path.pointsBehind} pts</p>
                      <p>Puntos necesarios: {path.neededPoints} pts</p>
                      <p>Maximo alcanzable: {path.maxReachablePoints} pts</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Este calculo compara contra la tabla actual y asume el mejor rendimiento posible del apostador; no simula
              puntos futuros de otros usuarios.
            </p>
          </div>
        </div>
      ) : null}
      {x2InfoModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            <p className="wc-eyebrow text-zinc-700">Bonificador X2</p>
            <h3 className="wc-title mt-1 text-3xl text-zinc-950">Confirmar uso de X2</h3>
            <p className="mt-2 text-sm text-zinc-700">
              Partido {x2InfoModal.matchNumber} - Fecha {x2InfoModal.groupMatchday}
            </p>
            <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Grupos (total)</p>
                  <p className="text-base font-bold text-zinc-900">
                    {x2InfoModal.remainingGroupBefore} {"->"} {x2InfoModal.remainingGroupAfter}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Fecha {x2InfoModal.groupMatchday}
                  </p>
                  <p className="text-base font-bold text-zinc-900">
                    {x2InfoModal.remainingDateBefore} {"->"} {x2InfoModal.remainingDateAfter}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Dia del partido
                  </p>
                  <p className="text-base font-bold text-zinc-900">
                    {x2InfoModal.remainingDayBefore} {"->"} {x2InfoModal.remainingDayAfter}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">{x2InfoModal.matchDateLabel}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p>Si confirmas este X2, se descuentan esos cupos.</p>
                <p>Si el partido te da 0 puntos base, el X2 se te devuelve automaticamente.</p>
              </div>
              {x2InfoModal.remainingDayAfter === 0 ? (
                <p className="font-semibold text-amber-700">
                  Ojo: despues de este, no podras activar otro X2 en partidos de ese mismo dia.
                </p>
              ) : null}
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                <p className="font-semibold">Reglas rapidas</p>
                <p>Maximo 12 en fase de grupos, 4 por fecha y 1 por dia.</p>
                <p>Ejemplo: si ya usaste 1 en esa fecha de partido, no puedes activar otro para otro partido del mismo dia.</p>
                <p>Ejemplo: si usas 4 en Fecha {x2InfoModal.groupMatchday}, debes esperar la siguiente fecha.</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setX2InfoModal(null)}
                className="rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm text-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const modal = x2InfoModal;
                  if (!modal) return;
                  const current = formByMatch[modal.matchId] ?? {
                    home: "",
                    away: "",
                    useX2: false,
                    homeScorerIds: [],
                    awayScorerIds: [],
                  };
                  setFormByMatch((value) => ({
                    ...value,
                    [modal.matchId]: {
                      ...current,
                      useX2: true,
                    },
                  }));
                  setX2InfoModal(null);
                  pushToast("success", "X2 activado para este partido.");
                }}
                className="rounded-xl border border-indigo-300 bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-800"
              >
                Confirmar X2
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
