export function adminNewOrderEmail({ orderId, email, total, deliveryLabel, paymentLabel,itemsHtml }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border-radius:16px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <h2 style="margin:0 0 6px;">🛎️ Nouvelle commande</h2>
        <p style="margin:0 0 14px;color:#555;">Commande <strong>#${orderId}</strong></p>

        <div style="background:#f3f4f8;border-radius:12px;padding:14px;">
          <p style="margin:0 0 8px;"><strong>Client :</strong> ${email}</p>
          <p style="margin:0 0 8px;"><strong>Client :</strong> ${itemsHtml || ""}</p>
          <p style="margin:0 0 8px;"><strong>Total :</strong> ${total} €</p>
          <p style="margin:0 0 8px;"><strong>Livraison :</strong> ${deliveryLabel}</p>
          <p style="margin:0;"><strong>Paiement :</strong> ${paymentLabel}</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
