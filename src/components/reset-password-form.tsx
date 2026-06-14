"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type ApiError = { error?: { message?: string }; message?: string };

type Props = {
  token: string;
};

async function extractApiMessage(res: Response) {
  try {
    const payload = (await res.json()) as ApiError;
    return payload?.error?.message ?? payload?.message ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export default function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "El enlace no es válido o expiró.");
  const tokenAvailable = token.length > 0;

  const passwordChecks = useMemo(
    () => [
      { label: "Mínimo 10 caracteres", ok: password.length >= 10 },
      { label: "Al menos una mayúscula", ok: /[A-Z]/.test(password) },
      { label: "Al menos una minúscula", ok: /[a-z]/.test(password) },
      { label: "Al menos un número", ok: /[0-9]/.test(password) },
      { label: "Al menos un símbolo", ok: /[^A-Za-z0-9]/.test(password) },
      {
        label: "La confirmación coincide",
        ok: passwordConfirm.length > 0 && password === passwordConfirm,
      },
    ],
    [password, passwordConfirm],
  );
  const passwordReady = passwordChecks.every((check) => check.ok);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tokenAvailable) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, passwordConfirm }),
      });

      const text = await extractApiMessage(res);
      if (!res.ok) {
        setError(text);
        return;
      }
      setMessage(text);
      setPassword("");
      setPasswordConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wc-page relative flex min-h-screen items-center justify-center px-3 py-6 sm:px-4">
      <section className="wc-card-soft relative z-10 w-full max-w-xl rounded-[2rem] p-5 sm:p-6">
        <p className="wc-eyebrow text-zinc-700">Nueva contraseña</p>
        <h1 className="wc-title mt-2 text-4xl text-zinc-950 sm:text-5xl">Restablecer acceso</h1>
        <p className="mt-2 text-sm text-zinc-700">
          Crea una contraseña segura para volver a entrar con tu correo.
        </p>

        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {message ? (
          <p className="mt-4 rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm text-zinc-700">
            Nueva contraseña
            <input
              type="password"
              required
              disabled={!tokenAvailable || Boolean(message)}
              className="wc-input mt-1"
              placeholder="Crea una clave segura"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="block text-sm text-zinc-700">
            Confirmar contraseña
            <input
              type="password"
              required
              disabled={!tokenAvailable || Boolean(message)}
              className="wc-input mt-1"
              placeholder="Repite la clave"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </label>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
            <p className="font-semibold text-zinc-900">Checklist de contraseña</p>
            <ul className="mt-2 space-y-1.5">
              {passwordChecks.map((check) => (
                <li key={check.label} className="flex items-center justify-between gap-2">
                  <span className={check.ok ? "text-emerald-700" : "text-zinc-700"}>{check.label}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      check.ok
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                        : "border-zinc-300 bg-white text-zinc-500"
                    }`}
                  >
                    {check.ok ? "OK" : "Falta"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="submit"
            disabled={busy || !tokenAvailable || !passwordReady || Boolean(message)}
            className="wc-button-primary w-full px-4 py-2.5 text-sm disabled:opacity-60"
          >
            {busy ? "Actualizando..." : "Actualizar contraseña"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm font-semibold text-zinc-700">
          <Link href="/login" className="hover:text-zinc-950">
            Ir a iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  );
}

