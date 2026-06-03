import { MatchStage, PaymentStatus } from "@prisma/client";

export const ES_TEXT = {
  appName: "Concejo de Mufas",
  worldCup: "Mundial 2026",
  common: {
    save: "Guardar",
    saving: "Guardando...",
    login: "Ingresar",
    register: "Registrarse",
    logout: "Cerrar sesión",
    upload: "Subir",
    remove: "Quitar",
    selectedFileNone: "Ningún archivo seleccionado",
    noPoints: "Sin puntos",
  },
  payment: {
    title: "Pago Bre-B / Nequi",
    noQrPublished: "El administrador aún no ha publicado un QR.",
    pendingRestriction:
      "Aún no puedes guardar pronósticos. Sube comprobante y espera aprobación del administrador.",
    enabled: "Acceso habilitado para pronósticos",
  },
} as const;

export const STAGE_LABELS_ES: Record<MatchStage, string> = {
  GROUP: "Fase de Grupos",
  ROUND_OF_32: "Dieciseisavos",
  ROUND_OF_16: "Octavos",
  QUARTER_FINAL: "Cuartos",
  SEMI_FINAL: "Semifinales",
  THIRD_PLACE: "Tercer Puesto",
  FINAL: "Final",
};

export const STAGE_FILTERS_ES: Array<{ key: "ALL" | MatchStage; label: string }> = [
  { key: "ALL", label: "Todos" },
  { key: "GROUP", label: STAGE_LABELS_ES.GROUP },
  { key: "ROUND_OF_32", label: STAGE_LABELS_ES.ROUND_OF_32 },
  { key: "ROUND_OF_16", label: STAGE_LABELS_ES.ROUND_OF_16 },
  { key: "QUARTER_FINAL", label: STAGE_LABELS_ES.QUARTER_FINAL },
  { key: "SEMI_FINAL", label: STAGE_LABELS_ES.SEMI_FINAL },
  { key: "THIRD_PLACE", label: STAGE_LABELS_ES.THIRD_PLACE },
  { key: "FINAL", label: STAGE_LABELS_ES.FINAL },
];

export function paymentStatusLabelEs(status: PaymentStatus) {
  if (status === PaymentStatus.APROBADO) return "Aprobado";
  if (status === PaymentStatus.EN_REVISION) return "En revisión";
  if (status === PaymentStatus.RECHAZADO) return "Rechazado";
  return "Sin comprobante";
}
