import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.MAIL_FROM || "Maison Cire <onboarding@resend.dev>";

export async function sendMail({ to, subject, html, text }) {
  if (!to)      throw new Error("sendMail: 'to' manquant");
  if (!subject) throw new Error("sendMail: 'subject' manquant");

  const { data, error } = await resend.emails.send({
    from:    FROM,
    to:      Array.isArray(to) ? to : [to],
    subject,
    html:    html    || undefined,
    text:    text    || undefined,
  });

  if (error) throw new Error(error.message || "Resend error");
  return data;
}
