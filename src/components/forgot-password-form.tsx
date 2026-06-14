"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type ApiError = { error?: { message?: string }; message?: string };

async function extractApiMessage(res: Response) {
  try {
    const payload = (await res.json()) as ApiError;
    return payload?.error?.message ?? payload?.message ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const text = await extractApiMessage(res);
      if (!res.ok) {
        setError(text);
        return;
      }
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wc-page relative flex min-h-screen items-center justify-center px-3 py-6 sm:px-4">
      <section className="wc-card-soft relative z-10 w-full max-w-lg rounded-[2rem] p-5 sm:p-6">
        <p className="wc-eyebrow text-zinc-700">Recuperar acceso</p>
        <h1 className="wc-title mt-2 text-4xl text-zinc-950 sm:text-5xl">Restablecer contraseña</h1>
        <p className="mt-2 text-sm text-zinc-700">
          Ingresa tu correo y, si existe una cuenta asociada, enviaremos un enlace para crear una nueva contraseña.
        </p>

        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {message ? (
          <p className="mt-4 rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm text-zinc-700">
            Correo
            <input
              type="email"
              required
              className="wc-input mt-1"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <button type="submit" disabled={busy} className="wc-button-primary w-full px-4 py-2.5 text-sm disabled:opacity-60">
            {busy ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm font-semibold text-zinc-700">
          <Link href="/login" className="hover:text-zinc-950">
            Volver a iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  );
}

