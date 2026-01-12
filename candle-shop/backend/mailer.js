import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const secure = String(process.env.SMTP_SECURE || "false") === "true";
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

const from = process.env.MAIL_FROM || "Maison Cire <no-reply@maisoncire>";

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: user && pass ? { user, pass } : undefined,
});

export async function sendMail({ to, subject, html, text }) {
  if (!to) throw new Error("sendMail: 'to' manquant");
  if (!subject) throw new Error("sendMail: 'subject' manquant");

  return transporter.sendMail({
    from,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });
}
