"use client";

import { MatchStatus, PaymentStatus, UserRole } from "@prisma/client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { FileUploadField } from "@/components/file-upload-field";
import { TeamBadge } from "@/components/team-badge";
import { paymentStatusLabelEs, STAGE_FILTERS_ES } from "@/lib/i18n/es";
import { getTeamPresentation } from "@/lib/teams";

type SafeAdminUser = {
  id: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  email: string;
};

type SafeScoringRule = {
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
};

type SafeMatch = {
  id: string;
  matchNumber: number;
  stage: string;
  groupName: string | null;
  kickoff: string;
  city: string;
  stadium: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  isTopMatch: boolean;
  topMultiplier: number;
};

type SafeUserRow = {
  id: string;
  role: UserRole;
  nombres: string;
  apellidos: string;
  username: string | null;
  email: string;
  paymentStatus: PaymentStatus;
  countryCode: string;
  createdAt: string;
  paymentProofs?: Array<{
    id: number;
    status: PaymentStatus;
    rejectionNote: string | null;
    blobUrl: string;
    createdAt: string;
  }>;
};

type SafeProof = {
  id: number;
  userId: string;
  status: PaymentStatus;
  rejectionNote: string | null;
  blobUrl: string;
  createdAt: string;
  user?: {
    id: string;
    nombres: string;
    apellidos: string;
    username: string | null;
    email: string;
    paymentStatus: PaymentStatus;
  };
};

type SafePaymentConfig = {
  id: number;
  amount: string;
  currency: string;
  instructions: string;
  qrBlobUrl: string | null;
  qrCropX: number | null;
  qrCropY: number | null;
  qrZoom: number | null;
  qrWidth: number | null;
  qrHeight: number | null;
};

type SafeBonusConfig = {
  activatedAt: string;
  x2EnabledGlobal: boolean;
  x2GroupEnabled: boolean;
  x2RoundOf32Enabled: boolean;
  x2RoundOf16Enabled: boolean;
  x2QuarterFinalEnabled: boolean;
  x2SemiFinalEnabled: boolean;
  x2ThirdPlaceEnabled: boolean;
  x2FinalEnabled: boolean;
  topMatchEnabledGlobal: boolean;
  topGroupEnabled: boolean;
  topRoundOf32Enabled: boolean;
  topRoundOf16Enabled: boolean;
  topQuarterFinalEnabled: boolean;
  topSemiFinalEnabled: boolean;
  topThirdPlaceEnabled: boolean;
  topFinalEnabled: boolean;
  topMatchAllowCombinationWithX2: boolean;
  scorersEnabledGlobal: boolean;
  scorersGroupEnabled: boolean;
  scorersRoundOf32Enabled: boolean;
  scorersRoundOf16Enabled: boolean;
  scorersQuarterFinalEnabled: boolean;
  scorersSemiFinalEnabled: boolean;
  scorersThirdPlaceEnabled: boolean;
  scorersFinalEnabled: boolean;
  x2UsesGroup: number;
  topMultiplier: number;
  scorerPoint: number;
};

type TeamPlayerRow = {
  id?: number;
  name: string;
  number: number | null;
};

type TeamPlayerOption = {
  id: number;
  name: string;
  number: number | null;
};

type MatchScorerDraft = {
  homePlayerIds: number[];
  awayPlayerIds: number[];
};

type Props = {
  adminUser: SafeAdminUser;
  initialRule: SafeScoringRule;
  initialMatches: SafeMatch[];
  initialUsers: SafeUserRow[];
  initialProofs: SafeProof[];
  initialPaymentConfig: SafePaymentConfig | null;
  initialBonusConfig: SafeBonusConfig;
};

type ApiError = { error?: { message?: string } };

function statusLabel(status: PaymentStatus) {
  return paymentStatusLabelEs(status);
}

function statusBadge(status: PaymentStatus) {
  if (status === "APROBADO") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "EN_REVISION") return "bg-amber-100 text-amber-700 border-amber-300";
  if (status === "RECHAZADO") return "bg-rose-100 text-rose-700 border-rose-300";
  return "bg-zinc-100 text-zinc-700 border-zinc-300";
}

function formatKickoff(isoDate: string) {
  const datePart = new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  })
    .format(new Date(isoDate))
    .replaceAll(".", "");
  const timePart = new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).format(new Date(isoDate));
  return `${datePart} ${timePart} GMT-5`;
}

function formatPoints(value: number) {
  return `${value} ${value === 1 ? "punto" : "puntos"}`;
}

function multipliedPoints(value: number, multiplier: number) {
  return Math.round(value * Math.max(1, multiplier));
}

function isScorersEnabledForStage(config: SafeBonusConfig, stage: string) {
  if (!config.scorersEnabledGlobal) return false;
  if (stage === "GROUP") return config.scorersGroupEnabled;
  if (stage === "ROUND_OF_32") return config.scorersRoundOf32Enabled;
  if (stage === "ROUND_OF_16") return config.scorersRoundOf16Enabled;
  if (stage === "QUARTER_FINAL") return config.scorersQuarterFinalEnabled;
  if (stage === "SEMI_FINAL") return config.scorersSemiFinalEnabled;
  if (stage === "THIRD_PLACE") return config.scorersThirdPlaceEnabled;
  if (stage === "FINAL") return config.scorersFinalEnabled;
  return false;
}

async function readErrorMessage(res: Response) {
  try {
    const payload = (await res.json()) as ApiError;
    return payload?.error?.message ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

async function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("No se pudo convertir el archivo a Data URL."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Error leyendo archivo."));
    };
    reader.readAsDataURL(file);
  });
}

export default function AdminPanelClient({
  adminUser,
  initialRule,
  initialMatches,
  initialUsers,
  initialProofs,
  initialPaymentConfig,
  initialBonusConfig,
}: Props) {
  const [rule, setRule] = useState(initialRule);
  const [matches, setMatches] = useState(initialMatches);
  const [users, setUsers] = useState(initialUsers);
  const [proofs, setProofs] = useState(initialProofs);
  const [filterStage, setFilterStage] = useState("ALL");
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [paymentAmount, setPaymentAmount] = useState(initialPaymentConfig?.amount ?? "50000");
  const [paymentCurrency, setPaymentCurrency] = useState(initialPaymentConfig?.currency ?? "COP");
  const [paymentInstructions, setPaymentInstructions] = useState(
    initialPaymentConfig?.instructions ??
      "Realiza el pago por Bre-B/Nequi y sube el comprobante para aprobación.",
  );
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);
  const [currentQrUrl, setCurrentQrUrl] = useState(initialPaymentConfig?.qrBlobUrl ?? null);
  const [localQrPreviewUrl, setLocalQrPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({
    x: initialPaymentConfig?.qrCropX ?? 0,
    y: initialPaymentConfig?.qrCropY ?? 0,
    zoom: initialPaymentConfig?.qrZoom ?? 1,
    width: initialPaymentConfig?.qrWidth ?? 320,
    height: initialPaymentConfig?.qrHeight ?? 320,
  });
  const [bonusConfig, setBonusConfig] = useState(initialBonusConfig);
  const [selectedTeamCode, setSelectedTeamCode] = useState<string>("");
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayerRow[]>([]);
  const [teamPlayersBusy, setTeamPlayersBusy] = useState(false);
  const [bulkPlayersInput, setBulkPlayersInput] = useState("");
  const [teamPlayerOptionsByCode, setTeamPlayerOptionsByCode] = useState<
    Record<string, TeamPlayerOption[]>
  >({});
  const [scorerDraftByMatch, setScorerDraftByMatch] = useState<Record<string, MatchScorerDraft>>({});
  const [proofFileByUser, setProofFileByUser] = useState<Record<string, File | null>>({});

  useEffect(() => {
    if (!paymentQrFile) {
      setLocalQrPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(paymentQrFile);
    setLocalQrPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [paymentQrFile]);

  const teamCodeOptions = useMemo(() => {
    const codes = new Set<string>();
    for (const match of matches) {
      if (match.homeTeamCode) codes.add(match.homeTeamCode);
      if (match.awayTeamCode) codes.add(match.awayTeamCode);
    }
    return Array.from(codes).sort((a, b) => a.localeCompare(b, "es"));
  }, [matches]);

  const teamCodeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const match of matches) {
      if (match.homeTeamCode && !map.has(match.homeTeamCode)) {
        map.set(match.homeTeamCode, match.homeTeam);
      }
      if (match.awayTeamCode && !map.has(match.awayTeamCode)) {
        map.set(match.awayTeamCode, match.awayTeam);
      }
    }
    return map;
  }, [matches]);

  const selectedTeamLabel = selectedTeamCode
    ? `${selectedTeamCode} - ${teamCodeLabelMap.get(selectedTeamCode) ?? "Seleccion"}`
    : "";

  const cleanedTeamPlayers = useMemo(
    () =>
      teamPlayers
        .map((player) => ({
          name: player.name.trim(),
          number: player.number,
        }))
        .filter((player) => player.name.length > 0),
    [teamPlayers],
  );

  const duplicateNameCount = useMemo(() => {
    const names = cleanedTeamPlayers.map((player) => player.name.toLocaleLowerCase("es"));
    const unique = new Set(names);
    return names.length - unique.size;
  }, [cleanedTeamPlayers]);

  const teamPlayersProgress = Math.min(100, Math.round((cleanedTeamPlayers.length / 26) * 100));
  const canSaveTeamPlayers =
    Boolean(selectedTeamCode) &&
    !teamPlayersBusy &&
    cleanedTeamPlayers.length > 0 &&
    cleanedTeamPlayers.length <= 26 &&
    duplicateNameCount === 0;
  const scoreRows = [
    {
      label: "Por acertar el resultado (ganador o empate)",
      groupPoints: rule.outcomePoints,
      knockoutPoints: multipliedPoints(rule.outcomePoints, rule.knockoutMultiplier),
      description:
        "Se otorga cuando el pronostico acierta si gana el local, gana el visitante o el partido termina empatado.",
    },
    {
      label: "Por acertar los goles del equipo local",
      groupPoints: rule.singleTeamGoalsPoints,
      knockoutPoints: multipliedPoints(rule.singleTeamGoalsPoints, rule.knockoutMultiplier),
      description:
        "Se otorga cuando el numero de goles pronosticado para el local coincide con el resultado oficial.",
    },
    {
      label: "Por acertar los goles del equipo visitante",
      groupPoints: rule.singleTeamGoalsPoints,
      knockoutPoints: multipliedPoints(rule.singleTeamGoalsPoints, rule.knockoutMultiplier),
      description:
        "Se otorga cuando el numero de goles pronosticado para el visitante coincide con el resultado oficial.",
    },
    {
      label: "Por acertar la diferencia de goles",
      groupPoints: rule.goalDifferencePoints,
      knockoutPoints: multipliedPoints(rule.goalDifferencePoints, rule.knockoutMultiplier),
      description:
        "Se otorga cuando la resta local menos visitante es igual en el pronostico y en el resultado oficial.",
    },
  ];
  const groupMaxPoints = scoreRows.reduce((sum, row) => sum + row.groupPoints, 0);
  const knockoutMaxPoints = scoreRows.reduce((sum, row) => sum + row.knockoutPoints, 0);

  useEffect(() => {
    if (!selectedTeamCode && teamCodeOptions.length > 0) {
      setSelectedTeamCode(teamCodeOptions[0]);
    }
  }, [selectedTeamCode, teamCodeOptions]);

  useEffect(() => {
    if (!selectedTeamCode) return;
    void loadTeamPlayers(selectedTeamCode);
  }, [selectedTeamCode]);

  const filteredMatches = useMemo(() => {
    if (filterStage === "ALL") return matches;
    return matches.filter((match) => match.stage === filterStage);
  }, [matches, filterStage]);
  const userStatusSummary = useMemo(
    () =>
      ({
        SIN_COMPROBANTE: users.filter((user) => user.paymentStatus === "SIN_COMPROBANTE").length,
        EN_REVISION: users.filter((user) => user.paymentStatus === "EN_REVISION").length,
        APROBADO: users.filter((user) => user.paymentStatus === "APROBADO").length,
        RECHAZADO: users.filter((user) => user.paymentStatus === "RECHAZADO").length,
      }) satisfies Record<PaymentStatus, number>,
    [users],
  );

  async function refreshAdminData() {
    const [usersRes, matchesRes, ruleRes, proofsRes, bonusRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/matches"),
      fetch("/api/admin/scoring-rule"),
      fetch("/api/admin/payment-proofs"),
      fetch("/api/admin/bonus-config"),
    ]);

    if (usersRes.ok) {
      const payload = (await usersRes.json()) as { users: SafeUserRow[] };
      setUsers(
        payload.users.map((u) => ({
          ...u,
          createdAt: new Date(u.createdAt).toISOString(),
          paymentProofs: (u.paymentProofs ?? []).map((proof) => ({
            ...proof,
            createdAt: new Date(proof.createdAt).toISOString(),
          })),
        })),
      );
    }
    if (matchesRes.ok) {
      const payload = (await matchesRes.json()) as { matches: SafeMatch[] };
      setMatches(payload.matches.map((m) => ({ ...m, kickoff: new Date(m.kickoff).toISOString() })));
    }
    if (ruleRes.ok) {
      const payload = (await ruleRes.json()) as { rule: SafeScoringRule };
      setRule(payload.rule);
    }
    if (proofsRes.ok) {
      const payload = (await proofsRes.json()) as { proofs: SafeProof[] };
      setProofs(payload.proofs.map((p) => ({ ...p, createdAt: new Date(p.createdAt).toISOString() })));
    }
    if (bonusRes.ok) {
      const payload = (await bonusRes.json()) as { config: SafeBonusConfig };
      setBonusConfig({
        ...payload.config,
        activatedAt: new Date(payload.config.activatedAt).toISOString(),
      });
    }
  }

  async function saveRule() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/scoring-rule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      setNotice("Configuración de puntaje actualizada.");
    } finally {
      setBusy(false);
    }
  }

  function applyOfficialPreset() {
    setRule((value) => ({
      ...value,
      officialModeEnabled: true,
      knockoutMultiplier: 2,
      exactScorePoints: 0,
      outcomePoints: 5,
      singleTeamGoalsPoints: 2,
      goalDifferencePoints: 1,
      drawOutcomeBonus: 0,
      lockMinutesBeforeKickoff: 10,
    }));
    setNotice("Preset oficial aplicado. Revisa y guarda configuracion.");
    setError(null);
  }

  async function saveBonusConfig() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/bonus-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bonusConfig),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      setNotice("Configuracion de bonificaciones actualizada. Aplica para partidos futuros.");
      await refreshAdminData();
    } finally {
      setBusy(false);
    }
  }

  async function loadTeamPlayers(teamCode: string) {
    if (!teamCode) return;
    setTeamPlayersBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teams/${teamCode}/players`);
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      const payload = (await res.json()) as {
        players: Array<{ id: number; name: string; number: number | null }>;
      };
      setTeamPlayers(
        payload.players.map((player) => ({
          id: player.id,
          name: player.name,
          number: player.number,
        })),
      );
    } finally {
      setTeamPlayersBusy(false);
    }
  }

  async function saveTeamPlayers() {
    if (!selectedTeamCode) return;
    const cleaned = cleanedTeamPlayers;

    if (cleaned.length === 0) {
      setError("Debes ingresar al menos un jugador.");
      return;
    }
    if (cleaned.length > 26) {
      setError("Solo se permiten 26 jugadores por seleccion.");
      return;
    }
    if (duplicateNameCount > 0) {
      setError("Hay nombres de jugadores repetidos. Corrigelos antes de guardar.");
      return;
    }

    setTeamPlayersBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teams/${selectedTeamCode}/players`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: cleaned }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      setNotice(`Plantilla de ${selectedTeamCode} actualizada.`);
      await loadTeamPlayers(selectedTeamCode);
    } finally {
      setTeamPlayersBusy(false);
    }
  }

  function parseBulkPlayers(text: string) {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 26);

    const parsed: TeamPlayerRow[] = rows.map((line) => {
      const tabParts = line.split("\t").map((p) => p.trim()).filter(Boolean);
      if (tabParts.length >= 2) {
        const maybeNumber = Number(tabParts[0]);
        if (Number.isInteger(maybeNumber) && maybeNumber >= 0 && maybeNumber <= 99) {
          return {
            number: maybeNumber,
            name: tabParts.slice(1).join(" "),
          };
        }
      }

      const normalized = line.replace(/^\d+\s*[-.)]?\s*/u, "").trim();
      const numMatch = line.match(/^(\d{1,2})\s*[-.)]?\s+(.+)$/u);
      if (numMatch) {
        const num = Number(numMatch[1]);
        return {
          number: Number.isInteger(num) && num >= 0 && num <= 99 ? num : null,
          name: numMatch[2].trim(),
        };
      }

      return { number: null, name: normalized || line };
    });

    return parsed.filter((player) => player.name.trim().length > 0).slice(0, 26);
  }

  function applyBulkPlayers(append: boolean) {
    const parsed = parseBulkPlayers(bulkPlayersInput);
    if (parsed.length === 0) {
      setError("No se detectaron jugadores validos para importar.");
      return;
    }
    setError(null);
    setTeamPlayers((prev) => (append ? [...prev, ...parsed].slice(0, 26) : parsed));
    setNotice(
      append
        ? `Se agregaron ${parsed.length} jugador(es) desde pegado masivo.`
      : `Se reemplazo la plantilla con ${parsed.length} jugador(es).`,
    );
  }

  async function ensureTeamOptionsLoaded(teamCode: string | null) {
    if (!teamCode) return;
    if (teamPlayerOptionsByCode[teamCode]) return;
    const res = await fetch(`/api/admin/teams/${teamCode}/players`);
    if (!res.ok) {
      throw new Error(await readErrorMessage(res));
    }
    const payload = (await res.json()) as {
      players: TeamPlayerOption[];
    };
    setTeamPlayerOptionsByCode((prev) => ({
      ...prev,
      [teamCode]: payload.players,
    }));
  }

  async function startEditingMatch(match: SafeMatch) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await Promise.all([
        ensureTeamOptionsLoaded(match.homeTeamCode),
        ensureTeamOptionsLoaded(match.awayTeamCode),
      ]);

      const scorersRes = await fetch(`/api/admin/matches/${match.id}/scorers`);
      if (!scorersRes.ok) {
        throw new Error(await readErrorMessage(scorersRes));
      }
      const scorersPayload = (await scorersRes.json()) as {
        homePlayerIds: number[];
        awayPlayerIds: number[];
      };
      setScorerDraftByMatch((prev) => ({
        ...prev,
        [match.id]: {
          homePlayerIds: scorersPayload.homePlayerIds,
          awayPlayerIds: scorersPayload.awayPlayerIds,
        },
      }));
      setEditingMatchId(match.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el editor del partido.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMatchResult(matchId: string) {
    const current = matches.find((match) => match.id === matchId);
    if (!current) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const scorersEnabled = isScorersEnabledForStage(bonusConfig, current.stage);
      const draft = scorerDraftByMatch[matchId] ?? { homePlayerIds: [], awayPlayerIds: [] };
      const expectedHome = Math.max(0, current.homeScore ?? 0);
      const expectedAway = Math.max(0, current.awayScore ?? 0);

      if (
        scorersEnabled &&
        current.status === "FINAL" &&
        ((expectedHome > 0 && draft.homePlayerIds.slice(0, expectedHome).some((id) => !id)) ||
          (expectedAway > 0 && draft.awayPlayerIds.slice(0, expectedAway).some((id) => !id)))
      ) {
        setError("Debes seleccionar todos los goleadores antes de guardar un partido finalizado.");
        return;
      }

      if (scorersEnabled) {
        const scorersRes = await fetch(`/api/admin/matches/${matchId}/scorers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homePlayerIds:
              current.status === "FINAL" ? draft.homePlayerIds.slice(0, expectedHome).filter(Boolean) : [],
            awayPlayerIds:
              current.status === "FINAL" ? draft.awayPlayerIds.slice(0, expectedAway).filter(Boolean) : [],
          }),
        });
        if (!scorersRes.ok) {
          setError(await readErrorMessage(scorersRes));
          return;
        }
      }

      const res = await fetch(`/api/admin/matches/${matchId}/result`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeScore: current.homeScore,
          awayScore: current.awayScore,
          status: current.status,
        }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }

      setNotice("Resultado oficial guardado y tabla recalculada.");
      setEditingMatchId(null);
      await refreshAdminData();
    } finally {
      setBusy(false);
    }
  }

  async function approveProof(proofId: number) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payment-proofs/${proofId}/approve`, { method: "POST" });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      setNotice("Comprobante aprobado.");
      await refreshAdminData();
    } finally {
      setBusy(false);
    }
  }

  async function rejectProof(proofId: number) {
    const reason = window.prompt("Motivo de rechazo:");
    if (!reason) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payment-proofs/${proofId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionNote: reason }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      setNotice("Comprobante rechazado.");
      await refreshAdminData();
    } finally {
      setBusy(false);
    }
  }

  async function updateUserPaymentStatus(userId: string, paymentStatus: PaymentStatus) {
    const rejectionNote =
      paymentStatus === "RECHAZADO" ? window.prompt("Motivo de rechazo para el usuario:") : undefined;
    if (paymentStatus === "RECHAZADO" && !rejectionNote) return;

    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/payment-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus, rejectionNote }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      setNotice(`Usuario actualizado a: ${statusLabel(paymentStatus)}.`);
      await refreshAdminData();
    } finally {
      setBusy(false);
    }
  }

  async function uploadUserProof(userId: string) {
    const file = proofFileByUser[userId];
    if (!file) {
      setError("Selecciona un comprobante antes de subirlo.");
      return;
    }

    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("proof", file);
      const res = await fetch(`/api/admin/users/${userId}/payment-proof`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      setProofFileByUser((current) => ({ ...current, [userId]: null }));
      setNotice("Comprobante cargado y usuario enviado a revisión.");
      await refreshAdminData();
    } finally {
      setBusy(false);
    }
  }

  async function savePaymentConfig() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const qrImageBase64 = paymentQrFile ? await toDataUrl(paymentQrFile) : undefined;
      const res = await fetch("/api/admin/payment-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: paymentAmount,
          currency: paymentCurrency,
          instructions: paymentInstructions,
          qrImageBase64,
          crop,
        }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      const payload = (await res.json()) as {
        config?: {
          amount: string | number;
          currency: string;
          instructions: string;
          qrBlobUrl: string | null;
          qrCropX: number | null;
          qrCropY: number | null;
          qrZoom: number | null;
          qrWidth: number | null;
          qrHeight: number | null;
        };
      };
      const updated = payload.config;
      if (updated) {
        setPaymentAmount(String(updated.amount));
        setPaymentCurrency(updated.currency);
        setPaymentInstructions(updated.instructions);
        setCurrentQrUrl(updated.qrBlobUrl);
        setCrop({
          x: updated.qrCropX ?? 0,
          y: updated.qrCropY ?? 0,
          zoom: updated.qrZoom ?? 1,
          width: updated.qrWidth ?? 320,
          height: updated.qrHeight ?? 320,
        });
      }
      setPaymentQrFile(null);
      setNotice("Configuración de pago actualizada.");
      await refreshAdminData();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wc-page min-h-screen px-4 py-6 text-zinc-900 sm:py-8 md:px-8">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6">
        <section className="wc-card rounded-[2rem] p-5 sm:p-7">
          <p className="wc-eyebrow">Administracion</p>
          <h1 className="wc-title mt-2 text-4xl text-zinc-950 sm:text-6xl">Panel de Control</h1>
          <p className="mt-3 max-w-4xl text-sm text-zinc-700 sm:text-base">
            Ajusta reglas de puntaje, habilita o bloquea registros, publica resultados oficiales y
            valida pagos para recalcular toda la tabla.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/pronostico"
              className="wc-button-primary px-5 py-2.5 text-sm"
            >
              Volver a Pronostico
            </Link>
            <span className="rounded-2xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-violet-900">
              Admin: {adminUser.nombres} {adminUser.apellidos} @{adminUser.username ?? adminUser.email}
            </span>
          </div>
        </section>

        {notice ? (
          <p className="rounded-xl border border-emerald-300 bg-emerald-100 p-3 text-emerald-700">{notice}</p>
        ) : null}
        {error ? <p className="rounded-xl border border-rose-300 bg-rose-100 p-3 text-rose-700">{error}</p> : null}

        <section className="wc-card-soft rounded-[1.8rem] p-5 sm:p-6">
          <p className="wc-eyebrow">Puntaje</p>
          <h2 className="wc-title mt-2 text-4xl text-zinc-950 sm:text-5xl">Configuracion</h2>
          <p className="mt-2 text-sm text-zinc-700 sm:text-base">
            Cambios aquí afectan la tabla global y se recalculan automáticamente.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyOfficialPreset}
              className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-200"
            >
              Aplicar Preset Reglamento Oficial
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium text-zinc-700">
              Modo oficial
              <select
                className="wc-input mt-2 text-base"
                value={rule.officialModeEnabled ? "ON" : "OFF"}
                onChange={(e) =>
                  setRule((v) => ({ ...v, officialModeEnabled: e.target.value === "ON" }))
                }
              >
                <option value="ON">Activo</option>
                <option value="OFF">Inactivo</option>
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Multiplicador eliminatorias
              <input
                className="wc-input mt-2 text-base"
                type="number"
                min={1}
                max={5}
                value={rule.knockoutMultiplier}
                onChange={(e) =>
                  setRule((v) => ({ ...v, knockoutMultiplier: Number(e.target.value) || 1 }))
                }
              />
            </label>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-700">
              Solo cuenta 90 min + reposicion, sin prorroga ni penales.
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-zinc-700">
              Puntos marcador exacto
              <input
                className="wc-input mt-2 text-base"
                type="number"
                value={rule.exactScorePoints}
                onChange={(e) => setRule((v) => ({ ...v, exactScorePoints: Number(e.target.value) || 0 }))}
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Puntos diferencia de gol exacta
              <input
                className="wc-input mt-2 text-base"
                type="number"
                value={rule.goalDifferencePoints}
                onChange={(e) => setRule((v) => ({ ...v, goalDifferencePoints: Number(e.target.value) || 0 }))}
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Puntos por ganador/empate correcto
              <input
                className="wc-input mt-2 text-base"
                type="number"
                value={rule.outcomePoints}
                onChange={(e) => setRule((v) => ({ ...v, outcomePoints: Number(e.target.value) || 0 }))}
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Puntos por acertar un marcador
              <input
                className="wc-input mt-2 text-base"
                type="number"
                value={rule.singleTeamGoalsPoints}
                onChange={(e) =>
                  setRule((v) => ({ ...v, singleTeamGoalsPoints: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Bonus por empate acertado
              <input
                className="wc-input mt-2 text-base"
                type="number"
                value={rule.drawOutcomeBonus}
                onChange={(e) => setRule((v) => ({ ...v, drawOutcomeBonus: Number(e.target.value) || 0 }))}
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Bloqueo antes del inicio (min)
              <input
                className="wc-input mt-2 text-base"
                type="number"
                value={rule.lockMinutesBeforeKickoff}
                onChange={(e) =>
                  setRule((v) => ({ ...v, lockMinutesBeforeKickoff: Number(e.target.value) || 0 }))
                }
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <input
              type="checkbox"
              checked={rule.allowSelfRegistration}
              onChange={(e) => setRule((v) => ({ ...v, allowSelfRegistration: e.target.checked }))}
            />
            Permitir registro público de nuevos usuarios
          </label>
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="wc-eyebrow text-emerald-800">Distribucion visible para usuarios</p>
            <h3 className="mt-1 text-2xl font-extrabold text-emerald-950">Como se calculan los puntos</h3>
            <p className="mt-2 text-sm text-emerald-900">
              En modo oficial el marcador se puntua por partes. No hay un premio separado por marcador exacto:
              el pleno sale de sumar resultado correcto, goles del local, goles del visitante y diferencia de goles.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-emerald-300 bg-white">
              <table className="min-w-[760px] w-full text-left text-sm text-zinc-900">
                <thead className="bg-emerald-700 text-white">
                  <tr>
                    <th className="px-3 py-2">Concepto</th>
                    <th className="w-40 px-3 py-2 text-center">Primera ronda</th>
                    <th className="w-48 px-3 py-2 text-center">Fases eliminatorias</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreRows.map((row) => (
                    <tr key={row.label} className="border-b border-emerald-100">
                      <td className="px-3 py-2">
                        <p className="font-semibold">{row.label}</p>
                        <p className="mt-1 text-xs text-zinc-600">{row.description}</p>
                      </td>
                      <td className="px-3 py-2 text-center font-bold">{formatPoints(row.groupPoints)}</td>
                      <td className="px-3 py-2 text-center font-bold">{formatPoints(row.knockoutPoints)}</td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50 font-black">
                    <td className="px-3 py-2">Total maximo sin X2 ni goleadores</td>
                    <td className="px-3 py-2 text-center">{formatPoints(groupMaxPoints)}</td>
                    <td className="px-3 py-2 text-center">{formatPoints(knockoutMaxPoints)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm text-zinc-800">
                <p className="font-bold text-emerald-900">Ejemplo pleno</p>
                <p className="mt-1">
                  Si pronosticas 1-0 y el partido termina 1-0, sumas resultado correcto, goles del local,
                  goles del visitante y diferencia.
                </p>
                <p className="mt-2 font-bold">
                  Grupos: {formatPoints(groupMaxPoints)}. Eliminatorias: {formatPoints(knockoutMaxPoints)}.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm text-zinc-800">
                <p className="font-bold text-emerald-900">Ejemplo parcial</p>
                <p className="mt-1">
                  Si pronosticas 2-0 y termina 3-1, aciertas ganador y diferencia de goles, pero no los goles exactos
                  de ningun equipo.
                </p>
                <p className="mt-2 font-bold">
                  Grupos: {formatPoints(rule.outcomePoints + rule.goalDifferencePoints)}. Eliminatorias:{" "}
                  {formatPoints(multipliedPoints(rule.outcomePoints + rule.goalDifferencePoints, rule.knockoutMultiplier))}.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={saveRule}
            disabled={busy}
            className="wc-button-primary mt-5 px-5 py-3 text-sm disabled:opacity-60"
          >
            Guardar configuracion
          </button>
        </section>

        <section className="wc-card-soft rounded-[1.8rem] p-5 sm:p-6">
          <p className="wc-eyebrow">Bonificaciones</p>
          <h2 className="wc-title mt-2 text-4xl text-zinc-950 sm:text-5xl">Modulos</h2>
          <p className="mt-2 text-sm text-zinc-700">
            Cambios aplican solo a partidos con kickoff posterior a la vigencia efectiva.
          </p>
          <p className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
            Vigencia efectiva actual: {formatKickoff(bonusConfig.activatedAt)}
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-sm font-bold text-zinc-900">X2</p>
              <p className="mt-1 text-xs text-zinc-600">
                Duplica el puntaje base del partido cuando el usuario lo activa antes del cierre. Si el usuario hace
                0 puntos base, el X2 se devuelve automaticamente.
              </p>
              <label className="mt-2 flex items-center justify-between text-sm text-zinc-700">
                Activar global
                <input
                  type="checkbox"
                  checked={bonusConfig.x2EnabledGlobal}
                  onChange={(e) => setBonusConfig((v) => ({ ...v, x2EnabledGlobal: e.target.checked }))}
                />
              </label>
              <label className="mt-2 text-sm text-zinc-700">
                Usos en grupos
                <input
                  type="number"
                  min={0}
                  max={30}
                  className="wc-input mt-1 px-3 py-2 text-sm"
                  value={bonusConfig.x2UsesGroup}
                  onChange={(e) => setBonusConfig((v) => ({ ...v, x2UsesGroup: Number(e.target.value) || 0 }))}
                />
              </label>
              <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                <p className="font-bold">Limites en grupos</p>
                <p>Total de usos configurado aqui, maximo 4 por fecha y maximo 1 por dia de partidos.</p>
                <p>Ejemplo: si un pleno vale {formatPoints(groupMaxPoints)}, con X2 vale {formatPoints(groupMaxPoints * 2)}.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-sm font-bold text-zinc-900">Goleadores</p>
              <p className="mt-1 text-xs text-zinc-600">
                Suma puntos extra por cada slot de goleador acertado. Los goleadores no se duplican con X2; se suman al
                total despues del puntaje base.
              </p>
              <label className="mt-2 flex items-center justify-between text-sm text-zinc-700">
                Activar global
                <input
                  type="checkbox"
                  checked={bonusConfig.scorersEnabledGlobal}
                  onChange={(e) =>
                    setBonusConfig((v) => ({ ...v, scorersEnabledGlobal: e.target.checked }))
                  }
                />
              </label>
              <label className="mt-2 text-sm text-zinc-700">
                Puntos por slot acertado
                <input
                  type="number"
                  min={0}
                  max={10}
                  className="wc-input mt-1 px-3 py-2 text-sm"
                  value={bonusConfig.scorerPoint}
                  onChange={(e) => setBonusConfig((v) => ({ ...v, scorerPoint: Number(e.target.value) || 0 }))}
                />
              </label>
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-bold">Como se usa</p>
                <p>Si el usuario pronostica 2 goles para una seleccion, aparecen 2 espacios para elegir goleadores.</p>
                <p>Cada espacio acertado suma {formatPoints(bonusConfig.scorerPoint)}.</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-bold text-zinc-900">Fases habilitadas</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ["GROUP", "Grupos"],
                  ["ROUND_OF_32", "Dieciseisavos"],
                  ["ROUND_OF_16", "Octavos"],
                  ["QUARTER_FINAL", "Cuartos"],
                  ["SEMI_FINAL", "Semifinales"],
                  ["THIRD_PLACE", "Tercer puesto"],
                  ["FINAL", "Final"],
                ] as const
              ).map(([stage, label]) => (
                <div key={stage} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700">{label}</p>
                  <label className="mt-2 flex items-center justify-between text-xs text-zinc-700">
                    X2
                    <input
                      type="checkbox"
                      checked={
                        stage === "GROUP"
                          ? bonusConfig.x2GroupEnabled
                          : stage === "ROUND_OF_32"
                            ? bonusConfig.x2RoundOf32Enabled
                            : stage === "ROUND_OF_16"
                              ? bonusConfig.x2RoundOf16Enabled
                              : stage === "QUARTER_FINAL"
                                ? bonusConfig.x2QuarterFinalEnabled
                                : stage === "SEMI_FINAL"
                                  ? bonusConfig.x2SemiFinalEnabled
                                  : stage === "THIRD_PLACE"
                                    ? bonusConfig.x2ThirdPlaceEnabled
                                    : bonusConfig.x2FinalEnabled
                      }
                      onChange={(e) =>
                        setBonusConfig((v) => ({
                          ...v,
                          ...(stage === "GROUP"
                            ? { x2GroupEnabled: e.target.checked }
                            : stage === "ROUND_OF_32"
                              ? { x2RoundOf32Enabled: e.target.checked }
                              : stage === "ROUND_OF_16"
                                ? { x2RoundOf16Enabled: e.target.checked }
                                : stage === "QUARTER_FINAL"
                                  ? { x2QuarterFinalEnabled: e.target.checked }
                                  : stage === "SEMI_FINAL"
                                    ? { x2SemiFinalEnabled: e.target.checked }
                                    : stage === "THIRD_PLACE"
                                      ? { x2ThirdPlaceEnabled: e.target.checked }
                                      : { x2FinalEnabled: e.target.checked }),
                        }))
                      }
                    />
                  </label>
                  <label className="mt-2 flex items-center justify-between text-xs text-zinc-700">
                    Goleadores
                    <input
                      type="checkbox"
                      checked={
                        stage === "GROUP"
                          ? bonusConfig.scorersGroupEnabled
                          : stage === "ROUND_OF_32"
                            ? bonusConfig.scorersRoundOf32Enabled
                            : stage === "ROUND_OF_16"
                              ? bonusConfig.scorersRoundOf16Enabled
                              : stage === "QUARTER_FINAL"
                                ? bonusConfig.scorersQuarterFinalEnabled
                                : stage === "SEMI_FINAL"
                                  ? bonusConfig.scorersSemiFinalEnabled
                                  : stage === "THIRD_PLACE"
                                    ? bonusConfig.scorersThirdPlaceEnabled
                                    : bonusConfig.scorersFinalEnabled
                      }
                      onChange={(e) =>
                        setBonusConfig((v) => ({
                          ...v,
                          ...(stage === "GROUP"
                            ? { scorersGroupEnabled: e.target.checked }
                            : stage === "ROUND_OF_32"
                              ? { scorersRoundOf32Enabled: e.target.checked }
                              : stage === "ROUND_OF_16"
                                ? { scorersRoundOf16Enabled: e.target.checked }
                                : stage === "QUARTER_FINAL"
                                  ? { scorersQuarterFinalEnabled: e.target.checked }
                                  : stage === "SEMI_FINAL"
                                    ? { scorersSemiFinalEnabled: e.target.checked }
                                    : stage === "THIRD_PLACE"
                                      ? { scorersThirdPlaceEnabled: e.target.checked }
                                      : { scorersFinalEnabled: e.target.checked }),
                        }))
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={saveBonusConfig}
            disabled={busy}
            className="wc-button-primary mt-5 px-5 py-3 text-sm disabled:opacity-60"
          >
            Guardar bonificaciones
          </button>
        </section>

        <section className="wc-card-soft rounded-[1.8rem] p-5 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="wc-eyebrow">Plantillas</p>
              <h2 className="wc-title mt-2 text-4xl text-zinc-950 sm:text-5xl">Jugadores por seleccion</h2>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm text-zinc-700">
                Seleccion
                <select
                  className="wc-input mt-1 min-w-[180px] px-3 py-2 text-sm"
                  value={selectedTeamCode}
                  onChange={(e) => setSelectedTeamCode(e.target.value)}
                >
                  {teamCodeOptions.length === 0 ? (
                    <option value="">Sin codigos</option>
                  ) : (
                    teamCodeOptions.map((code) => (
                      <option key={code} value={code}>
                        {code} - {teamCodeLabelMap.get(code) ?? "Seleccion"}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (selectedTeamCode) void loadTeamPlayers(selectedTeamCode);
                }}
                disabled={teamPlayersBusy || !selectedTeamCode}
                className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-800 hover:bg-zinc-200 disabled:opacity-60"
              >
                Recargar
              </button>
              <button
                type="button"
                onClick={saveTeamPlayers}
                disabled={!canSaveTeamPlayers}
                className="wc-button-primary px-4 py-2 text-xs disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-600">
                    {selectedTeamLabel || "Seleccion no elegida"}
                  </p>
                  <p className="text-sm font-bold text-zinc-900">
                    {cleanedTeamPlayers.length} / 26 validos
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTeamPlayers((rows) => [...rows, { name: "", number: null }].slice(0, 26))}
                    disabled={teamPlayersBusy || teamPlayers.length >= 26}
                    className="rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-emerald-800 hover:bg-emerald-200 disabled:opacity-60"
                  >
                    Agregar
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeamPlayers((rows) => rows.filter((row) => row.name.trim().length > 0))}
                    disabled={teamPlayersBusy || teamPlayers.length === 0}
                    className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-amber-800 hover:bg-amber-200 disabled:opacity-60"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(21,175,200,0.94),rgba(36,94,214,0.92),rgba(114,45,212,0.9))] transition-all"
                  style={{ width: `${teamPlayersProgress}%` }}
                />
              </div>
              {duplicateNameCount > 0 ? (
                <p className="mt-2 text-xs font-semibold text-rose-700">
                  {duplicateNameCount} nombre(s) repetido(s).
                </p>
              ) : null}

              <div className="mt-3 max-h-[430px] overflow-auto pr-1">
                {teamPlayersBusy ? (
                  <p className="text-sm text-zinc-600">Cargando plantilla...</p>
                ) : (
                  <div className="space-y-1.5">
                    {teamPlayers.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
                        Sin jugadores cargados.
                      </div>
                    ) : null}
                    {teamPlayers.map((row, idx) => (
                      <div
                        key={`${row.id ?? "new"}-${idx}`}
                        className="grid grid-cols-[34px_72px_minmax(0,1fr)_74px] items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2"
                      >
                        <span className="text-xs font-bold text-zinc-600">{idx + 1}</span>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={row.number ?? ""}
                          onChange={(e) =>
                            setTeamPlayers((rows) =>
                              rows.map((current, i) =>
                                i === idx
                                  ? {
                                      ...current,
                                      number: e.target.value === "" ? null : Number(e.target.value),
                                    }
                                  : current,
                              ),
                            )
                          }
                          className="wc-input px-2 py-1.5 text-sm"
                          placeholder="N°"
                        />
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) =>
                            setTeamPlayers((rows) =>
                              rows.map((current, i) =>
                                i === idx ? { ...current, name: e.target.value } : current,
                              ),
                            )
                          }
                          className="wc-input min-w-0 px-2 py-1.5 text-sm"
                          placeholder="Nombre del jugador"
                        />
                        <button
                          type="button"
                          onClick={() => setTeamPlayers((rows) => rows.filter((_, i) => i !== idx))}
                          className="rounded-lg border border-rose-300 bg-rose-100 px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-rose-700 hover:bg-rose-200"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <details className="rounded-2xl border border-zinc-200 bg-white p-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-zinc-700">
                Pegado masivo
              </summary>
              <textarea
                value={bulkPlayersInput}
                onChange={(e) => setBulkPlayersInput(e.target.value)}
                rows={8}
                placeholder={"10 Juan Perez\n9 Maria Gomez\nRodrigo Martinez"}
                className="wc-input mt-3 w-full px-3 py-2 text-sm"
              />
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  onClick={() => applyBulkPlayers(false)}
                  disabled={teamPlayersBusy || bulkPlayersInput.trim().length === 0}
                  className="rounded-xl border border-cyan-300 bg-cyan-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-cyan-900 hover:bg-cyan-200 disabled:opacity-60"
                >
                  Reemplazar
                </button>
                <button
                  type="button"
                  onClick={() => applyBulkPlayers(true)}
                  disabled={teamPlayersBusy || bulkPlayersInput.trim().length === 0 || teamPlayers.length >= 26}
                  className="rounded-xl border border-indigo-300 bg-indigo-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-indigo-900 hover:bg-indigo-200 disabled:opacity-60"
                >
                  Agregar al final
                </button>
              </div>
            </details>
          </div>
        </section>

        <section className="wc-card-soft rounded-[1.8rem] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="wc-title text-4xl text-zinc-950 sm:text-5xl">Gestion de Usuarios</h2>
            <span className="rounded-full border border-zinc-300 bg-zinc-100 px-4 py-1 text-xs font-bold uppercase tracking-[0.12em] text-zinc-700">
              {users.length} USUARIOS
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-700 sm:text-base">
            Cambia estados de pago, sube comprobantes por el usuario y deja ingresos listos sin esperar que cada
            jugador complete todo desde su panel.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["APROBADO", "Aprobados"],
                ["EN_REVISION", "En revision"],
                ["SIN_COMPROBANTE", "Sin comprobante"],
                ["RECHAZADO", "Rechazados"],
              ] as const
            ).map(([status, label]) => (
              <div key={status} className={`rounded-2xl border p-4 ${statusBadge(status)}`}>
                <p className="text-xs font-bold uppercase tracking-[0.12em]">{label}</p>
                <p className="mt-1 text-3xl font-black">{userStatusSummary[status]}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {users.length === 0 ? (
              <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
                No hay usuarios registrados para mostrar.
              </p>
            ) : (
              users.map((u) => {
                const latestProof = u.paymentProofs?.[0] ?? null;
                const isAdminUser = u.role === "ADMIN";
                return (
                <div
                  key={u.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_8px_22px_rgba(0,0,0,0.08)]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 sm:text-base">
                        {u.nombres} {u.apellidos} @{u.username ?? "sin-usuario"}
                      </p>
                      <p className="text-xs text-zinc-500 sm:text-sm">{u.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {isAdminUser ? (
                          <span className="rounded-full border border-violet-300 bg-violet-100 px-3 py-1 text-sm font-bold text-violet-800">
                            Admin
                          </span>
                        ) : null}
                        <span className={`rounded-full border px-3 py-1 text-sm ${statusBadge(u.paymentStatus)}`}>
                          {statusLabel(u.paymentStatus)}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600">
                          {u.countryCode}
                        </span>
                      </div>
                      {isAdminUser ? (
                        <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
                          Cuenta administradora incluida en la lista.
                        </p>
                      ) : latestProof ? (
                        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-800">Ultimo comprobante</span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(latestProof.status)}`}>
                              {statusLabel(latestProof.status)}
                            </span>
                            <a
                              href={latestProof.blobUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-cyan-300 bg-cyan-50 px-2 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cyan-800 hover:bg-cyan-100"
                            >
                              Ver archivo
                            </a>
                          </div>
                          {latestProof.rejectionNote ? (
                            <p className="mt-2 text-xs text-rose-700">Motivo: {latestProof.rejectionNote}</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                          Este usuario aun no tiene comprobantes cargados.
                        </p>
                      )}
                    </div>
                    {isAdminUser ? (
                      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800 lg:w-[420px]">
                        El admin se muestra para control interno.
                      </div>
                    ) : (
                      <div className="grid min-w-0 gap-3 lg:w-[420px]">
                        <FileUploadField
                          id={`admin-user-proof-${u.id}`}
                          label="Subir comprobante"
                          hint="JPG, PNG o PDF. Al subirlo queda en revision."
                          accept=".jpg,.jpeg,.png,.pdf"
                          file={proofFileByUser[u.id] ?? null}
                          onChange={(file) =>
                            setProofFileByUser((current) => ({
                              ...current,
                              [u.id]: file,
                            }))
                          }
                          className="border-zinc-300 bg-zinc-50"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => uploadUserProof(u.id)}
                            disabled={busy || !proofFileByUser[u.id]}
                            className="rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
                          >
                            Subir
                          </button>
                          <button
                            type="button"
                            onClick={() => updateUserPaymentStatus(u.id, "EN_REVISION")}
                            disabled={busy || u.paymentStatus === "EN_REVISION"}
                            className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                          >
                            A revision
                          </button>
                          <button
                            type="button"
                            onClick={() => updateUserPaymentStatus(u.id, "APROBADO")}
                            disabled={busy || u.paymentStatus === "APROBADO"}
                            className="rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => updateUserPaymentStatus(u.id, "RECHAZADO")}
                            disabled={busy || u.paymentStatus === "RECHAZADO"}
                            className="rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-rose-700 hover:bg-rose-200 disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            onClick={() => updateUserPaymentStatus(u.id, "SIN_COMPROBANTE")}
                            disabled={busy || u.paymentStatus === "SIN_COMPROBANTE"}
                            className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </section>

        <section className="wc-card-soft rounded-[1.8rem] p-5 sm:p-6">
          <h2 className="wc-title text-4xl text-zinc-950 sm:text-5xl">Resultados Oficiales</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {STAGE_FILTERS_ES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilterStage(option.key)}
                className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition sm:text-sm ${
                  filterStage === option.key
                    ? "border-cyan-200 bg-[linear-gradient(90deg,rgba(21,175,200,0.94),rgba(36,94,214,0.92),rgba(114,45,212,0.9))] text-white shadow-[0_4px_14px_rgba(36,94,214,0.28)]"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-5 max-h-[780px] space-y-3 overflow-auto pr-1">
            {filteredMatches.map((match) => {
              const isEditing = editingMatchId === match.id;
              const scorersEnabled = isScorersEnabledForStage(bonusConfig, match.stage);
              const draft = scorerDraftByMatch[match.id] ?? { homePlayerIds: [], awayPlayerIds: [] };
              const homeGoals = Math.max(0, match.homeScore ?? 0);
              const awayGoals = Math.max(0, match.awayScore ?? 0);
              const homeOptions = match.homeTeamCode ? (teamPlayerOptionsByCode[match.homeTeamCode] ?? []) : [];
              const awayOptions = match.awayTeamCode ? (teamPlayerOptionsByCode[match.awayTeamCode] ?? []) : [];
              return (
                <div key={match.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="wc-eyebrow text-zinc-700">
                    PARTIDO {match.matchNumber} - {match.stage.replaceAll("_", " ")}
                    {match.groupName ? ` - ${match.groupName}` : ""}
                  </p>
                  <p className="mt-1 text-base font-semibold text-zinc-900 sm:text-lg">
                    {match.stadium}, {match.city}
                  </p>
                  <p className="text-xs text-zinc-500 sm:text-sm">{formatKickoff(match.kickoff)}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-base font-semibold text-zinc-900">
                    <span className="min-w-[210px] max-w-[280px]">
                      <TeamBadge
                        team={getTeamPresentation(match.homeTeam, match.homeTeamCode)}
                        className="w-full"
                      />
                    </span>
                    <input
                      type="number"
                      disabled={!isEditing}
                      value={match.homeScore ?? ""}
                      onChange={(e) =>
                        setMatches((items) =>
                          items.map((item) =>
                            item.id === match.id
                              ? { ...item, homeScore: e.target.value === "" ? null : Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                      className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-zinc-900"
                    />
                    <span>-</span>
                    <input
                      type="number"
                      disabled={!isEditing}
                      value={match.awayScore ?? ""}
                      onChange={(e) =>
                        setMatches((items) =>
                          items.map((item) =>
                            item.id === match.id
                              ? { ...item, awayScore: e.target.value === "" ? null : Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                      className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-zinc-900"
                    />
                    <span className="min-w-[210px] max-w-[280px]">
                      <TeamBadge
                        team={getTeamPresentation(match.awayTeam, match.awayTeamCode)}
                        className="w-full"
                      />
                    </span>
                    <select
                      disabled={!isEditing}
                      value={match.status}
                      onChange={(e) =>
                        setMatches((items) =>
                          items.map((item) =>
                            item.id === match.id
                              ? { ...item, status: e.target.value as MatchStatus }
                              : item,
                          ),
                        )
                      }
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
                    >
                      <option value="SCHEDULED">Programado</option>
                      <option value="FINAL">Finalizado</option>
                    </select>
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => {
                          void startEditingMatch(match);
                        }}
                        className="rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-200"
                      >
                        Editar
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => saveMatchResult(match.id)}
                          className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-200"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMatchId(null);
                            void refreshAdminData();
                          }}
                          className="rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-200"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>

                  {isEditing && scorersEnabled ? (
                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-700">
                        Goleadores Oficiales
                      </p>
                      {match.status !== "FINAL" ? (
                        <p className="mt-2 text-xs text-zinc-600">
                          Marca el partido como FINAL y carga el marcador para habilitar los slots.
                        </p>
                      ) : null}
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                          <p className="text-xs font-semibold text-zinc-700">
                            {match.homeTeam} ({homeGoals})
                          </p>
                          <div className="mt-2 space-y-2">
                            {homeGoals === 0 ? (
                              <p className="text-xs text-zinc-500">Sin goles del local.</p>
                            ) : (
                              Array.from({ length: homeGoals }).map((_, slot) => (
                                <select
                                  key={`${match.id}-home-scorer-${slot}`}
                                  value={draft.homePlayerIds[slot] ?? ""}
                                  onChange={(e) => {
                                    const playerId = Number(e.target.value);
                                    setScorerDraftByMatch((prev) => {
                                      const currentDraft = prev[match.id] ?? {
                                        homePlayerIds: [],
                                        awayPlayerIds: [],
                                      };
                                      const nextHome = [...currentDraft.homePlayerIds];
                                      nextHome[slot] = playerId;
                                      return {
                                        ...prev,
                                        [match.id]: {
                                          ...currentDraft,
                                          homePlayerIds: nextHome,
                                        },
                                      };
                                    });
                                  }}
                                  className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-800"
                                >
                                  <option value="">Selecciona goleador #{slot + 1}</option>
                                  {homeOptions.map((player) => (
                                    <option key={player.id} value={player.id}>
                                      {player.number !== null ? `${player.number}. ` : ""}
                                      {player.name}
                                    </option>
                                  ))}
                                </select>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                          <p className="text-xs font-semibold text-zinc-700">
                            {match.awayTeam} ({awayGoals})
                          </p>
                          <div className="mt-2 space-y-2">
                            {awayGoals === 0 ? (
                              <p className="text-xs text-zinc-500">Sin goles del visitante.</p>
                            ) : (
                              Array.from({ length: awayGoals }).map((_, slot) => (
                                <select
                                  key={`${match.id}-away-scorer-${slot}`}
                                  value={draft.awayPlayerIds[slot] ?? ""}
                                  onChange={(e) => {
                                    const playerId = Number(e.target.value);
                                    setScorerDraftByMatch((prev) => {
                                      const currentDraft = prev[match.id] ?? {
                                        homePlayerIds: [],
                                        awayPlayerIds: [],
                                      };
                                      const nextAway = [...currentDraft.awayPlayerIds];
                                      nextAway[slot] = playerId;
                                      return {
                                        ...prev,
                                        [match.id]: {
                                          ...currentDraft,
                                          awayPlayerIds: nextAway,
                                        },
                                      };
                                    });
                                  }}
                                  className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-800"
                                >
                                  <option value="">Selecciona goleador #{slot + 1}</option>
                                  {awayOptions.map((player) => (
                                    <option key={player.id} value={player.id}>
                                      {player.number !== null ? `${player.number}. ` : ""}
                                      {player.name}
                                    </option>
                                  ))}
                                </select>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      {((match.homeTeamCode && homeOptions.length === 0) ||
                        (match.awayTeamCode && awayOptions.length === 0)) && (
                        <p className="mt-2 text-xs text-amber-700">
                          Carga primero la plantilla de una o ambas selecciones para poder elegir goleadores.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="wc-card-soft rounded-[1.8rem] p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="wc-title text-3xl text-zinc-950 sm:text-4xl">Pagos - Configuracion</h2>
                <p className="mt-1 text-sm text-zinc-700">
                  Publica el QR activo, monto e instrucciones para el registro.
                </p>
              </div>
              {currentQrUrl ? (
                <a
                  href={currentQrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-800 hover:bg-cyan-100"
                >
                  Ver QR publicado
                </a>
              ) : null}
            </div>

            <div className="mt-5 grid gap-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-zinc-700">
                  Monto
                  <input
                    className="wc-input mt-1 text-base"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="50000"
                  />
                </label>
                <label className="text-sm text-zinc-700">
                  Moneda
                  <input
                    className="wc-input mt-1 text-base"
                    value={paymentCurrency}
                    onChange={(e) => setPaymentCurrency(e.target.value.toUpperCase())}
                    placeholder="COP"
                    maxLength={5}
                  />
                </label>
              </div>

              <label className="text-sm text-zinc-700">
                Instrucciones para el usuario
                <textarea
                  className="wc-input mt-1 min-h-[110px] text-base"
                  rows={4}
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  placeholder="Describe cómo y dónde pagar por Bre-B/Nequi."
                />
              </label>

              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <FileUploadField
                    id="admin-payment-qr-file"
                    label="Archivo QR"
                    hint="Formatos: JPG/PNG. Recomendado: imagen cuadrada y nítida."
                    accept=".jpg,.jpeg,.png"
                    file={paymentQrFile}
                    onChange={setPaymentQrFile}
                    className="border-zinc-300 bg-zinc-50"
                  />
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="wc-eyebrow text-zinc-700">
                    Vista previa
                  </p>
                  <div className="mt-3 flex min-h-[190px] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    {localQrPreviewUrl || currentQrUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={localQrPreviewUrl ?? currentQrUrl ?? ""}
                        alt="Vista previa QR"
                        className="max-h-44 w-auto rounded-lg object-contain"
                      />
                    ) : (
                      <p className="text-center text-sm text-zinc-500">Todavia no hay QR publicado.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="wc-eyebrow text-zinc-700">
                  Ajuste de recorte
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                  <label className="text-xs text-zinc-600">
                    Posicion X
                    <input
                      type="number"
                      className="wc-input mt-1 px-3 py-2 text-sm"
                      value={crop.x}
                      onChange={(e) => setCrop((v) => ({ ...v, x: Number(e.target.value) || 0 }))}
                    />
                  </label>
                  <label className="text-xs text-zinc-600">
                    Posicion Y
                    <input
                      type="number"
                      className="wc-input mt-1 px-3 py-2 text-sm"
                      value={crop.y}
                      onChange={(e) => setCrop((v) => ({ ...v, y: Number(e.target.value) || 0 }))}
                    />
                  </label>
                  <label className="text-xs text-zinc-600">
                    Zoom
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      className="wc-input mt-1 px-3 py-2 text-sm"
                      value={crop.zoom}
                      onChange={(e) => setCrop((v) => ({ ...v, zoom: Number(e.target.value) || 1 }))}
                    />
                  </label>
                  <label className="text-xs text-zinc-600">
                    Ancho
                    <input
                      type="number"
                      className="wc-input mt-1 px-3 py-2 text-sm"
                      value={crop.width}
                      onChange={(e) => setCrop((v) => ({ ...v, width: Number(e.target.value) || 320 }))}
                    />
                  </label>
                  <label className="text-xs text-zinc-600">
                    Alto
                    <input
                      type="number"
                      className="wc-input mt-1 px-3 py-2 text-sm"
                      value={crop.height}
                      onChange={(e) => setCrop((v) => ({ ...v, height: Number(e.target.value) || 320 }))}
                    />
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={savePaymentConfig}
                disabled={busy}
                className="wc-button-primary px-5 py-3 text-sm disabled:opacity-60"
              >
                Guardar configuracion de pago
              </button>
            </div>
          </div>

          <div className="wc-card-soft rounded-[1.8rem] p-5 sm:p-6">
            <h2 className="wc-title text-3xl text-zinc-950 sm:text-4xl">
              Pagos - Comprobantes ({proofs.filter((p) => p.status === "EN_REVISION").length} en revision)
            </h2>
            <div className="mt-4 max-h-[460px] space-y-3 overflow-auto pr-1">
              {proofs.length === 0 ? (
                <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
                  No hay comprobantes cargados.
                </p>
              ) : null}
              {proofs.map((proof) => (
                <div key={proof.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-sm font-semibold text-zinc-900 sm:text-base">
                    {proof.user?.nombres} {proof.user?.apellidos} @{proof.user?.username ?? "sin-usuario"}
                  </p>
                  <p className="text-xs text-zinc-500 sm:text-sm">{proof.user?.email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-sm ${statusBadge(proof.status)}`}>
                      {statusLabel(proof.status)}
                    </span>
                    <a
                      href={proof.blobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-800 hover:bg-cyan-100"
                    >
                      Ver comprobante
                    </a>
                  </div>
                  {proof.rejectionNote ? (
                    <p className="mt-2 text-sm text-rose-700">Motivo: {proof.rejectionNote}</p>
                  ) : null}
                  {proof.status === "EN_REVISION" ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => approveProof(proof.id)}
                        className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-200"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectProof(proof.id)}
                        className="rounded-xl border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-200"
                      >
                        Rechazar
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

