export function orderStatusEmail({ orderId, statusLabel }) {
  const year = new Date().getFullYear();

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border-radius:16px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:10px;height:10px;border-radius:999px;background:#111;"></div>
          <div style="font-weight:700;">Guadaluz</div>
        </div>

        <h1 style="margin:18px 0 8px;font-size:20px;">Mise à jour de votre commande 📦</h1>
        <p style="margin:0 0 14px;color:#444;line-height:1.5;">
          Votre commande <strong>#${orderId}</strong> est maintenant :
        </p>

        <div style="background:#111;color:#fff;border-radius:12px;padding:14px 16px;font-weight:700;display:inline-block;">
          ${statusLabel}
        </div>

        <p style="margin:18px 0 0;color:#666;font-size:13px;line-height:1.5;">
          Merci de votre confiance — Guadaluz.
        </p>

        <hr style="border:none;border-top:1px solid #eee;margin:18px 0;" />
        <p style="margin:0;color:#999;font-size:12px;">© ${year} Guadaluz</p>
      </div>
    </div>
  </body>
</html>`;
}
