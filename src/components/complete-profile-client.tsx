"use client";

import { PaymentStatus, UserRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { FileUploadField } from "@/components/file-upload-field";

type UserData = {
  id: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  email: string;
  role: UserRole;
  paymentStatus: PaymentStatus;
};

type PaymentConfigData = {
  amount: string;
  currency: string;
  instructions: string;
  qrBlobUrl: string | null;
} | null;

type LatestProofData = {
  id: number;
  status: PaymentStatus;
  rejectionNote: string | null;
  blobUrl: string;
  createdAt: string;
} | null;

type Props = {
  user: UserData;
  paymentConfig: PaymentConfigData;
  latestProof: LatestProofData;
};

type ApiError = { error?: { message?: string } };

function paymentLabel(status: PaymentStatus) {
  if (status === "APROBADO") return "Aprobado";
  if (status === "EN_REVISION") return "En revisión";
  if (status === "RECHAZADO") return "Rechazado";
  return "Sin comprobante";
}

function paymentBadge(status: PaymentStatus) {
  if (status === "APROBADO") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "EN_REVISION") return "bg-amber-100 text-amber-700 border-amber-300";
  if (status === "RECHAZADO") return "bg-rose-100 text-rose-700 border-rose-300";
  return "bg-zinc-100 text-zinc-700 border-zinc-300";
}

async function extractApiMessage(res: Response) {
  try {
    const payload = (await res.json()) as ApiError;
    return payload?.error?.message ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export default function CompleteProfileClient({ user, paymentConfig, latestProof }: Props) {
  const router = useRouter();
  const [busyProfile, setBusyProfile] = useState(false);
  const [busyProof, setBusyProof] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    nombres: user.nombres ?? "",
    apellidos: user.apellidos ?? "",
    username: user.username ?? "",
  });

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    setBusyProfile(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError(await extractApiMessage(res));
        return;
      }
      setMessage("Perfil actualizado. Ya puedes continuar a la plataforma.");
      router.push("/pronostico");
      router.refresh();
    } finally {
      setBusyProfile(false);
    }
  }

  async function onUploadProof(event: FormEvent) {
    event.preventDefault();
    if (!proofFile) return;
    setBusyProof(true);
    setMessage(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("proof", proofFile);
      const res = await fetch("/api/payment-proofs", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        setError(await extractApiMessage(res));
        return;
      }
      setMessage("Comprobante enviado. Tu pago queda en revisión.");
      setProofFile(null);
      router.refresh();
    } finally {
      setBusyProof(false);
    }
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="wc-page relative min-h-screen overflow-hidden px-4 py-8 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="wc-card rounded-[2rem] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="wc-eyebrow">Onboarding Mundial</p>
              <h1 className="wc-title mt-2 text-6xl text-zinc-950">Completa tu registro</h1>
              <p className="mt-3 max-w-2xl text-sm text-zinc-700 sm:text-base">
                Configura tu perfil final y valida el pago para habilitar el acceso completo a los
                pronósticos.
              </p>
            </div>
            <button type="button" onClick={onLogout} className="wc-button-secondary px-4 py-2 text-sm">
              Cerrar sesión
            </button>
          </div>
          <div className={`mt-4 inline-flex rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] ${paymentBadge(user.paymentStatus)}`}>
            Estado de pago: {paymentLabel(user.paymentStatus)}
          </div>
        </section>

        {message ? (
          <p className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-sm text-emerald-700">{message}</p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-rose-300 bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <form onSubmit={onSaveProfile} className="wc-card-soft rounded-[1.7rem] p-5 sm:p-6">
            <p className="wc-eyebrow">Datos base</p>
            <h2 className="wc-title mt-2 text-5xl text-zinc-950">Perfil de usuario</h2>
            <p className="mt-2 text-sm text-zinc-700">Estos datos aparecen en la plataforma.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-zinc-700">
                Nombres
                <input
                  type="text"
                  required
                  className="wc-input mt-1"
                  value={form.nombres}
                  onChange={(e) => setForm((v) => ({ ...v, nombres: e.target.value }))}
                />
              </label>
              <label className="block text-sm text-zinc-700">
                Apellidos
                <input
                  type="text"
                  required
                  className="wc-input mt-1"
                  value={form.apellidos}
                  onChange={(e) => setForm((v) => ({ ...v, apellidos: e.target.value }))}
                />
              </label>
              <label className="block text-sm text-zinc-700">
                Usuario visible
                <input
                  type="text"
                  required
                  className="wc-input mt-1"
                  value={form.username}
                  onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))}
                />
              </label>
              <p className="text-xs text-zinc-500">Correo de Google: {user.email}</p>
              <button type="submit" disabled={busyProfile} className="wc-button-primary w-full px-4 py-2.5 text-sm disabled:opacity-60">
                {busyProfile ? "Guardando..." : "Guardar perfil"}
              </button>
            </div>
          </form>

          <div className="space-y-6">
            <section className="wc-card-soft rounded-[1.7rem] p-5 sm:p-6">
              <p className="wc-eyebrow">Pago</p>
              <h2 className="wc-title mt-2 text-5xl text-zinc-950">Bre-B / Nequi</h2>
              <p className="mt-2 text-sm text-zinc-800">
                Monto: <strong>{paymentConfig?.amount ?? "50000.00"} {paymentConfig?.currency ?? "COP"}</strong>
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                {paymentConfig?.instructions ??
                  "Realiza el pago y sube tu comprobante para validación del administrador."}
              </p>
              {paymentConfig?.qrBlobUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={paymentConfig.qrBlobUrl}
                  alt="QR de pago"
                  className="mt-4 h-48 w-48 rounded-xl border border-zinc-300 bg-white object-contain"
                />
              ) : (
                <p className="mt-3 text-sm text-amber-700">El admin aún no ha publicado un QR.</p>
              )}
            </section>

            <form onSubmit={onUploadProof} className="wc-card-soft rounded-[1.7rem] p-5 sm:p-6">
              <p className="wc-eyebrow">Validación</p>
              <h3 className="wc-title mt-2 text-4xl text-zinc-950">Subir comprobante</h3>
              <p className="mt-1 text-sm text-zinc-700">Permitidos: JPG, PNG, PDF (máx. 8 MB).</p>
              {latestProof ? (
                <p className="mt-2 text-xs text-zinc-600">
                  Último estado: {paymentLabel(latestProof.status)} - {" "}
                  <a href={latestProof.blobUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                    Ver archivo
                  </a>
                </p>
              ) : null}
              {latestProof?.rejectionNote ? (
                <p className="mt-2 text-xs text-rose-700">Motivo de rechazo: {latestProof.rejectionNote}</p>
              ) : null}
              <FileUploadField
                id="complete-profile-proof-file"
                label="Adjuntar comprobante"
                hint="Permitidos: JPG, PNG, PDF (máx. 8 MB)."
                accept=".jpg,.jpeg,.png,.pdf"
                file={proofFile}
                onChange={setProofFile}
                className="mt-3"
              />
              <button
                type="submit"
                disabled={busyProof || !proofFile}
                className="wc-button-primary mt-4 w-full px-4 py-2.5 text-sm disabled:opacity-60"
              >
                {busyProof ? "Enviando..." : "Enviar comprobante"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
