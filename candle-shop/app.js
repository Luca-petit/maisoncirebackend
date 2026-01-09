/* =========================================================
   Maison Cire — app.js (FULL)
   ✅ Includes: Boutique + Panier (singles + packs + giftcards) + Admin + Newsletter
   ✅ Includes: Pack Wizard (Step 1 choose pack, Step 2 compose, then add pack)
   ✅ Includes: Carte Cadeau (live preview + add to cart + remove in cart)
   ✅ NEW: Avis produits (moyenne + liste + ajout) + étoiles cliquables
   ✅ FIX: Stock “temps réel” (singles + packs) = jamais dépasser le stock total
   ✅ FIX: Packs: grisé/indispo + suppression bouton +1 + suppression badge x0
   ========================================================= */

/* ==========
  Storage keys
========== */
const SUPABASE_URL = "https://lgewjddjwvhvtfiqskru.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Q0xoPBZJdqpYfo86CZfTxQ_hZMOdco2";
const SUPABASE_BUCKET = "products";


const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);


const STORAGE_KEY = "candle_shop_products_v2";
const CART_KEY = "candle_shop_cart_v2";
const NEWS_KEY = "candle_shop_newsletter_v1";
const REVIEWS_KEY = "candle_shop_reviews_v1";
const NOTIFY_KEY = "candle_shop_notify_v1";


/* ========== 
  Backend API (Supabase via Express)
  - Set window.__API_BASE__ in index.html if backend is on another domain.
========== */

const API_BASE = (window.__API_BASE__ || "https://backendmaisoncire.onrender.com").replace(/\/$/, "");

async function apiFetch(path, opts = {}) {
  const url = (API_BASE ? API_BASE : "") + path;

  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };

  const res = await fetch(url, {
    ...opts,
    headers,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

const SESSION_KEY = "candle_shop_session_id_v1";
function getSessionId() {
  return localStorage.getItem(SESSION_KEY) || "";
}

async function ensureSessionId() {
  let sid = getSessionId();
  if (sid) return sid;
  const data = await apiFetch("/api/cart/init", { method: "POST" });
  sid = data?.session_id || "";
  if (sid) localStorage.setItem(SESSION_KEY, sid);
  return sid;
}



/* ==========
  Default data
========== */

const DEFAULT_PRODUCTS = [
  { id: "vanille", name: "Bougie Vanille", price: 18.9, stock: 12, description: "Douce, chaleureuse, ultra cocooning.", image: "assets/vanille.jpg" },
  { id: "ambre", name: "Bougie Ambre", price: 21.5, stock: 9, description: "Ambrée et élégante, vibe hôtel.", image: "assets/ambre.jpg" },
  { id: "figue", name: "Bougie Figue", price: 20.0, stock: 7, description: "Fruité chic, parfait salon.", image: "assets/figue.jpg" },
  { id: "coton", name: "Bougie Coton", price: 17.5, stock: 15, description: "Propre et légère, effet linge frais.", image: "assets/coton.jpg" },
  { id: "santal", name: "Bougie Santal", price: 22.9, stock: 5, description: "Boisé premium, très apaisant.", image: "assets/santal.jpg" },
];

const ADMIN_CODE_DEMO = "admin123";

/* ==========
  Helpers
========== */

function getAdminKey() {
  const k = localStorage.getItem("candle_shop_admin_key");
  if (k && k.trim()) return k.trim();
  const v = (els.adminCode?.value || "").trim();
  if (v) {
    localStorage.setItem("candle_shop_admin_key", v);
    return v;
  }
  return "";
}

function formatDateTimeFR(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("fr-FR");
  } catch {
    return String(ts);
  }
}

function renderOrderDetail(order) {
  if (!els.adminOrderDetail) return;
  if (!order) {
    els.adminOrderDetail.classList.add("hidden");
    els.adminOrderDetail.innerHTML = "";
    return;
  }

  const cart = order.cart || {};
  const skus = cart.skus || {};
  const packs = cart.packs || [];
  const giftcards = cart.giftcards || [];

  const linesSingles = Object.entries(skus).map(([pid, qty]) => {
    const p = products.find(x => x.id === pid);
    return `<li>${escapeHTML(p?.name || pid)} ×${qty}</li>`;
  }).join("");

  const linesPacks = packs.map(pack => {
    const items = (pack.items || []).map(it => {
      const p = products.find(x => x.id === it.id);
      return `${p?.name || it.id} ×${it.qty}`;
    }).join(" · ");
    return `<li><strong>${escapeHTML(pack.name || "Pack")}</strong> — ${escapeHTML(items)}</li>`;
  }).join("");

  const linesGc = giftcards.map(gc => {
    return `<li><strong>Carte cadeau</strong> — ${Number(gc.amount || 0)}€ → ${escapeHTML(gc.receiver || "")}</li>`;
  }).join("");

  els.adminOrderDetail.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
      <h4>Détail commande</h4>
      <button type="button" class="btn btn--ghost" data-admin-order-close>Fermer</button>
    </div>

    <p class="tiny muted" style="margin-top:6px;">
      <strong>#${escapeHTML(order.id)}</strong> · ${escapeHTML(formatDateTimeFR(order.created_at))}
    </p>

    <div style="margin-top:10px;">
      <p><strong>Email:</strong> ${escapeHTML(order.email || "")}</p>
      <p><strong>Livraison:</strong> ${escapeHTML(order.delivery_mode || "")}</p>
      <p><strong>Paiement:</strong> ${escapeHTML(order.payment_mode || "")}</p>
      <p><strong>Total:</strong> ${formatEUR(Number(order.total || 0))}</p>
    </div>

    <div style="margin-top:14px;">
      <h5>Articles</h5>
      <ul>
        ${linesSingles}
        ${linesPacks}
        ${linesGc}
      </ul>
    </div>

    <details style="margin-top:12px;">
      <summary class="tiny muted">Voir le JSON brut</summary>
      <pre style="white-space:pre-wrap; font-size:12px;">${escapeHTML(JSON.stringify(order, null, 2))}</pre>
    </details>
  `;

  els.adminOrderDetail.classList.remove("hidden");
}

async function loadAdminOrders() {
  if (!els.adminOrdersList) return;

  els.adminOrdersMsg && (els.adminOrdersMsg.textContent = "Chargement...");
  els.adminOrdersList.innerHTML = "";

  try {
    const orders = await apiAdminLoadOrders();

    if (!orders.length) {
      els.adminOrdersMsg && (els.adminOrdersMsg.textContent = "Aucune commande.");
      return;
    }

    els.adminOrdersMsg && (els.adminOrdersMsg.textContent = `${orders.length} commande(s)`);

    els.adminOrdersList.innerHTML = orders.map(o => `
      <button type="button" class="adminOrderRow" data-admin-order-open="${escapeHTML(o.id)}">
        <div>
          <div><strong>#${escapeHTML(o.id)}</strong></div>
          <div class="tiny muted">${escapeHTML(formatDateTimeFR(o.created_at))} · ${o.items_count} article(s)</div>
        </div>
        <div style="text-align:right;">
          <div><strong>${formatEUR(o.total)}</strong></div>
          <div class="tiny muted">${escapeHTML(o.delivery_mode || "")}</div>
        </div>
      </button>
    `).join("");
  } catch (e) {
    els.adminOrdersMsg && (els.adminOrdersMsg.textContent = "❌ " + (e?.message || "Erreur"));
  }
}




function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // enlève accents
    .replace(/[^a-z0-9]+/g, "-")                      // espaces + chars -> -
    .replace(/^-+|-+$/g, "")                          // trim -
    .replace(/--+/g, "-");                            // évite --
}

function makeUniqueId(base, existingIds) {
  let id = base || "produit";
  if (!existingIds.has(id)) return id;

  let i = 2;
  while (existingIds.has(`${id}-${i}`)) i++;
  return `${id}-${i}`;
}


function formatEUR(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
}

function clampQty(q) {
  if (!Number.isFinite(q)) return 0;
  return Math.max(0, Math.floor(q));
}

function safeJSON(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function loadNotifyMap(){
  return safeJSON(localStorage.getItem(NOTIFY_KEY), {}) || {};
}
function saveNotifyMap(map){
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(map));
}

// map: { [productId]: "email@..." }
function getNotifiedEmail(productId){
  const map = loadNotifyMap();
  const v = map?.[productId];
  return typeof v === "string" ? v : "";
}
function isNotified(productId){
  return !!getNotifiedEmail(productId);
}
function setNotified(productId, emailOrFalse){
  const map = loadNotifyMap();
  if (emailOrFalse && typeof emailOrFalse === "string") map[productId] = emailOrFalse;
  else delete map[productId];
  saveNotifyMap(map);
}

function isValidEmail(s){
  const v = String(s || "").trim();
  // simple + efficace
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}


/* ==========
  Products storage
========== */

function loadProducts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(DEFAULT_PRODUCTS);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Bad products");
    return parsed;
  } catch {
    return structuredClone(DEFAULT_PRODUCTS);
  }
}

function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}


async function apiLoadProducts() {
  const data = await apiFetch("/api/products");
  return Array.isArray(data?.products) ? data.products : [];
}

async function apiAdminDeleteProduct(id){
  const res = await fetch(`${API_BASE}/api/admin/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-admin-key": getAdminKey() }

  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Erreur suppression");
  return true;
}


async function apiLoadReviewSummary() {
  const data = await apiFetch("/api/reviews/summary");
  return (data?.summary && typeof data.summary === "object") ? data.summary : {};
}

async function apiLoadCart() {
  const sid = getSessionId();
  if (!sid) return null;
  const data = await apiFetch(`/api/cart/${sid}`);
  return data?.cart || null;
}

async function apiAdminLoadOrders() {
  const adminKey = getAdminKey();
  const data = await apiFetch("/api/admin/orders", {
    headers: { "x-admin-key": adminKey }
  });
  return Array.isArray(data?.orders) ? data.orders : [];
}

async function apiAdminLoadOrderDetail(orderId) {
  const adminKey = getAdminKey();
  const data = await apiFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    headers: { "x-admin-key": adminKey }
  });
  return data?.order || null;
}


async function apiAddReview(productId, payload) {
  const data = await apiFetch(`/api/reviews/${productId}`, { method: "POST", body: JSON.stringify(payload) });
  return data?.review || null;
}

async function apiLoadReviews(productId) {
  const data = await apiFetch(`/api/reviews/${productId}`);
  return Array.isArray(data?.reviews) ? data.reviews : [];
}

async function apiAdminDeleteReview(reviewId) {
  const adminKey = getAdminKey();
  const data = await apiFetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
    method: "DELETE",
    headers: { "x-admin-key": adminKey }
  });
  return data;
}

async function apiAdminClearReviews(productId) {
  const adminKey = getAdminKey();
  const data = await apiFetch(`/api/admin/reviews/product/${encodeURIComponent(productId)}`, {
    method: "DELETE",
    headers: { "x-admin-key": adminKey }
  });
  return data;
}

async function apiNotifySubscribe(productId, email) {
  return apiFetch(`/api/notify/${encodeURIComponent(productId)}`, {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

async function apiNotifyUnsubscribe(productId, email) {
  return apiFetch(`/api/notify/${encodeURIComponent(productId)}`, {
    method: "DELETE",
    body: JSON.stringify({ email })
  });
}




/* ==========
  Cart storage (singles + packs + giftcards)
========== */

function loadCart() {
  const raw = localStorage.getItem(CART_KEY);
  const fallback = { skus: {}, packs: [], giftcards: [] };
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    if (!parsed.skus || typeof parsed.skus !== "object") parsed.skus = {};
    if (!Array.isArray(parsed.packs)) parsed.packs = [];
    if (!Array.isArray(parsed.giftcards)) parsed.giftcards = [];
    return parsed;
  } catch {
    return fallback;
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  const sid = getSessionId();
  if (sid) {
    apiFetch(`/api/cart/${sid}`, { method: "PUT", body: JSON.stringify({ cart }) }).catch(() => {});
  }
}

/* ==========
  Offers logic (SINGLES)
========== */

function computeFreeUnitsSingles(qty) {
  const group5 = Math.floor(qty / 5);
  const rem = qty % 5;
  const group3 = Math.floor(rem / 3);
  return group5 * 2 + group3 * 1;
}

/* ==========
  Offers logic (PACKS)
========== */

function sumPackUnits(packItems) {
  return packItems.reduce((a, it) => a + it.qty, 0);
}

function computePackTotals(packItems, packSize, products) {
  const freebies = packSize === 5 ? 2 : 1;

  const unitPrices = [];
  let value = 0;

  for (const it of packItems) {
    const p = products.find(x => x.id === it.id);
    if (!p) continue;

    for (let i = 0; i < it.qty; i++) unitPrices.push(p.price);
    value += p.price * it.qty;
  }

  unitPrices.sort((a, b) => a - b);
  const free = unitPrices.slice(0, freebies).reduce((a, b) => a + b, 0);

  return { value, free, total: Math.max(0, value - free) };
}

/* ==========
  Reviews (localStorage demo)
========== */

function loadReviewsMap() {
  const raw = localStorage.getItem(REVIEWS_KEY);
  const fallback = {};
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveReviewsMap(map) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(map));
}

let reviewsMap = {}; // fallback local
let reviewSummary = {};

function getReviews(productId) {
  const list = reviewsMap[productId];
  return Array.isArray(list) ? list : [];
}

function addReview(productId, review) {
  if (!reviewsMap[productId]) reviewsMap[productId] = [];
  reviewsMap[productId].unshift(review);
  saveReviewsMap(reviewsMap);
}

function getAvgRating(productId) {
  const s = reviewSummary?.[productId];
  if (s) return { avg: Number(s.avg) || 0, count: Number(s.count) || 0 };

  const list = getReviews(productId);
  if (list.length === 0) return { avg: 0, count: 0 };
  const sum = list.reduce((a, r) => a + (Number(r.rating) || 0), 0);
  return { avg: sum / list.length, count: list.length };
}

function starsHTML(value) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const full = Math.floor(v);
  const half = (v - full) >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;

  const mk = (cls) => `<span class="star ${cls}"></span>`;
  return `<div class="stars" aria-label="Note ${v.toFixed(1)} sur 5">
    ${Array.from({ length: full }).map(() => mk("is-on")).join("")}
    ${half ? mk("is-half") : ""}
    ${Array.from({ length: empty }).map(() => mk("")).join("")}
  </div>`;
}

/* ==========
  Clickable stars input (modal)
========== */

function setReviewRating(rating) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  if (els.reviewRatingInput) els.reviewRatingInput.value = String(r);
  if (els.reviewRatingSelect) els.reviewRatingSelect.value = String(r);
  renderReviewStarsUI(r);
}

function getReviewRating() {
  const v1 = els.reviewRatingInput?.value;
  const v2 = els.reviewRatingSelect?.value;
  const n = Number(v1 || v2 || 0);
  return Number.isFinite(n) ? n : 0;
}

function renderReviewStarsUI(current) {
  if (!els.reviewStars) return;

  const c = Math.max(0, Math.min(5, Number(current) || 0));
  const btn = (i) => `
    <button type="button"
            class="starPick ${i <= c ? "is-on" : ""}"
            data-star-pick="${i}"
            aria-label="${i} étoile${i > 1 ? "s" : ""}"
            aria-pressed="${i === c ? "true" : "false"}"></button>
  `;

  els.reviewStars.innerHTML = `
    <div class="starPickRow" role="radiogroup" aria-label="Choisir une note">
      ${[1, 2, 3, 4, 5].map(btn).join("")}
    </div>
    <div class="tiny muted" style="margin-top:8px;">Note : <strong>${c}</strong> / 5</div>
  `;
}


/* ==========
  Global state
========== */

let products = loadProducts();
let cart = loadCart();

let packSelection = {};
let chosenPackSize = null;

let currentReviewProductId = null;

let currentPdpId = null;

/* ==========
  DOM
========== */

const els = {
  year: document.getElementById("year"),

  hamburger: document.getElementById("hamburger"),
  nav: document.getElementById("nav"),

  grid: document.getElementById("productGrid"),

  cartBtn: document.getElementById("cartBtn"),
  cartCount: document.getElementById("cartCount"),
  cartDrawer: document.getElementById("cartDrawer"),
  cartOverlay: document.getElementById("cartOverlay"),
  cartClose: document.getElementById("cartClose"),
  cartItems: document.getElementById("cartItems"),

  subtotal: document.getElementById("subtotal"),
  discount: document.getElementById("discount"),
  total: document.getElementById("total"),
  discountHint: document.getElementById("discountHint"),
  checkoutBtn: document.getElementById("checkoutBtn"),
  clearCartBtn: document.getElementById("clearCartBtn"),
  checkoutMsg: document.getElementById("checkoutMsg"),

  newsletterForm: document.getElementById("newsletterForm"),
  newsletterEmail: document.getElementById("newsletterEmail"),
  newsletterMsg: document.getElementById("newsletterMsg"),

  // Admin
  adminAuth: document.getElementById("adminAuth"),
  adminPanel: document.getElementById("adminPanel"),
  adminCode: document.getElementById("adminCode"),
  adminLogin: document.getElementById("adminLogin"),
  adminMsg: document.getElementById("adminMsg"),
  adminSelect: document.getElementById("adminSelect"),
  adminName: document.getElementById("adminName"),
  adminPrice: document.getElementById("adminPrice"),
  adminStock: document.getElementById("adminStock"),
  adminDescription: document.getElementById("adminDescription"),
  adminSave: document.getElementById("adminSave"),
  adminSaveMsg: document.getElementById("adminSaveMsg"),
  adminReset: document.getElementById("adminReset"),
  adminDelete: document.getElementById("adminDelete"),


  // Pack Wizard
  packStep1: document.getElementById("packStep1"),
  packStep2: document.getElementById("packStep2"),
  packChosenText: document.getElementById("packChosenText"),
  packGoStep2: document.getElementById("packGoStep2"),
  packBack: document.getElementById("packBack"),

  packStep2Subtitle: document.getElementById("packStep2Subtitle"),
  packReset: document.getElementById("packReset"),
  packPickGrid: document.getElementById("packPickGrid"),
  packProgress: document.getElementById("packProgress"),
  packPreviewLines: document.getElementById("packPreviewLines"),
  packValue: document.getElementById("packValue"),
  packFree: document.getElementById("packFree"),
  packTotal: document.getElementById("packTotal"),
  packHint: document.getElementById("packHint"),
  addPackBtn: document.getElementById("addPackBtn"),
  packMsg: document.getElementById("packMsg"),

  // Gift Card
  gcPreview: document.getElementById("giftCardPreview"),
  gcPreviewAmount: document.getElementById("gcPreviewAmount"),
  gcPreviewReceiver: document.getElementById("gcPreviewReceiver"),
  gcPreviewDate: document.getElementById("gcPreviewDate"),
  gcPreviewMsg: document.getElementById("gcPreviewMsg"),

  gcAmount: document.getElementById("gcAmount"),
  gcColor: document.getElementById("gcColor"),
  gcReceiverEmail: document.getElementById("gcReceiverEmail"),
  gcSendDate: document.getElementById("gcSendDate"),
  gcFromName: document.getElementById("gcFromName"),
  gcMessage: document.getElementById("gcMessage"),
  gcAddToCart: document.getElementById("gcAddToCart"),
  gcReset: document.getElementById("gcReset"),
  gcMsg: document.getElementById("gcMsg"),

  gcCustomWrap: document.getElementById("gcCustomWrap"),
  gcCustomAmount: document.getElementById("gcCustomAmount"),

  // Reviews Modal
  // Reviews (2 modals)
reviewsViewModal: document.getElementById("reviewsViewModal"),
reviewsFormModal: document.getElementById("reviewsFormModal"),

reviewsAvgStars: document.getElementById("reviewsAvgStars"),
reviewsAvgText: document.getElementById("reviewsAvgText"),
reviewsCount: document.getElementById("reviewsCount"),
reviewsList: document.getElementById("reviewsList"),

reviewForm: document.getElementById("reviewForm"),
reviewName: document.getElementById("reviewName"),
reviewStars: document.getElementById("reviewStars"),
reviewRatingInput: document.getElementById("reviewRating"),
reviewText: document.getElementById("reviewText"),
reviewMsg: document.getElementById("reviewMsg"),


  // Admin reviews
  adminReviewsCount: document.getElementById("adminReviewsCount"),
  adminReviewsAvg: document.getElementById("adminReviewsAvg"),
  adminReviewsList: document.getElementById("adminReviewsList"),
  adminReviewsClear: document.getElementById("adminReviewsClear"),
  adminReviewsMsg: document.getElementById("adminReviewsMsg"),

  adminOrdersMsg: document.getElementById("adminOrdersMsg"),
adminOrdersList: document.getElementById("adminOrdersList"),
adminOrderDetail: document.getElementById("adminOrderDetail"),


  // PDP modal
  pdpModal: document.getElementById("pdpModal"),
  pdpOverlay: document.getElementById("pdpOverlay"),
  pdpClose: document.getElementById("pdpClose"),
  pdpTitle: document.getElementById("pdpTitle"),
  pdpImg: document.getElementById("pdpImg"),
  pdpPrice: document.getElementById("pdpPrice"),
  pdpStock: document.getElementById("pdpStock"),
  pdpStars: document.getElementById("pdpStars"),
  pdpRatingMeta: document.getElementById("pdpRatingMeta"),
  pdpDescription: document.getElementById("pdpDescription"),
  pdpAddToCart: document.getElementById("pdpAddToCart"),
  pdpMsg: document.getElementById("pdpMsg"),

  pdpNotifyRow: document.getElementById("pdpNotifyRow"),
  pdpNotifyToggle: document.getElementById("pdpNotifyToggle"),

  pdpNotifyEmail: document.getElementById("pdpNotifyEmail"),
  pdpReviewBtn: document.getElementById("pdpReviewBtn"),


};

if (els.year) els.year.textContent = new Date().getFullYear();

/* ==========
  Utilities
========== */

function getProduct(id) {
  return products.find(p => p.id === id);
}

function reservedInPacks(productId) {
  let n = 0;
  for (const pack of (cart.packs || [])) {
    for (const it of (pack.items || [])) {
      if (it.id === productId) n += (Number(it.qty) || 0);
    }
  }
  return n;
}

function reservedTotal(productId) {
  const singles = Number(cart.skus?.[productId] || 0);
  const packs = reservedInPacks(productId);
  return singles + packs;
}

// Stock restant SANS compter le pack en cours (wizard)
function availableStock(productId) {
  const p = getProduct(productId);
  if (!p) return 0;
  return Math.max(0, (Number(p.stock) || 0) - reservedTotal(productId));
}

// Stock restant EN comptant la sélection actuelle du pack
function availableStockForPackBuilder(productId) {
  const left = availableStock(productId);
  const inWizard = Number(packSelection?.[productId] || 0);
  return Math.max(0, left - inWizard);
}

function totalCartCount() {
  const skusCount = Object.values(cart.skus).reduce((a, b) => a + b, 0);
  const packsCount = (cart.packs || []).length;
  const giftCount = (cart.giftcards || []).length;
  return skusCount + packsCount + giftCount;
}

function toast(msg) {
  if (!els.checkoutMsg) return;
  els.checkoutMsg.textContent = msg;
}

function uiToast(text) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = text;
  t.classList.add("is-on");
  clearTimeout(uiToast._t);
  uiToast._t = setTimeout(() => t.classList.remove("is-on"), 1400);
}

function bumpCartIcon() {
  if (!els.cartBtn) return;
  els.cartBtn.classList.remove("bump");
  void els.cartBtn.offsetWidth;
  els.cartBtn.classList.add("bump");
}

/* ==========
  Pack Wizard helpers
========== */

function currentPackSize() {
  return Number(chosenPackSize || 3);
}

function showPackStep(step) {
  if (!els.packStep1 || !els.packStep2) return;
  if (step === 1) {
    els.packStep1.classList.remove("hidden");
    els.packStep2.classList.add("hidden");
  } else {
    els.packStep1.classList.add("hidden");
    els.packStep2.classList.remove("hidden");
  }
}

function updatePackChosenUI() {
  if (!els.packChosenText || !els.packGoStep2) return;

  if (!chosenPackSize) {
    els.packChosenText.textContent = "Aucun pack sélectionné.";
    els.packGoStep2.disabled = true;
    return;
  }

  els.packChosenText.textContent = chosenPackSize === 3
    ? "Pack sélectionné : Pack 3 (1 offerte)"
    : "Pack sélectionné : Pack 5 (2 offertes)";

  els.packGoStep2.disabled = false;

  if (els.packStep2Subtitle) {
    els.packStep2Subtitle.textContent = chosenPackSize === 3
      ? "Choisis 3 bougies (la moins chère est offerte)."
      : "Choisis 5 bougies (les 2 moins chères sont offertes).";
  }
}

function selectPackType(size) {
  chosenPackSize = Number(size);
  packSelection = {};
  if (els.packMsg) els.packMsg.textContent = "";

  document.querySelectorAll(".packTypeCard").forEach(btn => {
    btn.classList.toggle("is-selected", Number(btn.dataset.packtype) === chosenPackSize);
  });

  updatePackChosenUI();
}

/* ==========
  Render products (shop grid) — FIX stock temps réel
========== */

function renderProducts() {
  if (!els.grid) return;

  els.grid.innerHTML = "";

  for (const p of products) {
    const inStock = availableStock(p.id) > 0;

    // ⭐ rating data
    const r = getAvgRating(p.id);
    const avgTxt = r.avg ? r.avg.toFixed(1).replace(".", ",") : "0,0";

    const card = document.createElement("article");
    card.className = "card" + (inStock ? "" : " is-out");

    // ✅ TOUJOURS ouvrable
    card.dataset.pdpOpen = p.id;

    const img = p.image
      ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" loading="lazy" />`
      : "";

    card.innerHTML = `
      <div class="productMedia">
        ${img}
        <div class="productMedia__overlay"></div>
      </div>

      <div class="productBody">
        <h3>${escapeHTML(p.name)}</h3>

        <div class="productRating">
          ${starsHTML(r.avg)}
          <span class="tiny muted">${avgTxt} · (${r.count})</span>
        </div>

        <div class="productFooter">
          <span class="price">${formatEUR(p.price)}</span>
        </div>
      </div>
    `;

    els.grid.appendChild(card);
  }
}

/* ==========
  PDP modal
========== */

function openPdp(productId) {
  const p = getProduct(productId);
  if (!p || !els.pdpModal) return;

  const left = availableStock(productId);

  // Rupture : afficher switch "me prévenir", désactiver add
  if (els.pdpAddToCart) els.pdpAddToCart.disabled = !(left > 0);

  if (els.pdpNotifyRow) {
    const out = !(left > 0);
    els.pdpNotifyRow.style.display = out ? "" : "none";
  }

  if (els.pdpNotifyToggle) {
    els.pdpNotifyToggle.checked = isNotified(p.id);
  }

  currentPdpId = productId;


if (els.pdpNotifyRow) {
  const out = !(p.stock > 0);
  els.pdpNotifyRow.style.display = out ? "" : "none";
}

if (els.pdpNotifyToggle) {
  const savedEmail = getNotifiedEmail(p.id);
  els.pdpNotifyToggle.checked = !!savedEmail;

  // synchro input email
  if (els.pdpNotifyEmail) {
    els.pdpNotifyEmail.value = savedEmail || "";
    els.pdpNotifyEmail.readOnly = !!savedEmail; // ✅ lock quand ON
    els.pdpNotifyEmail.dataset.saved = savedEmail || "";
  }
}


  if (els.pdpTitle) els.pdpTitle.textContent = p.name;
  if (els.pdpPrice) els.pdpPrice.textContent = formatEUR(p.price);
  if (els.pdpDescription) els.pdpDescription.textContent = p.description || "";
  if (els.pdpStock) els.pdpStock.textContent = left > 0 ? `${left} en stock` : "Rupture";

  if (els.pdpImg) {
    els.pdpImg.src = p.image || "";
    els.pdpImg.alt = p.name;
  }

  // avis visibles direct
  const r = getAvgRating(p.id);
  const avgTxt = r.avg ? r.avg.toFixed(1).replace(".", ",") : "0,0";
  if (els.pdpStars) els.pdpStars.innerHTML = starsHTML(r.avg);
  if (els.pdpRatingMeta) els.pdpRatingMeta.textContent = `${avgTxt} · ${r.count} avis`;

  if (els.pdpAddToCart) els.pdpAddToCart.disabled = !(left > 0);
  if (els.pdpMsg) els.pdpMsg.textContent = "";

  els.pdpModal.classList.add("open");
  els.pdpModal.setAttribute("aria-hidden", "false");
}

function closePdp() {
  if (!els.pdpModal) return;
  els.pdpModal.classList.remove("open");
  els.pdpModal.setAttribute("aria-hidden", "true");
  currentPdpId = null;
  if (els.pdpMsg) els.pdpMsg.textContent = "";
}

/* ==========
  Cart logic (singles) — FIX stock temps réel
========== */

function addToCart(productId, qty = 1) {
  const p = getProduct(productId);
  if (!p) return;

  const left = availableStock(productId);
  if (qty > left) {
    toast(`Stock insuffisant pour “${p.name}”`);
    return;
  }

  const current = cart.skus[productId] || 0;
  const next = clampQty(current + qty);

  cart.skus[productId] = next;
  saveCart(cart);

  if (els.cartBtn) {
    els.cartBtn.classList.remove("bump");
    void els.cartBtn.offsetWidth;
    els.cartBtn.classList.add("bump");
  }

  const btn = document.querySelector(`[data-add="${productId}"]`);
  const card = btn?.closest(".card");
  if (card) {
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
  }

  renderCartBadge();
  renderCart();
  renderProducts(); // refresh grisage live
}

function setCartQty(productId, qty) {
  const p = getProduct(productId);
  if (!p) return;

  const q = clampQty(qty);

  if (q === 0) {
    delete cart.skus[productId];
  } else {
    // max autorisé = stock total - (packs + autres réservations)
    const reservedWithoutThis = reservedTotal(productId) - Number(cart.skus[productId] || 0);
    const maxAllowed = Math.max(0, Number(p.stock || 0) - reservedWithoutThis);

    if (q > maxAllowed) {
      toast(`Stock insuffisant pour “${p.name}”`);
      return;
    }
    cart.skus[productId] = q;
  }

  saveCart(cart);
  renderCartBadge();
  renderCart();
  renderProducts(); // refresh grisage live
}

function clearCart() {
  cart = { skus: {}, packs: [], giftcards: [] };
  saveCart(cart);
  renderCartBadge();
  renderCart();
  renderProducts();
}

/* ==========
  Drawer open/close
========== */

function openCart() {
  if (!els.cartDrawer) return;
  els.cartDrawer.classList.add("open");
  els.cartDrawer.setAttribute("aria-hidden", "false");
  if (els.checkoutMsg) els.checkoutMsg.textContent = "";
}

function closeCart() {
  if (!els.cartDrawer) return;
  els.cartDrawer.classList.remove("open");
  els.cartDrawer.setAttribute("aria-hidden", "true");
}

/* ==========
  Totals
========== */

function computeTotals() {
  let subtotal = 0;
  let discount = 0;
  const hintParts = [];

  // Singles
  for (const [id, qty] of Object.entries(cart.skus)) {
    const p = getProduct(id);
    if (!p) continue;

    subtotal += p.price * qty;

    const free = computeFreeUnitsSingles(qty);
    const saved = free * p.price;
    discount += saved;

    if (free > 0) hintParts.push(`${free} offerte(s) sur “${p.name}”`);
  }

  // Packs
  for (const pack of (cart.packs || [])) {
    subtotal += pack.value || 0;
    discount += pack.free || 0;
    hintParts.push(`${pack.name} (offert ${formatEUR(pack.free || 0)})`);
  }

  // Gift Cards (no promo)
  for (const gc of (cart.giftcards || [])) {
    subtotal += Number(gc.amount || 0);
    hintParts.push(`Carte cadeau ${formatEUR(gc.amount || 0)}`);
  }

  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total, hint: hintParts.join(" · ") };
}

/* ==========
  Render cart
========== */

function renderCartBadge() {
  if (!els.cartCount) return;
  els.cartCount.textContent = totalCartCount();
}

function formatDateFR(yyyyMmDd) {
  if (!yyyyMmDd) return "—";
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function renderCart() {
  if (!els.cartItems) return;

  els.cartItems.innerHTML = "";

  const skuEntries = Object.entries(cart.skus);
  const packEntries = cart.packs || [];
  const giftEntries = cart.giftcards || [];
  const empty = skuEntries.length === 0 && packEntries.length === 0 && giftEntries.length === 0;

  if (empty) {
    els.cartItems.innerHTML = `<p class="muted">Votre panier est vide.</p>`;
  } else {
    // Singles
    for (const [id, qty] of skuEntries) {
      const p = getProduct(id);
      if (!p) continue;

      const free = computeFreeUnitsSingles(qty);
      const payable = qty - free;

      const item = document.createElement("div");
      item.className = "cartItem";
      item.innerHTML = `
        <div>
          <h4>${escapeHTML(p.name)}</h4>
          <p>${qty} unité(s) · ${free} offerte(s) → ${payable} payée(s)</p>
          <p>${formatEUR(p.price)} / unité</p>
        </div>
        <div class="qty" aria-label="Quantité">
          <button data-dec="${id}" aria-label="Diminuer">−</button>
          <span>${qty}</span>
          <button data-inc="${id}" aria-label="Augmenter">+</button>
        </div>
      `;
      els.cartItems.appendChild(item);
    }

    // Packs
    for (const pack of packEntries) {
      const lines = (pack.items || [])
        .map(it => {
          const p = getProduct(it.id);
          return `${p?.name || it.id} ×${it.qty}`;
        })
        .join(" · ");

      const item = document.createElement("div");
      item.className = "cartItem";
      item.innerHTML = `
        <div>
          <h4>${escapeHTML(pack.name || "Pack")}</h4>
          <p>${escapeHTML(lines || "")}</p>
          <p>Valeur ${formatEUR(pack.value || 0)} · Offert ${formatEUR(pack.free || 0)}</p>
        </div>
        <div class="qty">
          <button data-pack-remove="${escapeHTML(pack.id)}" aria-label="Supprimer">🗑️</button>
        </div>
      `;
      els.cartItems.appendChild(item);
    }

    // Gift Cards
    for (const gc of giftEntries) {
      const parts = [
        `Receveur : ${gc.receiver || ""}`,
        `Date d’envoi : ${gc.sendDate ? formatDateFR(gc.sendDate) : "—"}`,
        gc.fromName ? `De : ${gc.fromName}` : null,
        gc.message ? `Message : ${gc.message}` : null,
      ].filter(Boolean);

      const item = document.createElement("div");
      item.className = "cartItem";
      item.innerHTML = `
        <div>
          <h4>Carte cadeau — ${formatEUR(gc.amount || 0)}</h4>
          <p>${escapeHTML(parts.join(" · "))}</p>
          <p>Couleur : ${escapeHTML(gc.color || "violet")}</p>
        </div>
        <div class="qty">
          <button data-gc-remove="${escapeHTML(gc.id)}" aria-label="Supprimer">🗑️</button>
        </div>
      `;
      els.cartItems.appendChild(item);
    }
  }

  const t = computeTotals();
  if (els.subtotal) els.subtotal.textContent = formatEUR(t.subtotal);
  if (els.discount) els.discount.textContent = `- ${formatEUR(t.discount)}`;
  if (els.total) els.total.textContent = formatEUR(t.total);
  if (els.discountHint) els.discountHint.textContent = t.hint ? `Promos : ${t.hint}` : "Aucune promo appliquée.";
}

/* ==========
  Pack Builder
========== */

function packItemsArray() {
  return Object.entries(packSelection)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty }));
}

function renderPackPicker() {
  if (!els.packPickGrid) return;

  els.packPickGrid.innerHTML = "";
  const size = currentPackSize();
  const units = Object.values(packSelection).reduce((a, b) => a + b, 0);

  for (const p of products) {
    const qty = packSelection[p.id] || 0;

    const leftForWizard = availableStockForPackBuilder(p.id);
    const isOut = leftForWizard <= 0;

    // ✅ Avis (étoiles + moyenne + nb)
    const rr = getAvgRating(p.id);
    const avgTxt = rr.avg ? rr.avg.toFixed(1).replace(".", ",") : "0,0";

    const card = document.createElement("div");
    card.className = "packPick" + (isOut ? " is-out" : "");

    const img = p.image
      ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" loading="lazy" />`
      : "";

    card.innerHTML = `
      <div class="packPick__media">${img}</div>
      <div class="packPick__body">
        <div class="packPick__title">
          <div>
            <h4>${escapeHTML(p.name)}</h4>

            <!-- ✅ Stock supprimé, remplacé par avis -->
            <p class="packPickMeta">
              ${formatEUR(p.price)}
              <span class="dot">•</span>
              <span class="packPickReviews">
                ${starsHTML(rr.avg)}
                <span class="tiny muted">${avgTxt} · (${rr.count})</span>
              </span>
            </p>
          </div>

          ${qty > 0 ? `<span class="badge">${qty}x</span>` : ``}
        </div>

        <div class="packPick__actions">
          <div class="counter">
            <button data-pack-dec="${p.id}" aria-label="Diminuer">−</button>
            <span>${qty}</span>
            <button data-pack-inc="${p.id}" aria-label="Augmenter">+</button>
          </div>
        </div>
      </div>
    `;

    const btnInc = card.querySelector(`[data-pack-inc="${p.id}"]`);
    const btnDec = card.querySelector(`[data-pack-dec="${p.id}"]`);

    const packFull = units >= size;
    if (btnInc) btnInc.disabled = isOut || packFull;
    if (btnDec) btnDec.disabled = qty <= 0;

    els.packPickGrid.appendChild(card);
  }

  renderPackPreview();
}


function renderPackPreview() {
  if (!els.packPreviewLines) return;

  const size = currentPackSize();
  const items = packItemsArray();
  const units = sumPackUnits(items);

  if (els.packProgress) els.packProgress.textContent = `${units} / ${size}`;

  if (units === 0) {
    els.packPreviewLines.innerHTML = `<p class="muted">Sélectionne des bougies pour composer ton pack.</p>`;
  } else {
    els.packPreviewLines.innerHTML = items
      .map(it => {
        const p = getProduct(it.id);
        const linePrice = p ? p.price * it.qty : 0;
        return `
          <div class="packLine">
            <span>${escapeHTML(p?.name || it.id)} <strong>×${it.qty}</strong></span>
            <span>${formatEUR(linePrice)}</span>
          </div>
        `;
      })
      .join("");
  }

  // LIVE totals même si pack incomplet
  let liveValue = 0;
  for (const it of items) {
    const p = getProduct(it.id);
    if (!p) continue;
    liveValue += p.price * it.qty;
  }

  const isComplete = units === size;
  const totals = isComplete
    ? computePackTotals(items, size, products)
    : { value: liveValue, free: 0, total: liveValue };

  if (els.packValue) els.packValue.textContent = formatEUR(totals.value);
  if (els.packFree) els.packFree.textContent = `- ${formatEUR(totals.free)}`;
  if (els.packTotal) els.packTotal.textContent = formatEUR(totals.total);

  if (els.addPackBtn) els.addPackBtn.disabled = !isComplete;

  if (els.packHint) {
    if (!isComplete) {
      const remaining = Math.max(0, size - units);
      els.packHint.textContent = remaining === 0
        ? ""
        : `Ajoute encore ${remaining} bougie(s) pour compléter le pack. (Prix en cours: ${formatEUR(liveValue)})`;
    } else {
      els.packHint.textContent = size === 3
        ? "Offert : la bougie la moins chère du pack."
        : "Offert : les 2 bougies les moins chères du pack.";
    }
  }
}

async function addPackToCart() {
  const size = currentPackSize();
  const items = packItemsArray();
  const units = sumPackUnits(items);

  if (units !== size) return;

  // ✅ Vérif stock restant réel (en tenant compte du panier)
  for (const it of items) {
    const p = getProduct(it.id);
    if (!p) return;

    const left = availableStock(it.id);
    if (it.qty > left) {
      if (els.packMsg) els.packMsg.textContent = `Stock insuffisant pour “${p.name}”.`;
      setTimeout(() => { if (els.packMsg) els.packMsg.textContent = ""; }, 2000);
      return;
    }
  }

  const totals = computePackTotals(items, size, products);

  const packId = `pack_${Date.now()}`;
  const packName = size === 3 ? "Pack 3 (1 offerte)" : "Pack 5 (2 offertes)";

  cart.packs.push({
    id: packId,
    name: packName,
    items,
    value: Math.round((totals.value || 0) * 100) / 100,
    free: Math.round((totals.free || 0) * 100) / 100,
    total: Math.round((totals.total || 0) * 100) / 100
  });

  // ✅ IMPORTANT: on NE décrémente PAS p.stock ici (sinon double réserve)
  saveCart(cart);

  // sync from backend (best-effort)
  try {
    await ensureSessionId();
    const [srvProducts, srvSummary, srvCart] = await Promise.all([
      apiLoadProducts(),
      apiLoadReviewSummary(),
      apiLoadCart()
    ]);
    if (srvProducts && srvProducts.length) {
      products = srvProducts;
      saveProducts(products);
    }
    reviewSummary = srvSummary || {};
    if (srvCart) {
      cart = srvCart;
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }
  } catch (_) {}

  renderProducts();
  renderCartBadge();
  renderCart();

  packSelection = {};
  renderPackPicker();

  if (els.packMsg) {
    els.packMsg.textContent = "Pack ajouté au panier ✅";
    setTimeout(() => (els.packMsg.textContent = ""), 2200);
  }

  if (els.cartBtn) {
    els.cartBtn.classList.remove("bump");
    void els.cartBtn.offsetWidth;
    els.cartBtn.classList.add("bump");
  }
}

/* ==========
  Gift Card
========== */

function gcSetMsg(text) {
  if (!els.gcMsg) return;
  els.gcMsg.textContent = text;
  clearTimeout(gcSetMsg._t);
  gcSetMsg._t = setTimeout(() => (els.gcMsg.textContent = ""), 2600);
}

function getGiftCardAmount() {
  const v = (els.gcAmount?.value || "50").trim();
  if (v === "custom") {
    const n = Number(els.gcCustomAmount?.value || 0);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function updateCustomAmountUI() {
  const isCustom = (els.gcAmount?.value || "") === "custom";
  if (els.gcCustomWrap) els.gcCustomWrap.style.display = isCustom ? "" : "none";
  if (!isCustom && els.gcCustomAmount) els.gcCustomAmount.value = "";
}

function renderGiftCardPreview() {
  if (!els.gcPreview) return;

  updateCustomAmountUI();
  const amount = getGiftCardAmount() || 50;

  const color = (els.gcColor?.value || "violet").trim();
  els.gcPreview.dataset.color = color;

  const receiver = (els.gcReceiverEmail?.value || "receveur@email.com").trim();
  const sendDate = formatDateFR(els.gcSendDate?.value || "");
  const fromName = (els.gcFromName?.value || "").trim();
  const msgRaw = (els.gcMessage?.value || "").trim();

  const msg = msgRaw
    ? (fromName ? `De ${fromName} — ${msgRaw}` : msgRaw)
    : "Un petit mot… (optionnel)";

  if (els.gcPreviewAmount) els.gcPreviewAmount.textContent = `${Math.round(amount)} €`;
  if (els.gcPreviewReceiver) els.gcPreviewReceiver.textContent = receiver || "receveur@email.com";
  if (els.gcPreviewDate) els.gcPreviewDate.textContent = sendDate;
  if (els.gcPreviewMsg) els.gcPreviewMsg.textContent = msg;
}

function addGiftCardToCart() {
  updateCustomAmountUI();
  const amount = getGiftCardAmount();

  const color = (els.gcColor?.value || "violet").trim();
  const receiver = (els.gcReceiverEmail?.value || "").trim().toLowerCase();
  const sendDateRaw = (els.gcSendDate?.value || "").trim();
  const fromName = (els.gcFromName?.value || "").trim();
  const message = (els.gcMessage?.value || "").trim();

  if (!amount || amount <= 0) return gcSetMsg("Montant invalide.");
  if (!receiver || !receiver.includes("@")) return gcSetMsg("Email du receveur invalide.");

  const item = {
    id: `gc_${Date.now()}`,
    amount: Math.round(amount * 100) / 100,
    color,
    receiver,
    sendDate: sendDateRaw || "",
    fromName,
    message
  };

  if (!Array.isArray(cart.giftcards)) cart.giftcards = [];
  cart.giftcards.push(item);

  saveCart(cart);
  renderCartBadge();
  renderCart();

  if (els.cartBtn) {
    els.cartBtn.classList.remove("bump");
    void els.cartBtn.offsetWidth;
    els.cartBtn.classList.add("bump");
  }

  gcSetMsg("Carte cadeau ajoutée au panier ✅");
}

function resetGiftCardForm() {
  if (els.gcAmount) els.gcAmount.value = "50";
  if (els.gcColor) els.gcColor.value = "violet";
  if (els.gcReceiverEmail) els.gcReceiverEmail.value = "";
  if (els.gcSendDate) els.gcSendDate.value = "";
  if (els.gcFromName) els.gcFromName.value = "";
  if (els.gcMessage) els.gcMessage.value = "";
  if (els.gcCustomAmount) els.gcCustomAmount.value = "";
  updateCustomAmountUI();
  renderGiftCardPreview();
  gcSetMsg("Réinitialisé.");
}

/* ==========
  Reviews modal
========== */

async function openReviewsView(productId) {
  const p = getProduct(productId);
  if (!p || !els.reviewsViewModal) return;

  currentReviewProductId = productId;

  const { avg, count } = getAvgRating(productId);
  if (els.reviewsAvgStars) els.reviewsAvgStars.innerHTML = starsHTML(avg);
  if (els.reviewsAvgText) els.reviewsAvgText.textContent = (avg || 0).toFixed(1).replace(".", ",");
  if (els.reviewsCount) els.reviewsCount.textContent = String(count);

  try {
    const srv = await apiLoadReviews(productId);
    reviewsMap[productId] = (srv || []).map(r => ({
  id: r.id, // ✅ essentiel pour delete
  name: r.name,
  rating: r.rating,
  text: r.text || "",
  ts: r.created_at ? Date.parse(r.created_at) : Date.now()
}));


    reviewSummary = await apiLoadReviewSummary();
    saveReviewsMap(reviewsMap);
  } catch (_) {}

  renderReviewsList(productId);

  els.reviewsViewModal.classList.add("open");
  els.reviewsViewModal.setAttribute("aria-hidden", "false");
}

function closeReviewsView() {
  if (!els.reviewsViewModal) return;
  els.reviewsViewModal.classList.remove("open");
  els.reviewsViewModal.setAttribute("aria-hidden", "true");
}

function openReviewsForm(productId) {
  const p = getProduct(productId);
  if (!p || !els.reviewsFormModal) return;

  currentReviewProductId = productId;

  // init étoiles input
  if (els.reviewRatingInput) {
  els.reviewRatingInput.value = "0";
  renderReviewStarsUI(0);

}


  if (els.reviewMsg) els.reviewMsg.textContent = "";

  els.reviewsFormModal.classList.add("open");
  els.reviewsFormModal.setAttribute("aria-hidden", "false");
}

function closeReviewsForm() {
  if (!els.reviewsFormModal) return;
  els.reviewsFormModal.classList.remove("open");
  els.reviewsFormModal.setAttribute("aria-hidden", "true");
  if (els.reviewMsg) els.reviewMsg.textContent = "";
}


function renderReviewsList(productId) {
  if (!els.reviewsList) return;
  const list = getReviews(productId);

  if (list.length === 0) {
    els.reviewsList.innerHTML = `<p class="muted">Aucun avis pour le moment. Soyez le premier ⭐</p>`;
    return;
  }

  els.reviewsList.innerHTML = list.map(r => {
    const date = new Date(r.ts || Date.now()).toLocaleDateString("fr-FR");
    return `
      <div class="reviewItem">
        <div class="reviewItem__top">
          <strong>${escapeHTML(r.name || "Client")}</strong>
          ${starsHTML(Number(r.rating) || 0)}
        </div>
        <p class="tiny muted" style="margin:6px 0 0;">${date}</p>
        ${r.text ? `<p style="margin:10px 0 0;">${escapeHTML(r.text)}</p>` : ""}
      </div>
    `;
  }).join("");
}

/* ==========
  Admin (front-only)
========== */

function msg(el, text) {
  if (!el) return;
  el.textContent = text;
  clearTimeout(msg._t);
  msg._t = setTimeout(() => (el.textContent = ""), 2800);
}

function renderAdminSelect() {
  if (!els.adminSelect) return;
  els.adminSelect.innerHTML = "";

  for (const p of products) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    els.adminSelect.appendChild(opt);
  }
}

function loadAdminFields(productId) {
  const p = getProduct(productId);
  if (!p) return;
  if (els.adminName) els.adminName.value = p.name;
  if (els.adminPrice) els.adminPrice.value = p.price;
  if (els.adminStock) els.adminStock.value = p.stock;
  if (els.adminImage) els.adminImage.value = p.image || "";
  if (els.adminDescription) els.adminDescription.value = p.description ?? p.description ?? "";

}

async function saveAdminFields(productId) {
  console.log("🟢 saveAdminFields CALLED", productId);

  const nextName = (els.adminName?.value || "").trim();
  const nextPrice = Number(els.adminPrice?.value);
  const nextStock = Number(els.adminStock?.value);
  const nextDescription = (els.adminDescription?.value || "").trim(); // ✅ FIX ICI

  console.log("🟡 ADMIN FORM VALUES", { nextName, nextPrice, nextStock, nextDescription });

  if (!nextName) return msg(els.adminSaveMsg, "Nom invalide.");
  if (!Number.isFinite(nextPrice) || nextPrice < 0) return msg(els.adminSaveMsg, "Prix invalide.");
  if (!Number.isFinite(nextStock) || nextStock < 0) return msg(els.adminSaveMsg, "Stock invalide.");

  const adminKey = getAdminKey();
  if (!adminKey) return msg(els.adminSaveMsg, "❌ Clé admin manquante (reconnecte-toi).");

  msg(els.adminSaveMsg, "Sauvegarde en base...");

  const payload = {
    name: nextName,
    price: Math.round(nextPrice * 100) / 100,
    stock: Math.floor(nextStock),
    description: nextDescription,
  };

  console.log("🔵 PAYLOAD SENT TO API", payload);

  try {
    const result = await apiFetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      headers: { "x-admin-key": adminKey },
      body: JSON.stringify(payload),
    });

    console.log("🟣 API RESULT", result);

    products = await apiLoadProducts();
    saveProducts(products);

    renderProducts();
    renderCart();
    renderAdminSelect();
    if (els.adminSelect) els.adminSelect.value = productId;
    loadAdminFields(productId);

    msg(els.adminSaveMsg, "Sauvegardé en DB ✅");
  } catch (err) {
    console.error("🔴 SAVE ERROR", err);
    msg(els.adminSaveMsg, `❌ ${err?.message || "Erreur sauvegarde"}`);
  }
}



/* ==========
  Newsletter (demo)
========== */

function saveNewsletterEmail(email) {
  const raw = localStorage.getItem(NEWS_KEY);
  const list = raw ? safeJSON(raw, []) : [];
  if (!list.includes(email)) list.push(email);
  localStorage.setItem(NEWS_KEY, JSON.stringify(list));
}

/* ==========
  Global click handler
========== */

document.addEventListener("click", async (e) => {

  // Open PDP when clicking a product card (but not when clicking buttons inside)
  const openId = e.target?.closest?.("[data-pdp-open]")?.dataset?.pdpOpen;
  if (openId) {
    const card = e.target?.closest?.(".card");
    if (card) {
      card.classList.remove("flash");
      void card.offsetWidth;
      card.classList.add("flash");
    }
    openPdp(openId);
    return;
  }

  const openOrderId = e.target?.closest?.("[data-admin-order-open]")?.dataset?.adminOrderOpen;
if (openOrderId) {
  const order = await apiAdminLoadOrderDetail(openOrderId);
  renderOrderDetail(order);
  return;
}

if (e.target?.closest?.("[data-admin-order-close]")) {
  renderOrderDetail(null);
  return;
}


  // Gift Card: palette couleurs (swatches)
  const sw = e.target?.closest?.(".colorSwatches .swatch");
  if (sw && sw.dataset.gcColor) {
    const color = sw.dataset.gcColor;

    if (els.gcColor) els.gcColor.value = color;

    document.querySelectorAll(".colorSwatches .swatch").forEach(b => {
      const isOn = b === sw;
      b.classList.toggle("is-selected", isOn);
      b.setAttribute("aria-checked", isOn ? "true" : "false");
    });

    renderGiftCardPreview();
    return;
  }

// Reviews: close VIEW modal
if (e.target?.closest?.("[data-reviews-view-close]")) {
  closeReviewsView();
  return;
}

// Reviews: close FORM modal
if (e.target?.closest?.("[data-reviews-form-close]")) {
  closeReviewsForm();
  return;
}


  // Reviews: clickable stars in modal
  const sp = e.target?.closest?.("[data-star-pick]")?.dataset?.starPick;
  if (sp) { setReviewRating(Number(sp)); return; }

 const delBtn = e.target?.closest?.("[data-admin-review-del-id]");
if (delBtn) {
  const reviewId = delBtn.dataset.adminReviewDelId;
  const productId = els.adminSelect?.value;

  if (!reviewId || !productId) return;

  try {
    await apiAdminDeleteReview(reviewId);   // ✅ DB delete
    await renderAdminReviews(productId);    // ✅ refresh list + summary
    adminReviewsToast("Avis supprimé ✅");
    renderProducts(); // refresh étoiles boutique
    if (currentPdpId === productId) openPdp(productId); // refresh pdp si ouverte
  } catch (err) {
    adminReviewsToast("❌ " + (err?.message || "Erreur suppression avis"));
  }
  return;
}


  // Pack type select (Step 1)
  const pt = e.target?.closest?.(".packTypeCard")?.dataset?.packtype;
  if (pt) { selectPackType(pt); return; }

  // Add single (si tu l’utilises encore quelque part)
  const addId = e.target?.dataset?.add;
  if (addId) { addToCart(addId, 1); return; }

  // Single qty
  const incId = e.target?.dataset?.inc;
  if (incId) { setCartQty(incId, (cart.skus[incId] || 0) + 1); return; }

  const decId = e.target?.dataset?.dec;
  if (decId) { setCartQty(decId, (cart.skus[decId] || 0) - 1); return; }

  // Remove pack — FIX: pas de restore stock (on ne décrémente plus le stock produit)
  const rmPack = e.target?.dataset?.packRemove;
  if (rmPack) {
    cart.packs = (cart.packs || []).filter(p => p.id !== rmPack);
    saveCart(cart);
    renderCartBadge();
    renderCart();
    renderProducts(); // refresh grisage
    return;
  }

  // Remove gift card
  const rmGc = e.target?.dataset?.gcRemove;
  if (rmGc) {
    cart.giftcards = (cart.giftcards || []).filter(x => x.id !== rmGc);
    saveCart(cart);
    renderCartBadge();
    renderCart();
    return;
  }

  // Pack Builder controls (Step 2) — FIX stock temps réel
  const inc = e.target?.dataset?.packInc;
  const dec = e.target?.dataset?.packDec;
  const id = inc || dec;

  if (id) {
    const size = currentPackSize();
    const units = Object.values(packSelection).reduce((a, b) => a + b, 0);
    const current = packSelection[id] || 0;
    const p = getProduct(id);
    if (!p) return;

    if (inc) {
      if (units >= size) return;

      const left = availableStockForPackBuilder(id);
      if (left <= 0) {
        if (els.packMsg) els.packMsg.textContent = "Stock insuffisant pour cette bougie.";
        setTimeout(() => { if (els.packMsg) els.packMsg.textContent = ""; }, 2000);
        return;
      }

      packSelection[id] = current + 1;



    } else if (dec) {
      const next = Math.max(0, current - 1);
      if (next === 0) delete packSelection[id];
      else packSelection[id] = next;
    }

    renderPackPicker();
  }
});

/* ==========
  Bindings
========== */

// Voir les avis (clic sur "x avis")
els.pdpRatingMeta?.addEventListener("click", () => {
  if (!currentPdpId) return;
  openReviewsView(currentPdpId);
});

els.pdpRatingMeta?.addEventListener("keydown", (e) => {
  if (!currentPdpId) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openReviewsView(currentPdpId);
  }
});

// Laisser un avis
els.pdpReviewBtn?.addEventListener("click", () => {
  if (!currentPdpId) return;
  openReviewsForm(currentPdpId);
});



els.pdpNotifyToggle?.addEventListener("change", async () => {
  if (!currentPdpId) return;

  const on = !!els.pdpNotifyToggle.checked;
  const email = (els.pdpNotifyEmail?.value || "").trim().toLowerCase();

  // ON => email obligatoire
  if (on) {
    if (!isValidEmail(email)) {
      els.pdpNotifyToggle.checked = false;
      if (els.pdpMsg) els.pdpMsg.textContent = "Entre un email valide pour activer l’alerte.";
      return;
    }

    try {
      if (els.pdpMsg) els.pdpMsg.textContent = "Activation...";
      await apiNotifySubscribe(currentPdpId, email);

      if (els.pdpNotifyEmail) els.pdpNotifyEmail.readOnly = true;
      if (els.pdpMsg) els.pdpMsg.textContent = "✅ Alerte activée. On te prévient quand ça revient.";
    } catch (e) {
      els.pdpNotifyToggle.checked = false;
      if (els.pdpMsg) els.pdpMsg.textContent = `❌ ${e?.message || "Erreur activation"}`;
    }

    return;
  }

  // OFF => delete en DB
  try {
    if (els.pdpMsg) els.pdpMsg.textContent = "Désactivation...";
    await apiNotifyUnsubscribe(currentPdpId, email);

    if (els.pdpNotifyEmail) els.pdpNotifyEmail.readOnly = false;
    if (els.pdpMsg) els.pdpMsg.textContent = "Alerte désactivée ✅";
  } catch (e) {
    // si ça fail, on remet ON pour cohérence UI
    els.pdpNotifyToggle.checked = true;
    if (els.pdpMsg) els.pdpMsg.textContent = `❌ ${e?.message || "Erreur désactivation"}`;
  }
});


els.pdpNotifyEmail?.addEventListener("input", () => {
  if (!currentPdpId) return;
  const saved = getNotifiedEmail(currentPdpId);
  if (!saved) return; // OFF => editable normal

  // ON => on bloque toute tentative de changement
  els.pdpNotifyEmail.value = saved;
  if (els.pdpMsg) els.pdpMsg.textContent = "Vous avez déjà indiqué votre adresse mail.";
  uiToast?.("Email déjà enregistré ✅");
});


// PDP close
els.pdpClose?.addEventListener("click", closePdp);
els.pdpOverlay?.addEventListener("click", closePdp);

// PDP add to cart
els.pdpAddToCart?.addEventListener("click", () => {
  if (!currentPdpId) return;

  addToCart(currentPdpId, 1);

  bumpCartIcon();
  uiToast("Ajouté au panier ✅");

  if (els.pdpMsg) {
    els.pdpMsg.textContent = "Ajouté au panier ✅";
    setTimeout(() => (els.pdpMsg.textContent = ""), 1200);
  }

  closePdp();
});


els.pdpStars?.addEventListener("click", () => {
  if (!currentPdpId) return;
  openReviewsView(currentPdpId);
});


// ⭐ Rating stars — un seul handler (mobile safe)
function onStarPick(e) {
  const btn = e.target?.closest?.("[data-star-pick]");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const value = Number(btn.dataset.starPick || 0);
  if (!value) return;

  setReviewRating(value);
}

// Sur iPhone, pointerdown/touchstart est plus fiable que click
els.reviewStars?.addEventListener("pointerdown", onStarPick, { passive: false });
els.reviewStars?.addEventListener("click", onStarPick);


if (els.cartBtn) els.cartBtn.addEventListener("click", openCart);
if (els.cartClose) els.cartClose.addEventListener("click", closeCart);
if (els.cartOverlay) els.cartOverlay.addEventListener("click", closeCart);

if (els.clearCartBtn) {
  els.clearCartBtn.addEventListener("click", () => {
    clearCart();
    toast("Panier vidé.");
  });
}

if (els.checkoutBtn) {
  els.checkoutBtn.addEventListener("click", () => {
    if (totalCartCount() === 0) {
      toast("Ajoute au moins une bougie 🙂");
      return;
    }
    // ✅ on va sur checkout
    window.location.href = "checkout.html";
  });
}


/* =========================
   HAMBURGER MENU (FIX)
========================= */

function setMenuOpen(open) {
  if (!els.nav || !els.hamburger) return;

  // on met les 2 classes pour être compatible avec ton CSS
  els.nav.classList.toggle("open", open);
  els.nav.classList.toggle("is-open", open);

  els.hamburger.classList.toggle("is-open", open);
  els.hamburger.setAttribute("aria-expanded", String(open));
}

els.hamburger?.addEventListener("click", () => {
  const isOpen = els.nav?.classList.contains("open") || els.nav?.classList.contains("is-open");
  setMenuOpen(!isOpen);
});

// ✅ Fermer quand on clique sur un lien du menu
document.querySelectorAll("#nav a").forEach(a => {
  a.addEventListener("click", () => setMenuOpen(false));
});



if (els.newsletterForm) {
  els.newsletterForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = (els.newsletterEmail?.value || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      if (els.newsletterMsg) els.newsletterMsg.textContent = "Email invalide.";
      return;
    }
    saveNewsletterEmail(email);
    if (els.newsletterEmail) els.newsletterEmail.value = "";
    if (els.newsletterMsg) {
      els.newsletterMsg.textContent = "Inscription enregistrée ✅ (démo)";
      setTimeout(() => (els.newsletterMsg.textContent = ""), 2800);
    }
  });
}

// Admin auth
if (els.adminLogin) {
  els.adminLogin.addEventListener("click", async () => {
    const code = (els.adminCode?.value || "").trim();
    if (code !== ADMIN_CODE_DEMO) return;

    localStorage.setItem("candle_shop_admin_key", code);
    
    els.adminAuth?.classList.add("hidden");
    els.adminPanel?.classList.remove("hidden");

    // 🔥 CHARGER LES COMMANDES ADMIN ICI
    await loadAdminOrders();

    if (els.adminSelect?.value) renderAdminReviews(els.adminSelect.value);
  });
}


if (els.adminSelect) {
  els.adminSelect.addEventListener("change", () => {
    loadAdminFields(els.adminSelect.value);
    if (els.adminSaveMsg) els.adminSaveMsg.textContent = "";
    renderAdminReviews(els.adminSelect.value);
  });
}

if (els.adminSave) {
  els.adminSave.addEventListener("click", () => {
    if (!els.adminSelect) return;
    saveAdminFields(els.adminSelect.value);
  });
}

if (els.adminDelete) {
  els.adminDelete.addEventListener("click", async () => {
    if (!els.adminSelect) return;

    const id = els.adminSelect.value;
    if (!id) return;

    if (!confirm(`Supprimer définitivement "${id}" ?`)) return;

    try {
      await apiAdminDeleteProduct(id);

      // si produit dans panier, on le retire (sinon bugs)
      delete cart.skus[id];
      cart.packs = (cart.packs || []).filter(pack => !(pack.items || []).some(it => it.id === id));
      saveCart(cart);

      await refreshProductsFromApi(); // recharge depuis DB

      msg(els.adminSaveMsg, "Produit supprimé ✅");
    } catch (err) {
      msg(els.adminSaveMsg, "❌ " + (err?.message || "Erreur suppression"));
    }
  });
}


if (els.adminReviewsClear) {
  els.adminReviewsClear.addEventListener("click", async () => {
    if (!els.adminSelect) return;
    const pid = els.adminSelect.value;
    if (!pid) return;

    try {
      await apiAdminClearReviews(pid);
      await renderAdminReviews(pid);
      adminReviewsToast("Tous les avis supprimés ✅");
    } catch (err) {
      adminReviewsToast("❌ " + (err?.message || "Erreur suppression"));
    }
  });
}


if (els.adminReset) {
  els.adminReset.addEventListener("click", () => {
    products = structuredClone(DEFAULT_PRODUCTS);
    cart = { skus: {}, packs: [], giftcards: [] };
    packSelection = {};
    chosenPackSize = null;

    saveProducts(products);
    saveCart(cart);

    renderProducts();
    renderCart();
    renderCartBadge();
    renderAdminSelect();

    if (products[0] && els.adminSelect) {
      els.adminSelect.value = products[0].id;
      loadAdminFields(products[0].id);
    }

    document.querySelectorAll(".packTypeCard").forEach(btn => btn.classList.remove("is-selected"));
    updatePackChosenUI();
    showPackStep(1);

    msg(els.adminSaveMsg, "Reset effectué ✅");
  });
}

/* Pack Wizard bindings */
if (els.packGoStep2) {
  els.packGoStep2.addEventListener("click", () => {
    if (!chosenPackSize) return;
    showPackStep(2);
    renderPackPicker();
    els.packStep2?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (els.packBack) {
  els.packBack.addEventListener("click", () => {
    showPackStep(1);
  });
}

if (els.packReset) {
  els.packReset.addEventListener("click", () => {
    packSelection = {};
    if (els.packMsg) els.packMsg.textContent = "";
    renderPackPicker();
  });
}

if (els.addPackBtn) {
  els.addPackBtn.addEventListener("click", addPackToCart);
}

/* Gift Card bindings */
["input", "change"].forEach(evt => {
  els.gcColor?.addEventListener(evt, renderGiftCardPreview);
  els.gcReceiverEmail?.addEventListener(evt, renderGiftCardPreview);
  els.gcSendDate?.addEventListener(evt, renderGiftCardPreview);
  els.gcFromName?.addEventListener(evt, renderGiftCardPreview);
  els.gcMessage?.addEventListener(evt, renderGiftCardPreview);
});

els.gcAmount?.addEventListener("change", () => {
  updateCustomAmountUI();
  renderGiftCardPreview();
  if ((els.gcAmount?.value || "") === "custom") els.gcCustomAmount?.focus();
});

els.gcCustomAmount?.addEventListener("input", renderGiftCardPreview);

if (els.gcAddToCart) els.gcAddToCart.addEventListener("click", addGiftCardToCart);
if (els.gcReset) els.gcReset.addEventListener("click", resetGiftCardForm);

/* Reviews form submit */
if (els.reviewForm) {
  els.reviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentReviewProductId) return;

    const name = (els.reviewName?.value || "").trim();
    const rating = getReviewRating();
    const text = (els.reviewText?.value || "").trim();

    if (!name) { if (els.reviewMsg) els.reviewMsg.textContent = "Nom requis."; return; }
    if (!rating || rating < 1 || rating > 5) { if (els.reviewMsg) els.reviewMsg.textContent = "Note invalide."; return; }

    try {
      await apiAddReview(currentReviewProductId, { name, rating, text });
      const srv = await apiLoadReviews(currentReviewProductId);
      reviewsMap[currentReviewProductId] = (srv || []).map(r => ({
        name: r.name,
        rating: r.rating,
        text: r.text || "",
        ts: r.created_at ? Date.parse(r.created_at) : Date.now()
      }));
      reviewSummary = await apiLoadReviewSummary();
      saveReviewsMap(reviewsMap);
    } catch (_) {
      addReview(currentReviewProductId, { name, rating, text, ts: Date.now() });
    }

    if (els.reviewName) els.reviewName.value = "";
    if (els.reviewText) els.reviewText.value = "";
    setReviewRating(0);

    if (els.reviewMsg) {
      els.reviewMsg.textContent = "Avis publié ✅";
      setTimeout(() => (els.reviewMsg.textContent = ""), 1800);
    }

    renderReviewsList(currentReviewProductId);
    const { avg, count } = getAvgRating(currentReviewProductId);
    if (els.reviewsAvgStars) els.reviewsAvgStars.innerHTML = starsHTML(avg);
    if (els.reviewsAvgText) els.reviewsAvgText.textContent = (avg || 0).toFixed(1).replace(".", ",");
    if (els.reviewsCount) els.reviewsCount.textContent = String(count);

    renderProducts();

    // refresh PDP si elle est ouverte sur ce produit
if (currentPdpId === currentReviewProductId) {
  openPdp(currentPdpId);
}

setTimeout(() => {
  closeReviewsForm();
  uiToast("Merci pour votre avis ⭐");
}, 300);



  });
}

/* ==========
  Admin Reviews (delete)
========== */

function adminReviewsToast(text) {
  if (!els.adminReviewsMsg) return;
  els.adminReviewsMsg.textContent = text;
  clearTimeout(adminReviewsToast._t);
  adminReviewsToast._t = setTimeout(() => (els.adminReviewsMsg.textContent = ""), 2400);
}

async function refreshReviewsFromApi(productId) {
  const srv = await apiLoadReviews(productId);

  reviewsMap[productId] = (srv || []).map(r => ({
    id: r.id,
    name: r.name,
    rating: r.rating,
    text: r.text || "",
    ts: r.created_at ? Date.parse(r.created_at) : Date.now()
  }));

  // summary (avg/count) vient du backend
  reviewSummary = await apiLoadReviewSummary();

  saveReviewsMap(reviewsMap); // optionnel (cache)
}

async function renderAdminReviews(productId) {
  if (!els.adminReviewsList) return;

  // 1) charger depuis DB
  let list = [];
  try {
    list = await apiLoadReviews(productId);
  } catch (e) {
    els.adminReviewsList.innerHTML = `<p class="muted">Erreur chargement avis.</p>`;
    return;
  }

  // 2) stats
  const count = list.length;
  const avg = count ? (list.reduce((a, r) => a + (Number(r.rating) || 0), 0) / count) : 0;

  if (els.adminReviewsCount) els.adminReviewsCount.textContent = String(count);
  if (els.adminReviewsAvg) els.adminReviewsAvg.textContent = (avg || 0).toFixed(1).replace(".", ",");

  if (count === 0) {
    els.adminReviewsList.innerHTML = `<p class="muted">Aucun avis pour ce produit.</p>`;
    return;
  }

  // 3) render
  els.adminReviewsList.innerHTML = list.map((r) => {
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString("fr-FR") : "";
    return `
      <div class="reviewItem" style="margin-bottom:10px;">
        <div class="reviewItem__top">
          <strong>${escapeHTML(r.name || "Client")}</strong>
          ${starsHTML(Number(r.rating) || 0)}
        </div>
        <p class="tiny muted" style="margin:6px 0 0;">${escapeHTML(date)}</p>
        ${r.text ? `<p style="margin:10px 0 0;">${escapeHTML(r.text)}</p>` : ""}
        <div style="margin-top:10px; display:flex; justify-content:flex-end;">
          <button class="btn btn--ghost" type="button"
                  data-admin-review-del-id="${escapeHTML(r.id)}"
                  data-admin-review-pid="${escapeHTML(productId)}">
            🗑️ Supprimer
          </button>
        </div>
      </div>
    `;
  }).join("");
}



async function deleteReview(productId, index) {
  const list = getReviews(productId);
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) return;

  const review = list[idx];
  if (!review?.id) return adminReviewsToast("❌ ID avis introuvable");

  try {
    await apiAdminDeleteReview(review.id);

    // reload depuis DB
    const srv = await apiLoadReviews(productId);
    reviewsMap[productId] = (srv || []).map(r => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      text: r.text || "",
      ts: r.created_at ? Date.parse(r.created_at) : Date.now()
    }));
    reviewSummary = await apiLoadReviewSummary();

    renderProducts();
    renderAdminReviews(productId);
    adminReviewsToast("Avis supprimé ✅");
  } catch (e) {
    adminReviewsToast("❌ " + (e?.message || "Erreur suppression DB"));
  }
}


async function clearAllReviews(productId) {
  try {
    await apiAdminClearReviews(productId);

    reviewsMap[productId] = [];
    reviewSummary = await apiLoadReviewSummary();

    renderProducts();
    renderAdminReviews(productId);
    adminReviewsToast("Tous les avis supprimés ✅");
  } catch (e) {
    adminReviewsToast("❌ " + (e?.message || "Erreur suppression DB"));
  }
}


// ---------- Admin Add Product (modal) ----------

const adminAdd = {
  openBtn: document.getElementById("adminAddOpen"),
  modal: document.getElementById("adminAddModal"),
  form: document.getElementById("adminAddForm"),
  msgTop: document.getElementById("adminAddMsg"),
  msg: document.getElementById("adminAddFormMsg"),

  id: document.getElementById("adminAddId"),
  name: document.getElementById("adminAddName"),
  price: document.getElementById("adminAddPrice"),
  stock: document.getElementById("adminAddStock"),
  image: document.getElementById("adminAddImage"),
  description: document.getElementById("adminAddDescription"),
};

adminAdd.name?.addEventListener("input", () => {
  const name = (adminAdd.name.value || "").trim();
  const base = slugify(name);

  // on regarde les IDs déjà chargés (source = products en mémoire)
  const existing = new Set((products || []).map(p => p.id));

  const unique = makeUniqueId(base, existing);

  if (adminAdd.id) adminAdd.id.value = unique;
});


adminAdd.imgBtn = document.getElementById("adminImgBtn");
adminAdd.imgFile = document.getElementById("adminImgFile");
adminAdd.imgStatus = document.getElementById("adminImgStatus");

adminAdd.imgBtn?.addEventListener("click", () => {
  adminAdd.imgFile?.click();
});

async function uploadProductImage(file) {
  // mini sécurité
  if (!file) throw new Error("Aucun fichier");
  if (!file.type.startsWith("image/")) throw new Error("Fichier invalide");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image trop lourde (max 5MB)");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `products/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

  const { error } = await supa.storage
    .from(SUPABASE_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supa.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) throw new Error("Impossible de générer l’URL");

  return url;
}

adminAdd.imgFile?.addEventListener("change", async () => {
  const file = adminAdd.imgFile.files?.[0];
  if (!file) return;

  try {
    adminAdd.imgStatus.textContent = "Upload...";
    const url = await uploadProductImage(file);

    // URL dans l’input (pour la DB)
    if (adminAdd.image) adminAdd.image.value = url;

    // 👇👇👇 APERÇU IMAGE (C’EST ICI)
    const preview = document.getElementById("adminImgPreview");
    if (preview) {
      preview.src = url;
      preview.style.display = "block";
    }

    adminAdd.imgStatus.textContent = "✅ Image ajoutée";
  } catch (err) {
    adminAdd.imgStatus.textContent = "❌ " + (err?.message || "Erreur upload");
  }
});



function adminAddOpen(){
  if (!adminAdd.modal) return;

  adminAdd.modal.classList.add("open");
  adminAdd.modal.setAttribute("aria-hidden","false");

  const preview = document.getElementById("adminImgPreview");
  if (preview) {
    preview.src = "";
    preview.style.display = "none";
  }

  adminAdd.msg && (adminAdd.msg.textContent = "");
  adminAdd.id?.focus();
}

function adminAddClose(){
  if (!adminAdd.modal) return;
  adminAdd.modal.classList.remove("open");
  adminAdd.modal.setAttribute("aria-hidden","true");
}

adminAdd.openBtn?.addEventListener("click", adminAddOpen);

adminAdd.modal?.addEventListener("click", (e) => {
  if (e.target?.closest?.("[data-admin-add-close]")) adminAddClose();
});

function readAdminKey(){
  // option 1: récup via ton input adminCode existant
  const v = (els.adminCode?.value || "").trim();
  return v || "admin123"; // fallback si tu veux (sinon supprime)
}

async function apiAdminCreateProduct(payload){
  const res = await fetch(`${API_BASE}/api/admin/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": getAdminKey()
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Erreur création produit");
  return data.product;
}

async function refreshProductsFromApi(){
  const res = await fetch(`${API_BASE}/api/products`);
  const data = await res.json().catch(() => ({}));
  products = Array.isArray(data.products) ? data.products : [];
  // refresh UI partout
  renderProducts();
  renderPackPicker();
  renderAdminSelect();
}

adminAdd.form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!adminAdd.msg) return;

  const name = (adminAdd.name?.value || "").trim();
  const base = slugify(name);
  const existing = new Set((products || []).map(p => p.id));
  const id = makeUniqueId(base, existing);
  if (adminAdd.id) adminAdd.id.value = id; // garde cohérence
  const price = Number(adminAdd.price?.value || 0);
  const stock = Number(adminAdd.stock?.value || 0);
  const image = (adminAdd.image?.value || "").trim();
  const description = (adminAdd.description?.value || "").trim();

  if (!id || !name) {
    adminAdd.msg.textContent = "ID et nom requis.";
    return;
  }

  adminAdd.msg.textContent = "Création...";
  try {
    await apiAdminCreateProduct({ id, name, price, stock, image, description });
    adminAdd.msg.textContent = "✅ Produit créé";
    // reset form
    adminAdd.form.reset();
    // reload products + rerender Boutique + Packs + Admin select
    await refreshProductsFromApi();
    // fermer modal
    setTimeout(adminAddClose, 400);
  } catch (err) {
    adminAdd.msg.textContent = "❌ " + (err?.message || "Erreur");
  }
});


/* ==========
  Init
========== */

async function init() {
  // 1) session panier côté backend
  try { await ensureSessionId(); } catch (_) {}

  // 2) charge produits + reviews depuis backend
  try {
    products = await apiLoadProducts();
    reviewSummary = await apiLoadReviewSummary();
    saveProducts(products); // optionnel (cache)
  } catch (e) {
    // fallback si backend down
    products = loadProducts();
  }

  // 3) charge panier depuis backend (si existe)
  try {
    const srvCart = await apiLoadCart();
    if (srvCart) {
      cart = srvCart;
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }
  } catch (_) {}

  renderProducts();
  renderCartBadge();
  renderCart();

  renderAdminSelect();
  if (products[0] && els.adminSelect) {
    els.adminSelect.value = products[0].id;
    loadAdminFields(products[0].id);
  }

  showPackStep(1);
  updatePackChosenUI();
  updateCustomAmountUI();
  renderGiftCardPreview();
}


  if (els.reviewStars) {
    if (els.reviewRatingInput && !els.reviewRatingInput.value) els.reviewRatingInput.value = "0";
    renderReviewStarsUI(getReviewRating() || 5);
  }

init();

