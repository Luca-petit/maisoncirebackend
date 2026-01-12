export function orderConfirmationEmail({ orderId, total, deliveryLabel, paymentLabel, itemsHtml}) {
  const year = new Date().getFullYear();

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border-radius:16px;padding:22px 22px 10px;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:10px;height:10px;border-radius:999px;background:#111;"></div>
        </div>

        <h1 style="margin:18px 0 8px;font-size:22px;">Commande confirmée 🕯️</h1>
        <p style="margin:0 0 16px;color:#444;line-height:1.5;">
          Merci pour votre commande. Nous vous tiendrons informé(e) à chaque étape.
        </p>

        <div style="background:#f3f4f8;border-radius:12px;padding:14px 14px;margin:14px 0;">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-size:12px;color:#666;">Numéro</div>
              <div style="font-weight:700;">#${orderId}</div>
            </div>
          </div>

          <div style="margin-top:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
                <div>
                <div style="font-size:12px;color:#666;"></div>
                <div style="font-weight:700;">${itemsHtml || ""}</div>
                </div>
              <div style="font-size:12px;color:#666;">Livraison</div>
              <div>${deliveryLabel || "-"}</div>
            </div>
            <div>
              <div style="font-size:12px;color:#666; margin-left:15px">Paiement</div>
              <div>${paymentLabel || "-"}</div>
            </div>
          </div>
        </div>

        <p style="margin:16px 0 0;color:#666;font-size:13px;line-height:1.5;">
          Si vous n’êtes pas à l’origine de cette commande, ignorez cet email.
        </p>

        <hr style="border:none;border-top:1px solid #eee;margin:18px 0;" />

        <p style="margin:0;color:#999;font-size:12px;">
          © ${year} Maison Cire
        </p>
      </div>
    </div>
  </body>
</html>`;
}
