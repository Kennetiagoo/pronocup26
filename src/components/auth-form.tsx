"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FileUploadField } from "@/components/file-upload-field";

type PaymentConfigClient = {
  id: number;
  amount: string;
  currency: string;
  instructions: string;
  qrBlobUrl: string | null;
};

type Props = {
  paymentConfig: PaymentConfigClient | null;
  oauthError?: string;
};

type ApiError = { error?: { message?: string }; redirectTo?: string };

type AuthMode = "login" | "register";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.38 3.6v2.99h3.84c2.25-2.07 3.59-5.12 3.59-8.62Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.84-2.99c-1.07.72-2.44 1.14-4.09 1.14-3.14 0-5.8-2.12-6.75-4.97H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.28A7.2 7.2 0 0 1 4.87 12c0-.79.14-1.55.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.93.46 3.76 1.29 5.37l3.96-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.81l3.43-3.43C17.94 1.2 15.23 0 12 0A12 12 0 0 0 1.29 6.63l3.96 3.09c.95-2.85 3.61-4.95 6.75-4.95Z"
      />
    </svg>
  );
}

async function extractApiMessage(res: Response) {
  try {
    const payload = (await res.json()) as ApiError;
    return payload?.error?.message ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export default function AuthForm({ paymentConfig, oauthError }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(oauthError ?? null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [login, setLogin] = useState({
    email: "",
    password: "",
  });

  const [register, setRegister] = useState({
    nombres: "",
    apellidos: "",
    username: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });

  const passwordChecks = useMemo(() => {
    const password = register.password;
    const passwordConfirm = register.passwordConfirm;
    return [
      { label: "Mínimo 10 caracteres", ok: password.length >= 10 },
      { label: "Al menos una mayúscula", ok: /[A-Z]/.test(password) },
      { label: "Al menos una minúscula", ok: /[a-z]/.test(password) },
      { label: "Al menos un número", ok: /[0-9]/.test(password) },
      { label: "Al menos un símbolo", ok: /[^A-Za-z0-9]/.test(password) },
      {
        label: "La confirmación coincide",
        ok: passwordConfirm.length > 0 && password === passwordConfirm,
      },
    ];
  }, [register.password, register.passwordConfirm]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      if (!res.ok) {
        setError(await extractApiMessage(res));
        return;
      }
      const payload = (await res.json()) as { redirectTo?: string };
      router.push(payload.redirectTo ?? "/pronostico");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(register),
      });

      if (!res.ok) {
        setError(await extractApiMessage(res));
        return;
      }

      if (proofFile) {
        const formData = new FormData();
        formData.append("proof", proofFile);
        const proofRes = await fetch("/api/payment-proofs", {
          method: "POST",
          body: formData,
        });
        if (!proofRes.ok) {
          setError(await extractApiMessage(proofRes));
          return;
        }
      }

      const successMessage = proofFile
        ? "Registro y comprobante enviados. Quedas en revisión."
        : "Registro exitoso. Puedes subir comprobante después de ingresar.";
      setMessage(successMessage);
      const payload = (await res.json()) as { redirectTo?: string };
      router.push(payload.redirectTo ?? "/pronostico");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wc-page relative flex min-h-screen items-center justify-center px-3 py-0 sm:px-4 sm:py-4">
      <div
        className={`relative z-10 mx-auto grid w-full gap-4 lg:gap-6 ${
          mode === "register" ? "max-w-6xl lg:grid-cols-1" : "max-w-5xl lg:grid-cols-[1fr_1fr]"
        }`}
      >
        <section className={`hidden wc-card rounded-[2rem] p-6 sm:p-7 ${mode === "register" ? "lg:hidden" : "lg:block"}`}>
          <h1 className="wc-title mt-2 text-5xl text-zinc-950 sm:text-7xl">Concejo de Mufas</h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-700 sm:text-base">
            Entra rápido, registra tus picks y compite en la tabla.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-zinc-700">
              104 partidos
            </span>
            <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-zinc-700">
              16 ciudades
            </span>
          </div>
        </section>

        <section className={`wc-card-soft rounded-[2rem] p-5 sm:p-6 ${mode === "register" ? "lg:p-5" : ""}`}>
          <h1 className="wc-title mt-2 text-4xl text-zinc-950 sm:text-5xl lg:hidden">Concejo de Mufas</h1>
          <p className="mb-4 mt-2 text-sm text-zinc-700 lg:hidden">Accede o crea tu cuenta en segundos.</p>
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-full border border-zinc-200 bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] transition sm:text-sm ${
                mode === "login"
                  ? "bg-[linear-gradient(90deg,rgba(21,175,200,0.94),rgba(36,94,214,0.92),rgba(114,45,212,0.9))] text-white"
                  : "text-zinc-700 hover:bg-white"
              }`}
            >
              Ingresar
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] transition sm:text-sm ${
                mode === "register"
                  ? "bg-[linear-gradient(90deg,rgba(21,175,200,0.94),rgba(36,94,214,0.92),rgba(114,45,212,0.9))] text-white"
                  : "text-zinc-700 hover:bg-white"
              }`}
            >
              Registrarse
            </button>
          </div>

          <a
            href={mode === "login" ? "/api/auth/google/start?mode=login" : "/api/auth/google/start?mode=register"}
            className="wc-button-secondary wc-button-google mb-4 flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm"
          >
            <GoogleLogo />
            {mode === "login" ? "Continuar con Google" : "Registrarse con Google"}
          </a>

          <div className="mb-4 flex flex-wrap justify-center gap-3 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-600">
            <Link href="/" className="hover:text-zinc-950">
              Inicio
            </Link>
            <Link href="/reglas" className="hover:text-zinc-950">
              Reglas
            </Link>
          </div>

          {error ? <p className="mb-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {message ? (
            <p className="mb-3 rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{message}</p>
          ) : null}

          {mode === "login" ? (
            <form className="space-y-3" onSubmit={handleLogin}>
              <label className="block text-sm text-zinc-700">
                Correo
                <input
                  type="email"
                  required
                  className="wc-input mt-1"
                  placeholder="correo@ejemplo.com"
                  value={login.email}
                  onChange={(e) => setLogin((v) => ({ ...v, email: e.target.value }))}
                />
              </label>
              <label className="block text-sm text-zinc-700">
                Contraseña
                <input
                  type="password"
                  required
                  minLength={1}
                  className="wc-input mt-1"
                  placeholder="Tu clave"
                  value={login.password}
                  onChange={(e) => setLogin((v) => ({ ...v, password: e.target.value }))}
                />
              </label>
              <button type="submit" disabled={busy} className="wc-button-primary w-full px-4 py-2.5 text-sm disabled:opacity-60">
                Entrar
              </button>
            </form>
          ) : (
            <form className="space-y-3 lg:space-y-3" onSubmit={handleRegister}>
              <div className="grid gap-3 lg:grid-cols-2 lg:gap-3">
                <label className="block text-sm text-zinc-700">
                  Nombres
                  <input
                    type="text"
                    required
                    className="wc-input mt-1"
                    placeholder="Nombres"
                    value={register.nombres}
                    onChange={(e) => setRegister((v) => ({ ...v, nombres: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-zinc-700">
                  Apellidos
                  <input
                    type="text"
                    required
                    className="wc-input mt-1"
                    placeholder="Apellidos"
                    value={register.apellidos}
                    onChange={(e) => setRegister((v) => ({ ...v, apellidos: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-zinc-700">
                  Usuario visible
                  <input
                    type="text"
                    required
                    className="wc-input mt-1"
                    placeholder="usuario_prono"
                    value={register.username}
                    onChange={(e) => setRegister((v) => ({ ...v, username: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-zinc-700">
                  Correo
                  <input
                    type="email"
                    required
                    className="wc-input mt-1"
                    placeholder="correo@ejemplo.com"
                    value={register.email}
                    onChange={(e) => setRegister((v) => ({ ...v, email: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-zinc-700">
                  Contraseña
                  <input
                    type="password"
                    required
                    className="wc-input mt-1"
                    placeholder="Crea una clave segura"
                    value={register.password}
                    onChange={(e) => setRegister((v) => ({ ...v, password: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-zinc-700">
                  Confirmar contraseña
                  <input
                    type="password"
                    required
                    className="wc-input mt-1"
                    placeholder="Repite la clave"
                    value={register.passwordConfirm}
                    onChange={(e) => setRegister((v) => ({ ...v, passwordConfirm: e.target.value }))}
                  />
                </label>
              </div>

              <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:gap-3">
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

                <div className="grid gap-3">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="wc-eyebrow">Pago Bre-B / Nequi</p>
                    <p className="mt-2 text-xs text-zinc-800">
                      Monto: <strong>{paymentConfig?.amount?.toString?.() ?? "50000.00"} {paymentConfig?.currency ?? "COP"}</strong>
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {paymentConfig?.instructions ??
                        "Realiza el pago y adjunta comprobante. Si no lo adjuntas ahora, podrás hacerlo luego."}
                    </p>
                    {paymentConfig?.qrBlobUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={paymentConfig.qrBlobUrl}
                        alt="QR de pago"
                        className="mx-auto mt-3 h-32 w-32 rounded-lg border border-zinc-300 bg-white object-contain lg:h-44 lg:w-44"
                      />
                    ) : (
                      <p className="mt-2 text-xs text-amber-700">QR no publicado aún por administrador.</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <FileUploadField
                      id="register-proof-file"
                      label="Adjuntar comprobante (opcional)"
                      hint="Formatos permitidos: JPG, PNG, PDF. Máximo recomendado: 8 MB."
                      accept=".jpg,.jpeg,.png,.pdf"
                      file={proofFile}
                      onChange={setProofFile}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || passwordChecks.some((check) => !check.ok)}
                className="w-full rounded-2xl border border-cyan-200 bg-[linear-gradient(90deg,rgba(21,175,200,0.94),rgba(36,94,214,0.92),rgba(114,45,212,0.9))] px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_4px_14px_rgba(36,94,214,0.28)] transition hover:brightness-105 disabled:opacity-60"
              >
                Crear cuenta
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

