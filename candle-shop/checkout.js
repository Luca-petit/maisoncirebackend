// Maison Cire — checkout.js (FIXED)
// - POST /api/orders (server.js)
// - DOM safe (wait DOMContentLoaded)
// - Calculates totals like app.js (singles promos + packs totals + giftcards)
// - Prefill email if logged (mc_auth_user_v1)
// - Uses session_id + cart payload
// - Displays messages on page

(() => {
  const API_BASE = (window.__API_BASE__ || "https://backendmaisoncire.onrender.com").replace(/\/$/, "");
  const CART_KEY = "candle_shop_cart_v2";
  const SESSION_KEY = "candle_shop_session_id_v1";

  function getSessionId() {
    return localStorage.getItem(SESSION_KEY) || "";
  }

  async function apiFetch(path, opts = {}) {
    const url = (API_BASE ? API_BASE : "") + path;
    const res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  }

  function safeJSON(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function loadCart() {
    const fallback = { skus: {}, packs: [], giftcards: [] };
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? safeJSON(raw, fallback) : fallback;
    if (!parsed || typeof parsed !== "object") return fallback;
    if (!parsed.skus || typeof parsed.skus !== "object") parsed.skus = {};
    if (!Array.isArray(parsed.packs)) parsed.packs = [];
    if (!Array.isArray(parsed.giftcards)) parsed.giftcards = [];
    return parsed;
  }

  function saveEmptyCart() {
    localStorage.setItem(CART_KEY, JSON.stringify({ skus: {}, packs: [], giftcards: [] }));
  }

  function formatEUR(n) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  }

  // promos singles: même règle que app.js (5 => 2 offertes, +3 => 1 offerte)
  function computeFreeUnitsSingles(qty) {
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    const group5 = Math.floor(q / 5);
    const rem = q % 5;
    const group3 = Math.floor(rem / 3);
    return group5 * 2 + group3 * 1;
  }

  async function loadProductsMap() {
    const data = await apiFetch("/api/products");
    const list = Array.isArray(data?.products) ? data.products : [];
    const map = {};
    for (const p of list) {
      map[p.id] = {
        id: p.id,
        name: p.name || p.id,
        price: Number(p.price || 0),
      };
    }
    return map;
  }

  function computeTotals(cart, productsMap) {
    let subtotal = 0;
    let discount = 0;

    // singles
    for (const [id, qty] of Object.entries(cart.skus || {})) {
      const p = productsMap[id];
      const price = Number(p?.price || 0);
      const q = Math.max(0, Math.floor(Number(qty) || 0));
      subtotal += price * q;

      const free = computeFreeUnitsSingles(q);
      discount += free * price;
    }

    // packs: app.js stocke déjà value/free/total
    for (const pack of (cart.packs || [])) {
      subtotal += Number(pack.value || 0);
      discount += Number(pack.free || 0);
    }

    // giftcards: pas de promo
    for (const gc of (cart.giftcards || [])) {
      subtotal += Number(gc.amount || 0);
    }

    const total = Math.max(0, subtotal - discount);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  function setMsg(els, t) {
    if (els.msg) els.msg.textContent = t || "";
  }

  function renderRules(els) {
    const delivery = els.delivery.value;

    // adresse visible seulement si shipping
    if (els.addressWrap) els.addressWrap.style.display = (delivery === "shipping") ? "grid" : "none";

    // cash autorisé seulement si pickup
    const cashOption = [...els.payment.options].find(o => o.value === "cash");
    if (cashOption) cashOption.disabled = (delivery !== "pickup");

    if (delivery !== "pickup" && els.payment.value === "cash") {
      els.payment.value = "transfer";
    }

    if (els.payHint) {
      els.payHint.textContent =
        (els.payment.value === "transfer")
          ? "Paiement par virement : vous recevrez l’IBAN dans l’email de confirmation."
          : "Paiement en cash lors du retrait en magasin.";
    }
  }

  async function renderRecap(els, cart, productsMap, totals) {
    const lines = [];

    // singles
    for (const [id, qty] of Object.entries(cart.skus || {})) {
      const p = productsMap[id];
      const name = p?.name || id;
      lines.push(`${name} ×${qty}`);
    }

    // packs
    for (const p of (cart.packs || [])) {
      lines.push(`${p.name || "Pack"} (${formatEUR(p.total || 0)})`);
    }

    // giftcards
    for (const gc of (cart.giftcards || [])) {
      lines.push(`Carte cadeau (${formatEUR(gc.amount || 0)})`);
    }

    if (els.recap) {
      els.recap.innerHTML = lines.length
        ? `<ul>${lines.map(x => `<li>${x}</li>`).join("")}</ul>`
        : "Panier vide.";
    }

    if (els.total) {
      els.total.textContent = lines.length ? formatEUR(totals.total) : "—";
    }
  }

  function prefillEmailIfLogged(els) {
    try {
      const u = safeJSON(localStorage.getItem("mc_auth_user_v1") || "null", null);
      if (u?.email && els.email) {
        els.email.value = String(u.email);
        els.email.readOnly = true;
      }
    } catch (_) {}
  }

  function validateShippingAddress(els) {
    const number = (els.addrNumber?.value || "").trim();
    const street = (els.addrStreet?.value || "").trim();
    const postal_code = (els.addrPostal?.value || "").trim();
    const city = (els.addrCity?.value || "").trim();

    // validation simple (tu peux durcir si tu veux)
    if (!street || !postal_code || !city) return null;
    return { number, street, postal_code, city };
  }

  document.addEventListener("DOMContentLoaded", async () => {
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

    if (!els.form) return;

    prefillEmailIfLogged(els);

    // rules UI
    renderRules(els);
    els.delivery?.addEventListener("change", () => renderRules(els));
    els.payment?.addEventListener("change", () => renderRules(els));

    const sid = getSessionId();
    if (!sid) {
      setMsg(els, "⚠️ Session panier manquante. Retourne sur la boutique et ajoute un produit.");
      return;
    }

    // load cart + products
    let cart = loadCart();
    let productsMap = {};
    try {
      productsMap = await loadProductsMap();
    } catch (e) {
      // si l'API products down, on continue mais total = 0
      productsMap = {};
    }

    const totals = computeTotals(cart, productsMap);
    await renderRecap(els, cart, productsMap, totals);

    els.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMsg(els, "");

      cart = loadCart();
      const hasItems =
        Object.keys(cart.skus || {}).length ||
        (cart.packs || []).length ||
        (cart.giftcards || []).length;

      if (!hasItems) return setMsg(els, "❌ Panier vide.");

      const email = (els.email?.value || "").trim().toLowerCase();
      const phone = (els.phone?.value || "").trim() || null;
      const delivery_mode = els.delivery?.value || "pickup";
      const payment_mode = els.payment?.value || "transfer";

      if (!email || !email.includes("@")) return setMsg(els, "❌ Email invalide.");

      let address = null;
      let delivery_fee = 0;

      if (delivery_mode === "shipping") {
        const addr = validateShippingAddress(els);
        if (!addr) return setMsg(els, "❌ Adresse incomplète (rue, code postal, ville).");
        address = addr;

        // si tu veux des frais de port fixes :
        // delivery_fee = 4.90;
        delivery_fee = 0;
      }

      // total recalculé (best-effort) comme app.js
      const totalsNow = computeTotals(cart, productsMap);
      const total = totalsNow.total + Number(delivery_fee || 0);

      const payload = {
        session_id: sid,
        email,
        phone,
        delivery_mode,
        payment_mode,
        address,
        delivery_fee,
        cart,
        total,
        status: "preparation",
      };

      try {
        setMsg(els, "Envoi...");
        const data = await apiFetch("/api/orders", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        saveEmptyCart();
        setMsg(els, `✅ Commande créée (#${data?.order_id || "OK"}). Un email de confirmation va arriver.`);
        // option: redirect
        // setTimeout(() => (window.location.href = "account.html"), 700);
      } catch (err) {
        setMsg(els, `❌ ${err?.message || "Erreur commande"}`);
      }
    });
  });
})();


