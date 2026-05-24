function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export function adminNewOrderEmail({ orderId, email, total, deliveryLabel, paymentLabel, itemsHtml, delivery_fee, address, remarques }) {
  const addrLine = address && (address.street || address.city)
    ? [address.number, address.street, address.postal_code, address.city].filter(Boolean).join(" ")
    : null;

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border-radius:16px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <h2 style="margin:0 0 6px;">🛎️ Nouvelle commande</h2>
        <p style="margin:0 0 14px;color:#555;">Commande <strong>#${orderId}</strong></p>

        <div style="background:#f3f4f8;border-radius:12px;padding:14px;">
          <p style="margin:0 0 8px;"><strong>Client :</strong> ${esc(email)}</p>
          <p style="margin:0 0 8px;">${itemsHtml || ""}</p>
          <p style="margin:0 0 8px;"><strong>Livraison :</strong> ${deliveryLabel}</p>
          ${addrLine ? `<p style="margin:0 0 8px;"><strong>Adresse :</strong> ${esc(addrLine)}</p>` : ""}
          ${Number(delivery_fee) > 0 ? `<p style="margin:0 0 8px;"><strong>Frais de port :</strong> ${Number(delivery_fee).toFixed(2).replace(".", ",")} €</p>` : ""}
          ${remarques ? `<p style="margin:0 0 8px;"><strong>Remarques :</strong> ${esc(remarques)}</p>` : ""}
          <p style="margin:0 0 8px;"><strong>Paiement :</strong> ${paymentLabel}</p>
          <p style="margin:0;"><strong>Total :</strong> <strong>${Number(total || 0).toFixed(2).replace(".", ",")} €</strong></p>
        </div>
      </div>
    </div>

  </body>
</html>`;
}
