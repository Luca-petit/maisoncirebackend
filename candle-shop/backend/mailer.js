import nodemailer from 'nodemailer';

export function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // If SMTP not configured, return null (API still works, no email sent)
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

export async function sendOrderEmail({ to, subject, html, text }) {
  const transporter = getMailer();
  if (!transporter) return { skipped: true };

  const from = process.env.MAIL_FROM || 'no-reply@maisoncire.local';
  const info = await transporter.sendMail({ from, to, subject, html, text });
  return { messageId: info.messageId };
}
