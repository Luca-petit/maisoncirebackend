// Mailer via Resend — le serveur démarre même si resend n'est pas installé
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "Maison Cire <onboarding@resend.dev>";

let _resend = null;

async function getResend() {
  if (_resend) return _resend;
  if (!RESEND_API_KEY) {
    console.warn("⚠️  RESEND_API_KEY manquant — emails désactivés");
    return null;
  }
  try {
    const { Resend } = await import("resend");
    _resend = new Resend(RESEND_API_KEY);
    return _resend;
  } catch (e) {
    console.warn("⚠️  Resend non disponible :", e.message);
    return null;
  }
}

export async function sendMail({ to, subject, html, text }) {
  const resend = await getResend();
  if (!resend) {
    console.warn(`📧 Email ignoré (Resend indispo) : ${subject} → ${to}`);
    return null;
  }
  if (!to)      throw new Error("sendMail: 'to' manquant");
  if (!subject) throw new Error("sendMail: 'subject' manquant");

  const { data, error } = await resend.emails.send({
    from:    FROM,
    to:      Array.isArray(to) ? to : [to],
    subject,
    html:    html || undefined,
    text:    text || undefined,
  });

  if (error) throw new Error(error.message || "Resend error");
  return data;
}
