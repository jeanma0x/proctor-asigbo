import nodemailer from "nodemailer";
import { MAX_STRIKES } from "@/lib/proctor-constants";

/** El envío por correo está activo solo si hay credenciales SMTP configuradas. */
export function emailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** URL pública base de la app (para construir los enlaces de examen en los correos). */
export function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Invitation = { to: string; name: string; examTitle: string; durationMinutes: number; link: string };

/** Construye asunto, texto y HTML de la invitación (función pura, fácil de probar). */
export function buildInvitation(i: Invitation) {
  const subject = `Tu acceso al examen: ${i.examTitle}`;
  const rules = [
    `Dispones de ${i.durationMinutes} minutos desde que inicies el examen.`,
    "Usa una computadora con conexión estable y cierra otras pestañas y aplicaciones.",
    "El examen se realiza en pantalla completa y se supervisa: cambiar de pestaña, salir de pantalla completa o pegar contenido se registra como infracción.",
    `Al acumular ${MAX_STRIKES} infracciones el examen se cierra automáticamente.`,
    "Tu enlace es personal e intransferible.",
  ];
  const text = [
    `Hola ${i.name},`,
    "",
    `Has sido habilitado(a) para presentar el examen "${i.examTitle}" de ASIGBO.`,
    "",
    `Ingresa aquí: ${i.link}`,
    "",
    "Antes de comenzar:",
    ...rules.map((r) => `- ${r}`),
    "",
    "Asociación de Becados Isabel Gutiérrez de Bosch (ASIGBO)",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#1e3a8a;padding:20px 28px;color:#fff;font-size:13px;letter-spacing:2px;font-weight:bold">ASIGBO PROCTORING</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">Hola ${esc(i.name)},</h1>
<p style="margin:0 0 20px;line-height:1.5">Has sido habilitado(a) para presentar el examen <strong>${esc(i.examTitle)}</strong>.</p>
<p style="margin:0 0 24px"><a href="${esc(i.link)}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Ir a mi examen</a></p>
<p style="margin:0 0 8px;font-weight:bold">Antes de comenzar</p>
<ul style="margin:0 0 20px;padding-left:20px;line-height:1.6;color:#334155">${rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
<p style="margin:0;font-size:12px;color:#64748b">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">${esc(i.link)}</span></p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;font-size:12px;color:#64748b">Asociación de Becados Isabel Gutiérrez de Bosch</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

let cached: nodemailer.Transporter | null = null;
function transport() {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT || 465);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cached;
}

export async function sendInvitationEmail(i: Invitation) {
  const { subject, text, html } = buildInvitation(i);
  await transport().sendMail({
    from: process.env.SMTP_FROM || `"ASIGBO Proctoring" <${process.env.SMTP_USER}>`,
    to: i.to,
    subject,
    text,
    html,
  });
}
