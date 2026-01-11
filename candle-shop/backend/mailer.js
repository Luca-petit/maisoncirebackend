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

export async function sendMail({ to, subject, text, html }) {
  console.log('📧 Mail simulé');
  console.log({ to, subject, text, html });

  // plus tard : nodemailer / resend / mailjet etc
  return true;
}
