export function giftCardEmail({ code, amount, fromName, message, recipientEmail, color = "ambre", shopUrl = "https://maisoncirebackend.onrender.com/index.html" }) {

  const solids = {
    violet: "#7c3aed",
    sauge:  "#2d6a4f",
    ambre:  "#b8920a",
    noir:   "#1c1814",
  };
  const grads = {
    violet: "linear-gradient(135deg,#7c3aed,#a78bfa,#6d28d9)",
    sauge:  "linear-gradient(135deg,#2d6a4f,#52b788,#1b4332)",
    ambre:  "linear-gradient(135deg,#aa8820,#d4b84e,#c9a428)",
    noir:   "linear-gradient(135deg,#1c1814,#3d3530,#0d0b09)",
  };
  const bgGrad  = grads[color]  || grads.ambre;
  const bgSolid = solids[color] || solids.ambre;

  const msgBlock = message ? `
    <tr><td height="8"></td></tr>
    <tr>
      <td class="msg-block" style="background:#f5f0e8;border-radius:14px;padding:18px 20px;border-left:3px solid ${bgSolid};">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.1em;">Message</p>
        <p style="margin:0;font-style:italic;color:#444;font-size:14px;line-height:1.65;">"${esc(message)}"</p>
        ${fromName ? `<p style="margin:8px 0 0;font-size:13px;color:#888;font-weight:600;">— ${esc(fromName)}</p>` : ""}
      </td>
    </tr>` : "";

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <style>
    :root { color-scheme: light dark; }

    body, .email-bg {
      background-color: #f5f0e8 !important;
    }
    .email-inner {
      background-color: #f5f0e8 !important;
    }
    .info-block {
      background-color: #ffffff !important;
      color: #333333 !important;
    }
    .info-title { color: #1a1714 !important; }
    .info-li    { color: #555555 !important; }
    .msg-block  { background-color: #f5f0e8 !important; }
    .footer-txt { color: #bbbbbb !important; }
    .header-txt { color: #aaaaaa !important; }
    .sub-txt    { color: #888888 !important; }

    @media (prefers-color-scheme: dark) {
      body, .email-bg, .email-inner {
        background-color: #1a1714 !important;
      }
      .info-block {
        background-color: #2a2520 !important;
        border-color: rgba(255,255,255,.08) !important;
      }
      .info-title { color: #f0e8d4 !important; }
      .info-li    { color: #c0b090 !important; }
      .msg-block  { background-color: #2a2520 !important; }
      .msg-block p { color: #d4c8a8 !important; }
      .footer-txt { color: #666666 !important; }
      .header-txt { color: #666666 !important; }
      .sub-txt    { color: #888888 !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">

  <table class="email-bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0e8;">
    <tr><td align="center" style="padding:32px 16px;">

      <table class="email-inner" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#f5f0e8;">

        <!-- Brand header -->
        <tr>
          <td style="text-align:center;padding-bottom:22px;">
            <span class="header-txt" style="font-size:11px;font-weight:800;color:#aaa;letter-spacing:.16em;text-transform:uppercase;">
              Maison Cire · Bijoux
            </span>
          </td>
        </tr>

        <!-- Gift card -->
        <tr>
          <td style="background:${bgGrad};background-color:${bgSolid};border-radius:22px;padding:26px 24px;"
              bgcolor="${bgSolid}">

            <!-- Top row: brand + amount -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;">
                  <span style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.80);">
                    Maison Cire
                  </span>
                </td>
                <td style="vertical-align:top;text-align:right;">
                  <span style="font-size:2.2rem;font-weight:900;letter-spacing:-.02em;color:#ffffff;line-height:1;">
                    ${Number(amount).toFixed(0)}&nbsp;€
                  </span>
                </td>
              </tr>
            </table>

            <!-- Label -->
            <p style="margin:14px 0 18px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.70);">
              Carte Cadeau
            </p>

            <!-- Code box -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:rgba(255,255,255,.15);border-radius:12px;padding:14px 18px;text-align:center;">
                  <p style="margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.60);">
                    Votre code
                  </p>
                  <p style="margin:0;font-size:1.6rem;font-weight:900;letter-spacing:.16em;color:#ffffff;">
                    ${esc(code)}
                  </p>
                </td>
              </tr>
            </table>

            <!-- Pour -->
            <p style="margin:14px 0 0;font-size:12px;color:rgba(255,255,255,.62);">
              Pour&nbsp;: ${esc(recipientEmail)}
            </p>
          </td>
        </tr>

        <!-- Message -->
        ${msgBlock}

        <!-- CTA -->
        <tr><td height="24"></td></tr>
        <tr>
          <td style="text-align:center;">
            <p class="sub-txt" style="margin:0 0 14px;font-size:14px;color:#888;">
              Utilisez ce code au moment du paiement.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="background:${bgGrad};background-color:${bgSolid};border-radius:999px;" bgcolor="${bgSolid}">
                  <a href="${shopUrl}"
                     style="display:inline-block;padding:14px 36px;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;border-radius:999px;">
                    Utiliser ma carte cadeau
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- How to use -->
        <tr><td height="24"></td></tr>
        <tr>
          <td class="info-block" style="background-color:#ffffff;border-radius:16px;padding:20px 22px;border:1px solid rgba(0,0,0,.07);">
            <p class="info-title" style="margin:0 0 10px;font-size:13px;font-weight:800;color:#1a1714;">
              Comment utiliser votre carte ?
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="22" style="vertical-align:top;padding-top:1px;">
                  <span style="font-size:13px;font-weight:700;color:${bgSolid};">1.</span>
                </td>
                <td><p class="info-li" style="margin:0 0 6px;font-size:13px;color:#555;line-height:1.5;">Ajoutez vos bijoux au panier</p></td>
              </tr>
              <tr>
                <td width="22" style="vertical-align:top;padding-top:1px;">
                  <span style="font-size:13px;font-weight:700;color:${bgSolid};">2.</span>
                </td>
                <td><p class="info-li" style="margin:0 0 6px;font-size:13px;color:#555;line-height:1.5;">Au checkout, entrez votre code dans le champ "Code cadeau"</p></td>
              </tr>
              <tr>
                <td width="22" style="vertical-align:top;padding-top:1px;">
                  <span style="font-size:13px;font-weight:700;color:${bgSolid};">3.</span>
                </td>
                <td><p class="info-li" style="margin:0;font-size:13px;color:#555;line-height:1.5;">Le montant est déduit automatiquement</p></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr><td height="20"></td></tr>
        <tr>
          <td style="text-align:center;">
            <p class="footer-txt" style="margin:0;color:#bbb;font-size:11px;line-height:1.7;">
              © Maison Cire &nbsp;·&nbsp; Ce code est personnel et non transférable<br>
              Solde valable sans limite de durée
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
