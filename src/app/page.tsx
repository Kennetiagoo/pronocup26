import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveUserHomeRoute } from "@/lib/auth/routing";
import { prisma } from "@/lib/prisma";

function formatMoneyCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function HomePage() {
  const [user, paymentConfig, approvedBettorCount] = await Promise.all([
    getCurrentUser(),
    prisma.paymentConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.count({
      where: {
        paymentStatus: "APROBADO",
        username: { not: null },
      },
    }),
  ]);

  const userHome = user ? resolveUserHomeRoute(user) : "/pronostico";
  const entryFee = Number(paymentConfig?.amount ?? 50000);
  const normalizedEntryFee = Number.isFinite(entryFee) && entryFee > 0 ? entryFee : 50000;
  const amount = `${formatMoneyCOP(normalizedEntryFee)} ${paymentConfig?.currency ?? "COP"}`;
  const prizePool = approvedBettorCount * normalizedEntryFee;
  const prizePreview = [
    ["Primer lugar", 70, prizePool * 0.7],
    ["Segundo lugar", 20, prizePool * 0.2],
    ["Tercer lugar", 10, prizePool * 0.1],
  ] as const;

  return (
    <main className="wc-page min-h-screen px-4 py-6 text-zinc-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
        <header className="wc-card rounded-[2rem] p-5 sm:p-7">
          <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="wc-eyebrow text-zinc-800">
              Prono Cup 2026
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/reglas"
                className="rounded-2xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-700 hover:bg-zinc-50"
              >
                Reglas
              </Link>
              <Link
                href={user ? userHome : "/login"}
                className="rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-900 hover:bg-cyan-100"
              >
                {user ? "Ir a mi panel" : "Ingresar"}
              </Link>
            </div>
          </nav>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div className="wc-card rounded-[2rem] p-6 sm:p-8">
            <p className="wc-eyebrow">Mundial 2026</p>
            <h1 className="wc-title mt-2 text-5xl text-zinc-950 sm:text-7xl lg:text-8xl">
              Concejo de Mufas
            </h1>
            <p className="mt-4 max-w-2xl text-base text-zinc-700 sm:text-lg">
              Arma tus marcadores, usa bonificadores con cabeza y compite en una tabla que se recalcula con cada
              resultado oficial.
            </p>
            <div className="mt-5 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                Para participar debes crear cuenta, pagar la inscripcion y esperar aprobacion del comprobante.
              </p>
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                Los picks se bloquean antes del inicio de cada partido. Despues del bloqueo no se puede editar.
              </p>
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                X2 duplica el puntaje base de un partido, pero tiene cupos limitados en fase de grupos.
              </p>
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                Los goleadores solo aparecen si pronosticas goles y si la fase tiene ese modulo activo.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/login" className="wc-button-primary px-5 py-3 text-sm">
                Registrarme
              </Link>
              <Link href="/reglas" className="wc-button-secondary px-5 py-3 text-sm">
                Ver reglas
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="wc-card-soft rounded-[1.7rem] p-5">
              <p className="wc-eyebrow">Inscripcion</p>
              <p className="wc-title mt-2 text-5xl text-zinc-950">{amount}</p>
              <p className="mt-2 text-sm text-zinc-700">
                Sube el comprobante al registrarte o despues de entrar. El admin aprueba el pago y habilita tus picks.
              </p>
            </div>
            <div className="wc-card-soft rounded-[1.7rem] p-5">
              <p className="wc-eyebrow">Premios</p>
              <p className="mt-2 text-sm text-zinc-700">
                Bolsa actual: <strong>{formatMoneyCOP(prizePool)}</strong> con {approvedBettorCount} apostadores
                aprobados.
              </p>
              <div className="mt-3 grid gap-2">
                {prizePreview.map(([label, percent, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-zinc-800">
                      {label} ({percent}%)
                    </span>
                    <strong className="text-zinc-950">{formatMoneyCOP(Math.round(value))}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="wc-eyebrow text-emerald-800">Fixture</p>
                <p className="wc-title mt-2 text-4xl text-emerald-900">104</p>
                <p className="text-xs text-emerald-800">partidos</p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="wc-eyebrow text-blue-800">Ranking</p>
                <p className="wc-title mt-2 text-4xl text-blue-900">Live</p>
                <p className="text-xs text-blue-800">tabla global</p>
              </div>
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <p className="wc-eyebrow text-violet-800">Bonus</p>
                <p className="wc-title mt-2 text-4xl text-violet-900">X2</p>
                <p className="text-xs text-violet-800">por estrategia</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="wc-eyebrow text-amber-800">Extra</p>
                <p className="wc-title mt-2 text-4xl text-amber-900">Gol</p>
                <p className="text-xs text-amber-800">picks de goleador</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["1", "Crea tu cuenta", "Registra tus datos y adjunta el comprobante si ya pagaste."],
            ["2", "Pronostica", "Llena marcadores, X2 y goleadores disponibles antes del cierre."],
            ["3", "Compite por premios", "La bolsa se reparte 70%, 20% y 10% entre los tres primeros lugares."],
          ].map(([step, title, text]) => (
            <article key={step} className="wc-card-soft rounded-[1.5rem] p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-black text-zinc-900">
                {step}
              </span>
              <h2 className="mt-4 text-xl font-extrabold text-zinc-950">{title}</h2>
              <p className="mt-2 text-sm text-zinc-700">{text}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
