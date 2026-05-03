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

const ENABLE_NOTIFY = false; // ✅ coupe la feature "me prévenir"

const STORAGE_KEY = "candle_shop_products_v2";
const CART_KEY = "candle_shop_cart_v2";
const NEWS_KEY = "candle_shop_newsletter_v1";
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
  { id: "bague-solitaire",  name: "Bague Solitaire",   price: 89.0,  stock: 8,  description: "Diamant rond 0,3 ct, monture or jaune 18k.", image: "assets/vanille.jpg" },
  { id: "collier-perles",   name: "Collier Perles",    price: 125.0, stock: 6,  description: "Perles d'eau douce, fermoir or 14k.", image: "assets/ambre.jpg" },
  { id: "bracelet-jonc",    name: "Bracelet Jonc",     price: 74.0,  stock: 10, description: "Jonc fin or 18k, ultra-élégant.", image: "assets/figue.jpg" },
  { id: "boucles-creoles",  name: "Créoles Dorées",    price: 58.0,  stock: 14, description: "Créoles légères, plaquées or 24k.", image: "assets/coton.jpg" },
  { id: "pendentif-coeur",  name: "Pendentif Cœur",    price: 95.0,  stock: 5,  description: "Cœur serti de zircons, chaîne fine incluse.", image: "assets/santal.jpg" },
];


/* ==========
  Helpers
========== */

function getAdminKey() {
  // ✅ Maintenant, l’admin key = JWT token stocké quand le user a role=admin
  const k = localStorage.getItem("candle_shop_admin_key");
  return (k && k.trim()) ? k.trim() : "";
}


function shortId(id) {
  return String(id || "").slice(0, 8).toUpperCase();
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

  const addr = (order && typeof order.address === "object" && order.address) ? order.address : null;

const addrLine = (addr && (addr.street || addr.city || addr.postal_code || addr.number))
  ? `${addr.number ? addr.number + " " : ""}${addr.street || ""}, ${addr.postal_code || ""} ${addr.city || ""}`.trim()
  : "—";

const deliveryLabel = order.delivery_mode === "shipping" ? "Envoi à domicile" : "Retrait en magasin";
const paymentLabel = order.payment_mode === "cash" ? "Cash" : "Virement";


  els.adminOrderDetail.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
      <h4>Détail commande</h4>
      <button type="button" class="btn btn--ghost" data-admin-order-close>Fermer</button>
    </div>

    <p class="tiny muted" style="margin-top:6px;">
      <strong>#${shortId(order.id)}</strong> · ${escapeHTML(formatDateTimeFR(order.created_at))}
    </p>

    <div style="margin-top:10px;">
      <p><strong>Email:</strong> ${escapeHTML(order.email || "")}</p>
      <p><strong>Téléphone:</strong> ${escapeHTML(order.phone || "—")}</p>
      <p><strong>Livraison:</strong> ${escapeHTML(deliveryLabel)}</p>

      ${
        order.delivery_mode === "shipping"
          ? `<p><strong>Adresse:</strong> ${escapeHTML(addrLine)}</p>`
          : ""
      }
      <p><strong>Paiement:</strong> ${escapeHTML(paymentLabel)}</p>
      <p><strong>Total:</strong> ${formatEUR(Number(order.total || 0))}</p>
    </div>

    <hr style="margin:12px 0; opacity:.2;" />

    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
      <label class="tiny muted" for="adminOrderStatus"><strong>Statut :</strong></label>

      <select id="adminOrderStatus" class="input" style="max-width:260px;">
      <option value="en attente du virement">En attente du virement</option>
        <option value="preparation">En préparation</option>
        <option value="transit">En transit</option>
        <option value="termine">Terminé</option>
    </select>

      <span id="adminOrderStatusMsg" class="tiny muted"></span>
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

    // mémorise l'id courant pour le PATCH status
  window.__ADMIN_CURRENT_ORDER_ID__ = order.id;

  // set la valeur du select
  const sel = document.getElementById('adminOrderStatus');
  if (sel) sel.value = order.status || 'preparation';


  els.adminOrderDetail.classList.remove("hidden");
}


async function loadAdminOrders() {
  if (!els.adminOrdersList) return;

  els.adminOrdersMsg && (els.adminOrdersMsg.textContent = "Chargement...");
  els.adminOrdersList.innerHTML = "";

  try {
    const data = await apiAdminLoadOrders(showFinishedOrders);
    let orders = data.orders || [];


    // ✅ FILTRE ICI (ETAPE 3)
    orders = orders.filter(o => {
      const status = o.status || "preparation";
      return showFinishedOrders
        ? status === "termine"      // mode archive
        : status !== "termine";     // mode normal
    });

    // Badge sur l'onglet
    const badge = document.getElementById("dashCommandesBadge");
    if (badge) {
      if (!showFinishedOrders && orders.length > 0) {
        badge.textContent = String(orders.length);
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    }

    if (!orders.length) {
      els.adminOrdersMsg && (els.adminOrdersMsg.textContent =
        showFinishedOrders ? "Aucune commande terminée." : "Aucune commande."
      );
      return;
    }

    els.adminOrdersMsg && (els.adminOrdersMsg.textContent = `${orders.length} commande(s)`);

    els.adminOrdersList.innerHTML = orders.map(o => `
      <button type="button" class="adminOrderRow" data-admin-order-open="${o.id}">
        <div>
          <strong>#${shortId(o.id)}</strong>
          <div class="tiny muted">${formatDateTimeFR(o.created_at)} · ${o.items_count} article(s)</div>
        </div>
        <div style="text-align:right">
          <strong>${formatEUR(o.total)}</strong>
          <div class="tiny muted">${o.status}</div>
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


async function apiLoadCart() {
  const sid = getSessionId();
  if (!sid) return null;
  const data = await apiFetch(`/api/cart/${sid}`);
  return data?.cart || null;
}

async function apiAdminLoadOrders(includeDone = false) {
  const qs = includeDone ? `?include_done=1` : `?include_done=0`;
  return apiFetch(`/api/admin/orders${qs}`, {
    headers: { 'x-admin-key': getAdminKey() }
  });
}




async function apiAdminLoadOrder(orderId) {
  return apiFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    headers: { 'x-admin-key': getAdminKey() }
  });
}

async function apiAdminUpdateOrderStatus(orderId, status) {
  return apiFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: { 'x-admin-key': getAdminKey() },
    body: JSON.stringify({ status })
  });
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

async function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));

  const sid = getSessionId();
  if (sid) {
    return apiFetch(`/api/cart/${sid}`, {
      method: "PUT",
      body: JSON.stringify({ cart })
    }).catch(() => {});
  }

  return Promise.resolve();
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
  Global state
========== */

let products = loadProducts();
let cart = loadCart();

let packSelection = {};
let chosenPackSize = null;

let currentPdpId = null;

let showFinishedOrders = false;


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
  pdpDescription: document.getElementById("pdpDescription"),
  pdpAddToCart: document.getElementById("pdpAddToCart"),
  pdpMsg: document.getElementById("pdpMsg"),

  pdpNotifyRow: document.getElementById("pdpNotifyRow"),
  pdpNotifyToggle: document.getElementById("pdpNotifyToggle"),

  pdpNotifyEmail: document.getElementById("pdpNotifyEmail"),


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

function uiToast(text, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = text;
  t.className = "toast is-on" + (type ? ` toast--${type}` : "");
  clearTimeout(uiToast._t);
  uiToast._t = setTimeout(() => t.classList.remove("is-on"), 2200);
}

function setFormMsg(el, text, type = "") {
  if (!el) return;
  el.textContent = text;
  el.className = "formMsg" + (type ? ` is-${type}` : "");
  if (type === "success" || type === "error") {
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ""; el.className = "formMsg"; }, 3000);
  }
}

function btnLoading(btn, loading, originalText = "") {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle("btn--loading", loading);
  if (!loading && originalText) btn.textContent = originalText;
}

function renderProductsSkeleton() {
  if (!els.grid) return;
  els.grid.innerHTML = Array.from({ length: 6 }).map(() => `
    <article class="skeletonCard">
      <div class="skeletonCard__media skeleton"></div>
      <div class="skeletonCard__body">
        <div class="skeleton" style="height:16px;width:65%;"></div>
        <div class="skeleton" style="height:13px;width:40%;"></div>
        <div class="skeleton" style="height:18px;width:30%;margin-top:4px;"></div>
      </div>
    </article>
  `).join("");
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
    ? "Pack sélectionné : Pack 3 (1 offert)"
    : "Pack sélectionné : Pack 5 (2 offerts)";

  els.packGoStep2.disabled = false;

  if (els.packStep2Subtitle) {
    els.packStep2Subtitle.textContent = chosenPackSize === 3
      ? "Choisis 3 bijoux (le moins cher est offert)."
      : "Choisis 5 bijoux (les 2 moins chers sont offerts).";
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

    const inStock = true;
    const dbStock = Number(p.stock || 0); // ✅ stock réel en DB
if (dbStock <= 0) continue;           // ✅ masqué seulement si stock DB à 0

// option : pour afficher “reste X dispo” / gérer bouton
const leftForCart = availableStock(p.id); // stock dispo après ce qu’il y a déjà dans le panier
const canAdd = leftForCart > 0;



    const card = document.createElement("article");
    card.className = "card" + (inStock ? "" : " is-out");

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

  // ✅ Désactive totalement "me prévenir"
if (!ENABLE_NOTIFY) {
  if (els.pdpNotifyRow) els.pdpNotifyRow.style.display = "none";
}



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

  if (els.pdpAddToCart) els.pdpAddToCart.disabled = false;
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

  
  ge();
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

    if (free > 0) hintParts.push(`${free} offert(s) sur “${p.name}”`);
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
  const prev = els.cartCount.textContent;
  const next = String(totalCartCount());
  els.cartCount.textContent = next;
  if (prev !== next) {
    els.cartCount.classList.remove("pop");
    void els.cartCount.offsetWidth;
    els.cartCount.classList.add("pop");
  }
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
          <p>${qty} pièce(s) · ${free} offert(s) → ${payable} payée(s)</p>
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
    if (Number(p.stock || 0) <= 0) continue; // ✅ masque uniquement si stock DB = 0

    const qty = packSelection[p.id] || 0;

    const leftForWizard = availableStockForPackBuilder(p.id);
    const isOut = leftForWizard <= 0; // ✅ on l'affiche quand même, juste en "out"



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
    els.packPreviewLines.innerHTML = `<p class="muted">Sélectionne des bijoux pour composer ton pack.</p>`;
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
        : `Ajoute encore ${remaining} bijou(x) pour compléter le pack. (Prix en cours : ${formatEUR(liveValue)})`;
    } else {
      els.packHint.textContent = size === 3
        ? "Offert : le bijou le moins cher du pack."
        : "Offerts : les 2 bijoux les moins chers du pack.";
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
  const packName = size === 3 ? "Pack 3 (1 offert)" : "Pack 5 (2 offerts)";

  cart.packs.push({
    id: packId,
    name: packName,
    items,
    value: Math.round((totals.value || 0) * 100) / 100,
    free: Math.round((totals.free || 0) * 100) / 100,
    total: Math.round((totals.total || 0) * 100) / 100
  });

  // ✅ IMPORTANT: on NE décrémente PAS p.stock ici (sinon double réserve)
  await saveCart(cart);

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

  setFormMsg(els.packMsg, "Pack ajouté au panier ✓", "success");
  uiToast("Pack ajouté au panier ✓", "success");

  if (els.cartBtn) {
    els.cartBtn.classList.remove("bump");
    void els.cartBtn.offsetWidth;
    els.cartBtn.classList.add("bump");
  }
}

/* ==========
  Gift Card
========== */

function gcSetMsg(text, type = "") {
  setFormMsg(els.gcMsg, text, type);
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

  if (!amount || amount <= 0) return gcSetMsg("Montant invalide.", "error");
  if (!receiver || !receiver.includes("@")) return gcSetMsg("Email du receveur invalide.", "error");

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

  gcSetMsg("Carte cadeau ajoutée au panier ✓", "success");
  uiToast("Carte cadeau ajoutée ✓", "success");
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
  gcSetMsg("Réinitialisé.", "info");
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
  if (els.adminDescription) els.adminDescription.value = p.description || "";

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

  // ✅ SI on reclique sur la même commande → fermer
  if (window.__ADMIN_CURRENT_ORDER_ID__ === openOrderId) {
    const detail = document.getElementById("adminOrderDetail");
    if (detail) {
      detail.classList.add("hidden");
      detail.innerHTML = "";
    }
    window.__ADMIN_CURRENT_ORDER_ID__ = null;
    return;
  }

  // ✅ Sinon → ouvrir normalement
  window.__ADMIN_CURRENT_ORDER_ID__ = openOrderId;

  try {
    const data = await apiAdminLoadOrder(openOrderId);
    const order = data.order;

    renderOrderDetail(order);

    const sel = document.getElementById("adminOrderStatus");
    if (sel) sel.value = order.status || "preparation";
  } catch (err) {
    console.error("ADMIN ORDER OPEN ERROR:", err);
  }

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
        if (els.packMsg) els.packMsg.textContent = "Stock insuffisant pour cette article.";
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


document.getElementById("adminToggleFinished")?.addEventListener("click", async () => {
  showFinishedOrders = !showFinishedOrders;

  const btn = document.getElementById("adminToggleFinished");
  const label = document.getElementById("adminOrdersMode");

  if (showFinishedOrders) {
    btn.textContent = "Voir les commandes en cours";
    if (label) label.textContent = "Commandes terminées (archive)";
  } else {
    btn.textContent = "Voir les commandes terminées";
    if (label) label.textContent = "Commandes en cours";
  }

  await loadAdminOrders();
});

if (ENABLE_NOTIFY) 
{
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
}


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

// PDP add to cart — même logique que les gift cards : push direct, pas d'early exit
els.pdpAddToCart?.addEventListener("click", () => {
  if (!currentPdpId) return;

  // Ajout direct dans cart.skus (comme cart.giftcards.push pour les GC)
  cart.skus[currentPdpId] = (cart.skus[currentPdpId] || 0) + 1;

  saveCart(cart);
  renderCartBadge();
  renderCart();

  if (els.cartBtn) {
    els.cartBtn.classList.remove("bump");
    void els.cartBtn.offsetWidth;
    els.cartBtn.classList.add("bump");
  }

  uiToast("Ajouté au panier ✓", "success");
  closePdp();
});


if (els.cartBtn) els.cartBtn.addEventListener("click", openCart);
if (els.cartClose) els.cartClose.addEventListener("click", closeCart);
if (els.cartOverlay) els.cartOverlay.addEventListener("click", closeCart);

if (els.clearCartBtn) {
  els.clearCartBtn.addEventListener("click", () => {
    clearCart();
    uiToast("Panier vidé.", "info");
  });
}

if (els.checkoutBtn) {
  els.checkoutBtn.addEventListener("click", () => {
    if (totalCartCount() === 0) {
      toast("Ajoute au moins un article 🙂");
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



if (els.adminSelect) {
  els.adminSelect.addEventListener("change", () => {
    loadAdminFields(els.adminSelect.value);
    if (els.adminSaveMsg) els.adminSaveMsg.textContent = "";
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
  Testimonial form modal
========== */

let testiRating = 0;

const RATING_LABELS = ["", "Mauvais", "Moyen", "Bien", "Très bien", "Excellent ✨"];

function setTestiRating(n) {
  testiRating = n;
  const input = document.getElementById("testiRating");
  if (input) input.value = String(n);
  document.querySelectorAll(".testiStarBtn").forEach((btn, i) => {
    btn.classList.toggle("is-on", i < n);
  });
  const hint = document.getElementById("testiRatingHint");
  if (hint) hint.textContent = n ? RATING_LABELS[n] : "Sélectionnez une note";
}

function openTestiForm() {
  const modal = document.getElementById("testiFormModal");
  if (!modal) return;
  setTestiRating(0);
  document.getElementById("testiForm")?.reset();
  document.getElementById("testiFormMsg") && (document.getElementById("testiFormMsg").textContent = "");
  document.getElementById("testiFormState") && (document.getElementById("testiFormState").style.display = "");
  document.getElementById("testiSuccessState") && (document.getElementById("testiSuccessState").style.display = "none");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => document.getElementById("testiName")?.focus(), 60);
}

function closeTestiForm() {
  const modal = document.getElementById("testiFormModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
}

function showTestiSuccess() {
  document.getElementById("testiFormState") && (document.getElementById("testiFormState").style.display = "none");
  document.getElementById("testiSuccessState") && (document.getElementById("testiSuccessState").style.display = "");
}

function initTestiFormModal() {
  document.getElementById("openTestiForm")?.addEventListener("click", openTestiForm);
  document.getElementById("testiFormClose")?.addEventListener("click", closeTestiForm);
  document.getElementById("testiFormOverlay")?.addEventListener("click", closeTestiForm);
  document.getElementById("testiSuccessClose")?.addEventListener("click", closeTestiForm);

  const picker = document.getElementById("testiStarPicker");

  picker?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-testi-star]");
    if (btn) setTestiRating(Number(btn.dataset.testiStar));
  });

  picker?.addEventListener("mouseover", (e) => {
    const btn = e.target?.closest?.("[data-testi-star]");
    if (!btn) return;
    const n = Number(btn.dataset.testiStar);
    document.querySelectorAll(".testiStarBtn").forEach((b, i) => b.classList.toggle("is-on", i < n));
    const hint = document.getElementById("testiRatingHint");
    if (hint) hint.textContent = RATING_LABELS[n] || "";
  });

  picker?.addEventListener("mouseleave", () => {
    document.querySelectorAll(".testiStarBtn").forEach((b, i) => b.classList.toggle("is-on", i < testiRating));
    const hint = document.getElementById("testiRatingHint");
    if (hint) hint.textContent = testiRating ? RATING_LABELS[testiRating] : "Sélectionnez une note";
  });

  document.getElementById("testiForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl  = document.getElementById("testiFormMsg");
    const submit = document.querySelector(".testiModal__submit");
    const name   = (document.getElementById("testiName")?.value || "").trim();
    const body   = (document.getElementById("testiBody")?.value || "").trim();
    const rating = testiRating;

    if (!name)   { setFormMsg(msgEl, "Le prénom est requis.", "error");             return; }
    if (!rating) { setFormMsg(msgEl, "Choisissez une note.", "error");             return; }
    if (!body)   { setFormMsg(msgEl, "Rédigez votre avis s'il vous plaît.", "error"); return; }

    setFormMsg(msgEl, "");
    btnLoading(submit, true);

    const now = new Date();
    const dl  = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const dateLabel = dl.charAt(0).toUpperCase() + dl.slice(1);

    try {
      await apiFetch("/api/testimonials", {
        method: "POST",
        body: JSON.stringify({ name, rating, body, date_label: dateLabel }),
      });
      showTestiSuccess();
    } catch (err) {
      setFormMsg(msgEl, "❌ " + (err?.message || "Erreur. Réessayez."), "error");
      btnLoading(submit, false, "Publier mon avis");
    }
  });
}

/* ==========
  Admin — testimonials en attente
========== */

async function loadAdminPendingTestimonials() {
  const listEl = document.getElementById("adminTestiList");
  const msgEl  = document.getElementById("adminTestiMsg");
  if (!listEl) return;

  if (msgEl) msgEl.textContent = "Chargement…";
  listEl.innerHTML = "";

  try {
    const adminKey = getAdminKey();
    const data = await apiFetch("/api/admin/testimonials/pending", {
      headers: { "x-admin-key": adminKey },
    });

    const list = data?.testimonials || [];
    if (msgEl) msgEl.textContent = list.length ? `${list.length} avis en attente` : "Aucun avis en attente.";

    const badge = document.getElementById("dashAvisBadge");
    if (badge) {
      if (list.length > 0) { badge.textContent = String(list.length); badge.style.display = ""; }
      else { badge.style.display = "none"; }
    }

    listEl.innerHTML = list.map(t => {
      const stars = "★".repeat(t.rating) + "☆".repeat(5 - t.rating);
      const date  = t.created_at ? new Date(t.created_at).toLocaleDateString("fr-FR") : "";
      return `
        <div class="testiAdminCard" id="testi-${escapeHTML(t.id)}">
          <div class="testiAdminCard__head">
            <div>
              <strong>${escapeHTML(t.name)}</strong>
              <span class="tiny muted" style="margin-left:8px;">${date}</span>
            </div>
            <span style="color:var(--brand3); font-size:1rem;">${stars}</span>
          </div>
          <p class="testiAdminCard__body">"${escapeHTML(t.body)}"</p>
          <div class="testiAdminCard__actions">
            <button class="btn btn--primary" type="button"
                    data-testi-approve="${escapeHTML(t.id)}">✓ Approuver</button>
            <button class="btn btn--danger"  type="button"
                    data-testi-delete="${escapeHTML(t.id)}">✕ Supprimer</button>
          </div>
        </div>
      `;
    }).join("");

  } catch (err) {
    if (msgEl) msgEl.textContent = "❌ " + (err?.message || "Erreur");
  }
}

document.addEventListener("click", async (e) => {
  const approveId = e.target?.closest?.("[data-testi-approve]")?.dataset?.testiApprove;
  if (approveId) {
    try {
      await apiFetch(`/api/admin/testimonials/${encodeURIComponent(approveId)}/approve`, {
        method: "PATCH",
        headers: { "x-admin-key": getAdminKey() },
      });
      document.getElementById(`testi-${approveId}`)?.remove();
      uiToast("Avis approuvé ✅");
      const msg = document.getElementById("adminTestiMsg");
      const remaining = document.querySelectorAll(".testiAdminCard").length;
      if (msg) msg.textContent = remaining ? `${remaining} avis en attente` : "Aucun avis en attente.";
    } catch (err) { uiToast("❌ " + (err?.message || "Erreur")); }
    return;
  }

  const deleteId = e.target?.closest?.("[data-testi-delete]")?.dataset?.testiDelete;
  if (deleteId) {
    try {
      await apiFetch(`/api/admin/testimonials/${encodeURIComponent(deleteId)}`, {
        method: "DELETE",
        headers: { "x-admin-key": getAdminKey() },
      });
      document.getElementById(`testi-${deleteId}`)?.remove();
      uiToast("Avis supprimé.");
      const msg = document.getElementById("adminTestiMsg");
      const remaining = document.querySelectorAll(".testiAdminCard").length;
      if (msg) msg.textContent = remaining ? `${remaining} avis en attente` : "Aucun avis en attente.";
    } catch (err) { uiToast("❌ " + (err?.message || "Erreur")); }
    return;
  }
});

window.loadAdminPendingTestimonials = loadAdminPendingTestimonials;

/* ==========
  Admin — recherche client
========== */

async function searchClient() {
  const input  = document.getElementById("clientSearchInput");
  const msgEl  = document.getElementById("clientSearchMsg");
  const result = document.getElementById("clientResult");
  const q = (input?.value || "").trim();

  if (!q || q.length < 3) { setFormMsg(msgEl, "Entrez au moins 3 caractères.", "error"); return; }

  setFormMsg(msgEl, "Recherche…");
  if (result) result.innerHTML = "";

  try {
    const data = await apiFetch(`/api/admin/clients/search?q=${encodeURIComponent(q)}`, {
      headers: { "x-admin-key": getAdminKey() }
    });

    const profiles   = data?.profiles   || [];
    const giftCards  = data?.gift_cards  || [];

    if (!profiles.length && !giftCards.length) {
      setFormMsg(msgEl, "Aucun résultat.", "info");
      return;
    }

    setFormMsg(msgEl, `${profiles.length} compte(s) · ${giftCards.length} carte(s) cadeau`, "success");

    let html = "";

    // Profils inscrits
    if (profiles.length) {
      html += profiles.map(p => {
        const initial = (p.email || "?")[0].toUpperCase();
        const since   = p.created_at ? new Date(p.created_at).toLocaleDateString("fr-FR") : "—";
        return `
          <div class="clientProfile">
            <div class="clientProfile__avatar">${escapeHTML(initial)}</div>
            <div style="flex:1;">
              <strong style="font-size:14px;">${escapeHTML(p.email)}</strong>
              <div class="tiny muted">Inscrit le ${since} · rôle : ${escapeHTML(p.role || "user")}</div>
            </div>
          </div>`;
      }).join("");
    }

    // Cartes cadeaux
    if (giftCards.length) {
      html += `<h4 style="margin:16px 0 10px;font-size:14px;font-weight:700;">Cartes cadeaux (${giftCards.length})</h4>`;
      html += giftCards.map(gc => {
        const statusColor = gc.is_active ? "var(--brand2)" : "var(--muted)";
        const status      = gc.is_active ? "Active" : "Épuisée";
        const sent        = gc.sent_at ? "Envoyée" : (gc.payment_confirmed ? "En attente de la date" : "En attente du paiement");
        return `
          <div class="clientGcCard">
            <div class="clientGcCard__head">
              <div>
                <span class="clientGcCard__code">${escapeHTML(gc.code)}</span>
                <span class="tiny muted" style="margin-left:8px;">${escapeHTML(gc.color || "")}</span>
              </div>
              <span class="clientGcCard__balance">${formatEUR(gc.balance)} / ${formatEUR(gc.initial_amount)}</span>
            </div>
            <div class="tiny muted" style="line-height:1.7;">
              Destinataire : ${escapeHTML(gc.recipient_email)}<br>
              Expéditeur : ${escapeHTML(gc.sender_email)}<br>
              Statut envoi : ${sent} · <span style="color:${statusColor};font-weight:700;">${status}</span>
            </div>
            ${gc.is_active && gc.balance > 0 ? `
              <div class="clientGcCard__deduct">
                <input class="input" type="number" min="0.01" max="${gc.balance}" step="0.01"
                  id="deduct_amount_${escapeHTML(gc.id)}"
                  placeholder="Montant à déduire (max ${formatEUR(gc.balance)})"
                  style="max-width:260px;" />
                <input class="input" type="text"
                  id="deduct_reason_${escapeHTML(gc.id)}"
                  placeholder="Motif (optionnel)"
                  style="max-width:200px;" />
                <button class="btn btn--danger" type="button"
                  data-admin-gc-deduct="${escapeHTML(gc.id)}">
                  Déduire
                </button>
                <span class="tiny muted" id="deduct_msg_${escapeHTML(gc.id)}"></span>
              </div>` : ""}
          </div>`;
      }).join("");
    }

    if (result) result.innerHTML = html;

  } catch (err) {
    setFormMsg(msgEl, "❌ " + (err?.message || "Erreur recherche"), "error");
  }
}

// Handler déduction
document.addEventListener("click", async (e) => {
  const gcId = e.target?.closest?.("[data-admin-gc-deduct]")?.dataset?.adminGcDeduct;
  if (!gcId) return;

  const amountInput = document.getElementById(`deduct_amount_${gcId}`);
  const reasonInput = document.getElementById(`deduct_reason_${gcId}`);
  const msgEl       = document.getElementById(`deduct_msg_${gcId}`);
  const btn         = e.target?.closest?.("[data-admin-gc-deduct]");

  const amount = Number(amountInput?.value || 0);
  const reason = (reasonInput?.value || "").trim();

  if (!amount || amount <= 0) { if (msgEl) setFormMsg(msgEl, "Montant invalide.", "error"); return; }

  btnLoading(btn, true);
  if (msgEl) setFormMsg(msgEl, "");

  try {
    const data = await apiFetch(`/api/admin/gift-cards/${encodeURIComponent(gcId)}/deduct`, {
      method: "PATCH",
      headers: { "x-admin-key": getAdminKey() },
      body: JSON.stringify({ amount, reason }),
    });

    if (msgEl) setFormMsg(msgEl, `✓ Nouveau solde : ${formatEUR(data.new_balance)}`, "success");
    if (amountInput) amountInput.value = "";
    uiToast(`Déduit ${formatEUR(amount)} ✓`, "success");

    // Refresh the search to show updated balance
    setTimeout(() => searchClient(), 600);
  } catch (err) {
    if (msgEl) setFormMsg(msgEl, "❌ " + (err?.message || "Erreur"), "error");
    btnLoading(btn, false, "Déduire");
  }
});

window.searchClient = searchClient;

/* ==========
  Testimonials carousel
========== */

const TESTIMONIALS_FALLBACK = [
  { name: "Sofia M.",   rating: 5, body: "La bague solitaire est absolument sublime — l'or est d'une qualité impeccable. Je la porte tous les jours !", date_label: "Avril 2025" },
  { name: "Lucas R.",   rating: 5, body: "J'ai offert le Pack 3 à ma femme pour notre anniversaire, elle a été touchée aux larmes. Présentation digne d'une grande maison.", date_label: "Mars 2025" },
  { name: "Emma D.",    rating: 5, body: "Le collier perles est d'une élégance rare. Le fermoir est solide et le soin du détail se voit. J'en ai commandé un second.", date_label: "Avril 2025" },
  { name: "Thomas B.",  rating: 4, body: "Livraison soignée, bijoux de qualité. Le bracelet jonc est devenu mon incontournable. Le pack 5 est une vraie affaire.", date_label: "Mars 2025" },
  { name: "Chloé L.",   rating: 5, body: "Ça fait 3 commandes chez Maison Cire, jamais déçue. La carte cadeau est idéale pour les cadeaux de dernière minute.", date_label: "Février 2025" },
  { name: "Nathan V.",  rating: 5, body: "Finitions premium, pièces qui ne ternissent pas. Le pendentif cœur est parfait comme cadeau, mes amis l'ont adoré.", date_label: "Janvier 2025" },
  { name: "Inès K.",    rating: 5, body: "Packaging luxueux, bijoux magnifiques. Les créoles dorées sont légères et élégantes. Je reviendrai sans hésiter.", date_label: "Mars 2025" },
  { name: "Romain T.",  rating: 5, body: "Très belle découverte ! Le pack 3 est un excellent rapport qualité-prix. Les bijoux sont beaux et bien finis.", date_label: "Février 2025" },
];

function initTestimonials() {
  const track    = document.getElementById("testiTrack");
  const viewport = document.getElementById("testiViewport");
  const dotsEl   = document.getElementById("testiDots");
  if (!track || !viewport) return;

  const GAP = 24;
  let current = 0;
  let timer;
  let ITEMS = TESTIMONIALS_FALLBACK;

  function perView() {
    return window.innerWidth >= 900 ? 3 : window.innerWidth >= 580 ? 2 : 1;
  }

  function maxIdx() {
    return Math.max(0, ITEMS.length - perView());
  }

  function stars(n) {
    const s = Math.max(0, Math.min(5, n));
    return "★".repeat(s) + "☆".repeat(5 - s);
  }

  function render() {
    track.innerHTML = ITEMS.map(t => `
      <div class="testiCard">
        <div class="testiCard__stars">${stars(t.rating)}</div>
        <p class="testiCard__text">"${escapeHTML(t.body)}"</p>
        <div class="testiCard__foot">
          <strong class="testiCard__name">${escapeHTML(t.name)}</strong>
          <span class="testiCard__date">${escapeHTML(t.date_label || "")}</span>
        </div>
      </div>
    `).join("");

    const n = perView();
    const w = (viewport.offsetWidth - (n - 1) * GAP) / n;
    track.querySelectorAll(".testiCard").forEach(c => { c.style.width = w + "px"; });
  }

  function updateScoreBlock(items) {
    if (!items.length) return;
    const avg   = items.reduce((s, t) => s + (Number(t.rating) || 0), 0) / items.length;
    const count = items.length;
    const full  = Math.round(avg);
    const stars = "★".repeat(Math.min(5, full)) + "☆".repeat(Math.max(0, 5 - full));

    const numEl   = document.getElementById("testiAvgNum");
    const starsEl = document.getElementById("testiAvgStars");
    const lblEl   = document.getElementById("testiAvgLabel");
    if (numEl)   numEl.textContent   = avg.toFixed(1).replace(".", ",");
    if (starsEl) starsEl.textContent = stars;
    if (lblEl)   lblEl.textContent   = `${count} avis vérifiés`;
  }

  async function loadFromApi() {
    try {
      const data = await apiFetch("/api/testimonials");
      if (Array.isArray(data?.testimonials) && data.testimonials.length) {
        ITEMS = data.testimonials;
        render();
        buildDots();
        goTo(0);
        updateScoreBlock(ITEMS);
      }
    } catch (_) {}
  }

  function buildDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = Array.from({ length: maxIdx() + 1 })
      .map((_, i) => `<button class="testiDot${i === current ? " is-on" : ""}" data-testi-dot="${i}" aria-label="Avis ${i + 1}"></button>`)
      .join("");
  }

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, maxIdx()));
    const card = track.querySelector(".testiCard");
    if (!card) return;
    track.style.transform = `translateX(-${current * (card.offsetWidth + GAP)}px)`;
    dotsEl?.querySelectorAll(".testiDot").forEach((d, i) => d.classList.toggle("is-on", i === current));
  }

  function next() { goTo(current >= maxIdx() ? 0 : current + 1); }
  function prev() { goTo(current <= 0 ? maxIdx() : current - 1); }
  function startAuto() { stopAuto(); timer = setInterval(next, 5000); }
  function stopAuto()  { clearInterval(timer); }

  render();
  buildDots();
  goTo(0);
  startAuto();
  loadFromApi();

  document.getElementById("testiPrev")?.addEventListener("click", () => { stopAuto(); prev(); startAuto(); });
  document.getElementById("testiNext")?.addEventListener("click", () => { stopAuto(); next(); startAuto(); });
  dotsEl?.addEventListener("click", e => {
    const d = e.target?.closest?.("[data-testi-dot]");
    if (d) { stopAuto(); goTo(Number(d.dataset.testiDot)); startAuto(); }
  });

  let rTimer;
  window.addEventListener("resize", () => {
    clearTimeout(rTimer);
    rTimer = setTimeout(() => { render(); buildDots(); goTo(0); }, 200);
  });
}

/* ==========
  Init
========== */

async function init() {
  // Skeleton immédiat pendant le chargement
  renderProductsSkeleton();

  // 1) session panier côté backend
  try { await ensureSessionId(); } catch (_) {}

  // 2) charge produits depuis backend
  try {
    products = await apiLoadProducts();
    saveProducts(products); // optionnel (cache)
  } catch (e) {
    // fallback si backend down
    products = loadProducts();
  }

  // 3) charge panier depuis backend — ne pas écraser si l'user a déjà ajouté des articles
  try {
    const srvCart = await apiLoadCart();
    if (srvCart) {
      const countCart = (c) =>
        Object.values(c?.skus || {}).reduce((a, b) => a + b, 0) +
        (c?.packs || []).length +
        (c?.giftcards || []).length;
      // Prend le panier le plus garni (local vs serveur)
      if (countCart(srvCart) > countCart(cart)) {
        cart = srvCart;
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
      }
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
  initTestimonials();
  initTestiFormModal();
}

init();

document.addEventListener("change", async (e) => {
  if (e.target?.id !== "adminOrderStatus") return;

  const status = e.target.value;
  const msgEl = document.getElementById("adminOrderStatusMsg");

  try {
    if (msgEl) msgEl.textContent = "Mise à jour...";
    await apiAdminUpdateOrderStatus(window.__ADMIN_CURRENT_ORDER_ID__, status);
    if (msgEl) msgEl.textContent = "✅ Statut mis à jour";
    await loadAdminOrders(); // optionnel: refresh liste
  } catch (err) {
    if (msgEl) msgEl.textContent = "❌ " + (err?.message || "Erreur");
  }
});


// ✅ Expose for account.html (admin dashboard lives there now)
window.loadAdminOrders = loadAdminOrders;
window.renderOrderDetail = renderOrderDetail;
