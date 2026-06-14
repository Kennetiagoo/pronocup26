import "server-only";

import { Resend } from "resend";

type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY no está configurado.");
  }
  return new Resend(apiKey);
}

function getPasswordResetFromEmail() {
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!from) {
    throw new Error("PASSWORD_RESET_FROM_EMAIL no está configurado.");
  }
  return from;
}

export async function sendPasswordResetEmail({ to, resetUrl }: PasswordResetEmailInput) {
  const resend = getResendClient();
  const from = getPasswordResetFromEmail();
  const subject = "Restablece tu contraseña";
  const text = [
    "Recibimos una solicitud para restablecer tu contraseña.",
    "",
    `Abre este enlace para crear una nueva contraseña: ${resetUrl}`,
    "",
    "El enlace vence en 30 minutos y solo se puede usar una vez.",
    "Si no solicitaste este cambio, puedes ignorar este correo.",
  ].join("\n");

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#18181b">
        <h1 style="font-size:22px">Restablece tu contraseña</h1>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;border-radius:12px;background:#0891b2;color:white;padding:12px 18px;text-decoration:none;font-weight:700">
            Crear nueva contraseña
          </a>
        </p>
        <p>El enlace vence en 30 minutos y solo se puede usar una vez.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}

