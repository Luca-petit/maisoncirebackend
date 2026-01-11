const API_BASE = (window.__API_BASE__ || "https://backendmaisoncire.onrender.com").replace(/\/$/, "");
const CART_KEY = "candle_shop_cart_v2";
const SESSION_KEY = "candle_shop_session_id_v1";

function getSessionId() {
  return localStorage.getItem(SESSION_KEY) || "";
}

async function apiFetch(path, opts = {}) {
  const url = (API_BASE ? API_BASE : "") + path;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data;
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : { skus:{}, packs:[], giftcards:[] };
  } catch {
    return { skus:{}, packs:[], giftcards:[] };
  }
}

function formatEUR(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
}

const els = {
  recap: document.getElementById("checkoutRecap"),
  total: document.getElementById("checkoutTotal"),
  form: document.getElementById("checkoutForm"),
  email: document.getElementById("coEmail"),
  phone: document.getElementById("coPhone"),
  delivery: document.getElementById("coDelivery"),
  addressWrap: document.getElementById("coAddressWrap"),
  addrNumber: document.getElementById("coAddrNumber"),
  addrStreet: document.getElementById("coAddrStreet"),
  addrPostal: document.getElementById("coAddrPostal"),
  addrCity: document.getElementById("coAddrCity"),
  payment: document.getElementById("coPayment"),
  payHint: document.getElementById("coPayHint"),
  msg: document.getElementById("coMsg"),
};

// ✅ Si connecté, pré-remplir l'email (et le verrouiller)
try {
  const u = JSON.parse(localStorage.getItem("mc_auth_user_v1") || "null");
  if (u?.email && els.email) {
    els.email.value = String(u.email);
    els.email.readOnly = true;
  }
} catch (_) {}

function setMsg(t){ if (els.msg) els.msg.textContent = t || ""; }

function renderRules() {
  const delivery = els.delivery.value;

  // adresse visible seulement si shipping
  els.addressWrap.style.display = (delivery === "shipping") ? "grid" : "none";

  // cash autorisé seulement si pickup
  const cashOption = [...els.payment.options].find(o => o.value === "cash");
  if (cashOption) cashOption.disabled = (delivery !== "pickup");

  if (delivery !== "pickup" && els.payment.value === "cash") {
    els.payment.value = "transfer";
  }

  if (els.payment.value === "transfer") {
    els.payHint.textContent = "Paiement par virement : vous recevrez l’IBAN dans l’email de confirmation.";
  } else {
    els.payHint.textContent = "Paiement en cash lors du retrait en magasin.";
  }
}

async function loadServerCartTotal() {
  const sid = getSessionId();
  if (!sid) throw new Error("Session panier manquante.");
  const data = await apiFetch(`/api/cart/${encodeURIComponent(sid)}`);
  return data?.cart || null;
}

async function loadProductsForNames() {
  const data = await apiFetch("/api/products");
  const list = Array.isArray(data?.products) ? data.products : [];
  const map = {};
  for (const p of list) map[p.id] = p.name || p.id;
  return map;
}

async function renderRecap() {
  const cartLocal = loadCart();
  const sid = getSessionId();

  // best effort: on récup noms produits depuis API
  let nameMap = {};
  try { nameMap = await loadProductsForNames(); } catch {}

  const lines = [];
  for (const [id, qty] of Object.entries(cartLocal.skus || {})) {
    lines.push(`${nameMap[id] || id} ×${qty}`);
  }
  for (const p of (cartLocal.packs || [])) lines.push(`${p.name || "Pack"} (${formatEUR(p.total || 0)})`);
  for (const gc of (cartLocal.giftcards || [])) lines.push(`Carte cadeau (${formatEUR(gc.amount || 0)})`);

  els.recap.innerHTML = lines.length ? `<ul>${lines.map(x => `<li>${x}</li>`).join("")}</ul>` : "Panier vide.";
  // total fiable = serveur (si possible)
  try {
    const srvCart = await loadServerCartTotal();
    // pas de total direct => on calcule très simple côté front (approx). Le vrai total = serveur au checkout.
    let approx = 0;
    for (const [id, qty] of Object.entries(srvCart?.skus || {})) {
      // on ne connait pas les prix ici sans produits; on affiche seulement “voir email”
      approx = null;
    }
    els.total.textContent = "Calculé à la confirmation (email)";
  } catch {
    els.total.textContent = "—";
  }

  if (!sid) setMsg("⚠️ Session panier manquante, retourne sur la boutique.");
}

els.delivery.addEventListener("change", renderRules);
els.payment.addEventListener("change", renderRules);

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("");

  const sid = getSessionId();
  if (!sid) return setMsg("❌ Session panier manquante.");

  const email = (els.email.value || "").trim().toLowerCase();
  const phone = (els.phone.value || "").trim();
  const delivery_mode = els.delivery.value;
  const payment_mode = els.payment.value;

  const payload = { email, phone, delivery_mode, payment_mode };

  if (delivery_mode === "shipping") {
    payload.address = {
      number: (els.addrNumber.value || "").trim(),
      street: (els.addrStreet.value || "").trim(),
      postal_code: (els.addrPostal.value || "").trim(),
      city: (els.addrCity.value || "").trim(),
    };
  }

  try {
    setMsg("Envoi...");
    const data = await apiFetch(`/api/checkout/${encodeURIComponent(sid)}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    // option : vider panier local après succès
    localStorage.setItem(CART_KEY, JSON.stringify({ skus:{}, packs:[], giftcards:[] }));

    setMsg(`✅ Commande créée. ${data?.payLine || ""}`);
  } catch (err) {
    setMsg(`❌ ${err?.message || "Erreur checkout"}`);
  }
});

renderRules();
renderRecap();

