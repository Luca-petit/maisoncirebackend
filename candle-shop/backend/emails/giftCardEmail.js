export function giftCardEmail({ code, amount, fromName, message, recipientEmail, color = "ambre", shopUrl = "https://backendmaisoncire.onrender.com" }) {
  const gradients = {
    violet: "linear-gradient(135deg,#7c3aed,#a78bfa,#6d28d9)",
    sauge:  "linear-gradient(135deg,#2d6a4f,#52b788,#1b4332)",
    ambre:  "linear-gradient(135deg,#aa8820,#d4b84e,#c9a428)",
    noir:   "linear-gradient(135deg,#1c1814,#3d3530,#0d0b09)",
  };
  const bg = gradients[color] || gradients.ambre;

  const msgHtml = message
    ? `<div style="background:#faf9f4;border-radius:14px;padding:20px;margin:20px 0;">
         <p style="margin:0 0 6px;color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.08em;">Message</p>
         <p style="margin:0;font-style:italic;color:#333;line-height:1.6;">"${esc(message)}"</p>
         ${fromName ? `<p style="margin:10px 0 0;color:#888;font-size:13px;">— ${esc(fromName)}</p>` : ""}
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:#f9f7f3;font-family:ui-sans-serif,system-ui,Arial,sans-serif;">

  <div style="max-width:480px;margin:0 auto;">

    <!-- Header -->
    <p style="text-align:center;font-size:13px;color:#999;margin:0 0 20px;letter-spacing:.1em;text-transform:uppercase;">Maison Cire · Carte Cadeau</p>

    <!-- Card visual -->
    <div style="background:${bg};border-radius:24px;padding:28px 24px;color:#fff;margin-bottom:24px;box-shadow:0 20px 60px rgba(0,0,0,.18);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
        <span style="font-size:13px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;opacity:.82;">Maison Cire</span>
        <span style="font-size:2rem;font-weight:900;letter-spacing:-.02em;">${Number(amount).toFixed(0)} €</span>
      </div>

      <p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.76;">Carte Cadeau</p>

      <div style="background:rgba(255,255,255,.14);border-radius:14px;padding:14px 20px;text-align:center;">
        <p style="margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:.12em;opacity:.65;">Votre code</p>
        <p style="margin:0;font-size:1.7rem;font-weight:900;letter-spacing:.14em;">${esc(code)}</p>
      </div>

      <div style="margin-top:20px;display:flex;justify-content:space-between;font-size:12px;opacity:.65;">
        <span>Pour : ${esc(recipientEmail)}</span>
        <span>Solde : ${Number(amount).toFixed(2)} €</span>
      </div>
    </div>

    ${msgHtml}

    <!-- CTA -->
    <div style="text-align:center;margin:28px 0;">
      <p style="color:#888;font-size:14px;margin:0 0 16px;">Utilisez ce code au moment du paiement.</p>
      <a href="${shopUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#aa8820,#d4b84e);color:#fff;padding:14px 36px;border-radius:999px;text-decoration:none;font-weight:800;font-size:15px;box-shadow:0 8px 24px rgba(180,140,30,.30);">
        Utiliser ma carte cadeau
      </a>
    </div>

    <!-- Info -->
    <div style="background:#fff;border-radius:14px;padding:18px 20px;border:1px solid rgba(0,0,0,.07);">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#333;">Comment utiliser votre carte ?</p>
      <ol style="margin:0;padding-left:18px;color:#666;font-size:13px;line-height:1.7;">
        <li>Ajoutez vos bijoux au panier</li>
        <li>Au checkout, saisissez votre code dans le champ "Code cadeau"</li>
        <li>Le montant est automatiquement déduit de votre total</li>
      </ol>
    </div>

    <!-- Footer -->
    <p style="text-align:center;color:#bbb;font-size:11px;margin:24px 0 0;">
      © Maison Cire · Ce code est personnel et non transférable<br>
      Solde valable sans limite de durée
    </p>

  </div>
</body>
</html>`;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
