// Guadaluz — backend/server.js (clean)
// ✅ Products + Cart + Orders + Reviews + Notify + Admin + Auth (email/password)

import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { supabase } from "./supabase.js";
import { sendMail } from "./mailer.js";

import { orderConfirmationEmail } from "./emails/orderConfirmation.js";
import { adminNewOrderEmail }     from "./emails/adminNewOrder.js";
import { orderStatusEmail }       from "./emails/orderStatus.js";
import { giftCardEmail }          from "./emails/giftCardEmail.js";


const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

// ---------- Config ----------
const JWT_SECRET = (process.env.JWT_SECRET || "dev_jwt_secret_change_me").trim();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

// ---------- Small utils ----------
function ok(res, payload) {
  return res.json(payload);
}
function bad(res, status, message) {
  return res.status(status).json({ error: message });
}

// ---------- Anti-spam commandes ----------
const _orderRateLimits = new Map(); // key -> { count, resetAt }
const ORDER_MAX       = 4;
const ORDER_WINDOW_MS = 60 * 60 * 1000; // 1 heure

// Nettoyage toutes les 30 min pour éviter une fuite mémoire
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _orderRateLimits) {
    if (now > entry.resetAt) _orderRateLimits.delete(key);
  }
}, 30 * 60 * 1000);

function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress
    || "unknown";
}

function checkOrderRateLimit(req) {
  const email = normalizeEmail(req.body?.email || "");
  const ip    = getClientIp(req);
  const keys  = [`email:${email}`, `ip:${ip}`];
  const now   = Date.now();

  // Phase 1 : vérifier AVANT d'incrémenter (évite de consommer le quota sur un rejet)
  for (const key of keys) {
    const entry = _orderRateLimits.get(key);
    if (entry && now <= entry.resetAt && entry.count >= ORDER_MAX) return false;
  }

  // Phase 2 : incrémenter seulement si les deux clés passent
  for (const key of keys) {
    const entry = _orderRateLimits.get(key);
    if (!entry || now > entry.resetAt) {
      _orderRateLimits.set(key, { count: 1, resetAt: now + ORDER_WINDOW_MS });
    } else {
      entry.count++;
    }
  }
  return true;
}
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEUR(n) {
  const x = Number(n || 0);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(x);
}

// Construit un tableau HTML avec les articles (singles + packs + gift cards)
async function buildOrderItemsHtml(cart) {
  const skus      = (cart && typeof cart === "object" && cart.skus && typeof cart.skus === "object") ? cart.skus : {};
  const packs     = Array.isArray(cart?.packs)     ? cart.packs     : [];
  const giftcards = Array.isArray(cart?.giftcards) ? cart.giftcards : [];

  console.log("📦 buildOrderItemsHtml — skus:", JSON.stringify(skus), "| packs:", packs.length, "| giftcards:", giftcards.length);

  const ids = new Set();
  for (const pid of Object.keys(skus)) ids.add(String(pid));
  for (const pack of packs) {
    for (const it of (Array.isArray(pack?.items) ? pack.items : [])) {
      if (it?.id) ids.add(String(it.id));
    }
  }

  if (ids.size === 0 && packs.length === 0 && giftcards.length === 0) {
    return `<p style="margin:0;color:#666;">Aucun article.</p>`;
  }

  // Récupérer les noms/prix depuis Supabase (seulement si nécessaire)
  let byId = {};
  if (ids.size > 0) {
    try {
      const { data: prods } = await supabase
        .from("products")
        .select("id,name,price")
        .in("id", Array.from(ids));
      byId = Object.fromEntries((prods || []).map(p => [String(p.id), p]));
    } catch (_) { /* fallback : on affichera les IDs comme noms */ }
  }

  let rows = "";

  // singles rows
  for (const [pidRaw, qtyRaw] of Object.entries(skus)) {
    const pid = String(pidRaw);
    const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0));
    if (!qty) continue;

    const p = byId[pid];
    const name = p?.name || pid;
    const unit = Number(p?.price || 0);
    const line = unit * qty;

    rows += `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;">
          ${escapeHtml(name)}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">
          ${qty}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">
          ${escapeHtml(formatEUR(unit))}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">
          ${escapeHtml(formatEUR(line))}
        </td>
      </tr>
    `;
  }

  // packs rows
  for (const pack of packs) {
    const packName = pack?.name || "Pack";
    const packTotal = Number(pack?.total ?? pack?.value ?? 0);

    const items = (Array.isArray(pack?.items) ? pack.items : [])
      .map(it => {
        const pid = String(it?.id || "");
        const qty = Math.max(0, Math.floor(Number(it?.qty) || 0));
        if (!pid || !qty) return null;
        const p = byId[pid];
        return `${escapeHtml(p?.name || pid)} ×${qty}`;
      })
      .filter(Boolean)
      .join("<br>");

    rows += `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(packName)}</strong>
          ${items ? `<div style="margin-top:6px;color:#666;font-size:12px;line-height:1.35;">${items}</div>` : ""}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">
          1
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">
          ${escapeHtml(formatEUR(packTotal))}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">
          ${escapeHtml(formatEUR(packTotal))}
        </td>
      </tr>
    `;
  }

  // gift cards rows
  for (const gc of giftcards) {
    const amount = Number(gc?.amount || 0);
    const to     = escapeHtml(String(gc?.receiver || "—"));
    const color  = escapeHtml(String(gc?.color || "ambre"));
    const date   = gc?.sendDate ? escapeHtml(String(gc.sendDate)) : "À la confirmation";

    rows += `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;">
          <strong>🎁 Carte cadeau</strong>
          <div style="margin-top:4px;color:#666;font-size:12px;line-height:1.4;">
            Pour : ${to}<br>
            Couleur : ${color}<br>
            Envoi : ${date}
          </div>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">1</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">
          ${escapeHtml(formatEUR(amount))}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">
          ${escapeHtml(formatEUR(amount))}
        </td>
      </tr>
    `;
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px;">
      <thead>
        <tr>
          <th align="left" style="padding:10px 8px;border-bottom:1px solid #eee;color:#666;font-size:12px;">Article</th>
          <th align="center" style="padding:10px 8px;border-bottom:1px solid #eee;color:#666;font-size:12px;">Qté</th>
          <th align="right" style="padding:10px 8px;border-bottom:1px solid #eee;color:#666;font-size:12px;">PU</th>
          <th align="right" style="padding:10px 8px;border-bottom:1px solid #eee;color:#666;font-size:12px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function countItemsInCart(cart) {
  if (!cart || typeof cart !== "object") return 0;
  const skus = cart.skus && typeof cart.skus === "object" ? cart.skus : {};
  const packs = Array.isArray(cart.packs) ? cart.packs : [];
  const giftcards = Array.isArray(cart.giftcards) ? cart.giftcards : [];
  return (
    Object.values(skus).reduce((a, b) => a + (Number(b) || 0), 0) +
    packs.length +
    giftcards.length
  );
}

// ---------- Gift card helpers ----------

function shortId(id) {
  return String(id || "").slice(0, 8).toUpperCase();
}

function generateGiftCardCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `MC-${seg(4)}-${seg(4)}-${seg(4)}`;
}

async function sendGiftCardMail(gc) {
  const shopUrl = process.env.SHOP_URL || "https://backendmaisoncire.onrender.com";
  await sendMail({
    to: gc.recipient_email,
    subject: `Guadaluz — Votre carte cadeau de ${Number(gc.initial_amount).toFixed(0)} €`,
    html: giftCardEmail({
      code:           gc.code,
      amount:         gc.initial_amount,
      fromName:       gc.from_name,
      message:        gc.message,
      recipientEmail: gc.recipient_email,
      color:          gc.color || "ambre",
      shopUrl,
    }),
  });
}

// Envoie les cartes dont payment_confirmed=true et send_date atteinte
async function sendPendingGiftCards() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: pending, error } = await supabase
      .from("gift_cards")
      .select("*")
      .eq("payment_confirmed", true)
      .or(`send_date.lte.${today},send_date.is.null`)
      .is("sent_at", null)
      .eq("is_active", true);
    if (error) throw error;
    for (const gc of pending || []) {
      try {
        await sendGiftCardMail(gc);
        await supabase.from("gift_cards").update({ sent_at: new Date().toISOString() }).eq("id", gc.id);
        console.log(`✅ Gift card sent: ${gc.code} → ${gc.recipient_email}`);
      } catch (e) {
        console.error(`❌ Gift card send failed ${gc.code}:`, e.message);
      }
    }
  } catch (e) {
    console.error("sendPendingGiftCards error:", e.message);
  }
}

// Appelé quand commande passe à "terminé" — confirme les cartes et envoie si date atteinte
async function confirmAndSendGiftCards(orderId) {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Marquer toutes les cartes de cette commande comme confirmées
    const { data: cards, error } = await supabase
      .from("gift_cards")
      .update({ payment_confirmed: true })
      .eq("order_id", orderId)
      .eq("payment_confirmed", false)
      .is("sent_at", null)
      .select("*");
    if (error) throw error;

    for (const gc of cards || []) {
      const sendDate = gc.send_date || today;
      if (sendDate <= today) {
        // Date déjà atteinte → envoi immédiat
        try {
          await sendGiftCardMail(gc);
          await supabase.from("gift_cards").update({ sent_at: new Date().toISOString() }).eq("id", gc.id);
          console.log(`✅ Gift card sent immediately: ${gc.code} → ${gc.recipient_email}`);
        } catch (e) {
          console.error(`❌ Gift card immediate send failed ${gc.code}:`, e.message);
        }
      } else {
        // Date future → le cron s'en chargera
        console.log(`📅 Gift card scheduled: ${gc.code} → ${gc.recipient_email} on ${sendDate}`);
      }
    }
  } catch (e) {
    console.error("confirmAndSendGiftCards error:", e.message);
  }
}

async function createGiftCardsFromOrder(orderId, cartGiftcards, senderEmail) {
  for (const gc of cartGiftcards || []) {
    let code;
    for (let i = 0; i < 10; i++) {
      code = generateGiftCardCode();
      const { data: existing } = await supabase.from("gift_cards").select("id").eq("code", code).maybeSingle();
      if (!existing) break;
    }
    const { error } = await supabase
      .from("gift_cards")
      .insert({
        code,
        initial_amount:     Math.round(Number(gc.amount || 0) * 100) / 100,
        balance:            Math.round(Number(gc.amount || 0) * 100) / 100,
        sender_email:       senderEmail,
        recipient_email:    String(gc.receiver || "").toLowerCase(),
        from_name:          gc.fromName  || "",
        message:            gc.message   || "",
        color:              gc.color     || "ambre",
        send_date:          gc.sendDate  || null,
        payment_confirmed:  false,   // sera confirmé quand commande = "terminé"
        order_id:           orderId,
      });
    if (error) console.error("createGiftCard error:", error.message);
  }
}

// Vérification toutes les heures + au démarrage
setTimeout(sendPendingGiftCards, 10_000);
setInterval(sendPendingGiftCards, 60 * 60 * 1000);

function computeFreeUnitsSingles(_qty) {
  return 0; // promos packs désactivées
}

// ---------- Auth via Supabase ----------
function readToken(req) {
  const h = String(req.headers.authorization || "");
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return String(req.headers["x-admin-key"] || "").trim();
}

async function getAuthUser(req) {
  const token = readToken(req);
  if (!token) return null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const u = await getAuthUser(req);
  if (!u?.email) return bad(res, 401, "Non connecté");
  req.user = u;
  next();
}

async function requireAdmin(req, res, next) {
  const u = await getAuthUser(req);
  if (!u?.email) return bad(res, 401, "Non connecté");

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", u.id)
      .maybeSingle();
    if (error) throw error;

    const role = data?.role || "user";
    if (role !== "admin") return bad(res, 403, "Admin requis");

    req.user = { ...u, role };
    return next();
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur auth admin");
  }
}

// ---------- Auth routes (Supabase Auth) ----------

// Session check + rôle — utilisé par le frontend au chargement
app.get("/api/auth/me", async (req, res) => {
  try {
    const u = await getAuthUser(req);
    if (!u?.email) return bad(res, 401, "Non connecté");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", u.id)
      .maybeSingle();

    const role = profile?.role || "user";
    return ok(res, { user: { email: u.email, role } });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur me");
  }
});

// Orders for logged-in user (by email)
app.get("/api/account/orders", requireAuth, async (req, res) => {
  try {
    const email = normalizeEmail(req.user.email);
    const { data, error } = await supabase
      .from("orders")
      .select("id, email, total, status, created_at, delivery_mode, payment_mode, cart")
      .eq("email", email)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // bonus: compute items_count like admin list (useful front)
    const orders = (data || []).map((o) => ({
      ...o,
      items_count: countItemsInCart(o.cart),
    }));

    return ok(res, { orders });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur chargement commandes");
  }
});

// ---------- Products ----------
app.get("/api/products", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ok(res, { products: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur produits");
  }
});

// ---------- Cart ----------

// Rate limit sur la création de sessions (anti-bot)
const _cartInitLimits = new Map();
const CART_INIT_MAX    = 10;
const CART_INIT_WINDOW = 60 * 60 * 1000; // 10 sessions max par heure par IP

app.post("/api/cart/init", async (req, res) => {
  const ip  = getClientIp(req);
  const now = Date.now();
  let entry = _cartInitLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    _cartInitLimits.set(ip, { count: 1, resetAt: now + CART_INIT_WINDOW });
  } else if (entry.count >= CART_INIT_MAX) {
    return bad(res, 429, "Trop de requêtes.");
  } else {
    entry.count++;
  }

  try {
    const session_id = `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const { error } = await supabase.from("carts").insert({ session_id });
    if (error) throw error;
    return ok(res, { session_id });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur init panier");
  }
});

app.get("/api/cart/:sessionId", async (req, res) => {
  try {
    const sid = String(req.params.sessionId || "").trim();
    if (!sid) return bad(res, 400, "sessionId manquant");

    const { data, error } = await supabase
      .from("carts")
      .select("cart")
      .eq("session_id", sid)
      .maybeSingle();
    if (error) throw error;

    return ok(res, { cart: data?.cart || null });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur panier");
  }
});

app.put("/api/cart/:sessionId", async (req, res) => {
  try {
    const sid = String(req.params.sessionId || "").trim();
    const cart = req.body?.cart;
    if (!sid) return bad(res, 400, "sessionId manquant");
    if (!cart || typeof cart !== "object") return bad(res, 400, "Cart invalide");

    const { error } = await supabase
      .from("carts")
      .upsert({ session_id: sid, cart, updated_at: new Date().toISOString() });
    if (error) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur maj panier");
  }
});

// ---------- Orders ----------

app.post("/api/checkout/:sessionId", async (req, res) => {
  try {
    const sid = String(req.params.sessionId || "").trim();
    if (!sid) return bad(res, 400, "sessionId manquant");

    // 1) Charger le panier depuis la DB
    const { data: cartRow, error: cartErr } = await supabase
      .from("carts")
      .select("cart")
      .eq("session_id", sid)
      .maybeSingle();

    if (cartErr) throw cartErr;

    const cart = cartRow?.cart;
    if (!cart || typeof cart !== "object") return bad(res, 400, "Panier introuvable");

    const skus = cart.skus && typeof cart.skus === "object" ? cart.skus : {};
    const packs = Array.isArray(cart.packs) ? cart.packs : [];
    const giftcards = Array.isArray(cart.giftcards) ? cart.giftcards : [];

    const itemsCount =
      Object.values(skus).reduce((a, b) => a + (Number(b) || 0), 0) +
      packs.length +
      giftcards.length;

    if (itemsCount === 0) return bad(res, 400, "Panier vide");

    // 2) Infos client depuis le body (ton checkout.js envoie ça)
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || "").trim() || null;
    const delivery_mode = String(req.body?.delivery_mode || "pickup").trim();
    const payment_mode = String(req.body?.payment_mode || "transfer").trim();
    const address =
      req.body?.address && typeof req.body.address === "object" ? req.body.address : null;

    if (!email || !email.includes("@")) return bad(res, 400, "Email invalide");

    // 3) Calcul total (simple & cohérent avec ton app.js)
    //    - singles: promo 3=1 offerte, 5=2 offertes (par produit)
    //    - packs: on prend pack.total (déjà calculé côté front quand créé)
    //    - giftcards: amount (même si tu les as désactivées, on garde propre)
    const allProducts = await supabase.from("products").select("id,price");
    if (allProducts.error) throw allProducts.error;

    const priceMap = {};
    for (const p of allProducts.data || []) priceMap[p.id] = Number(p.price || 0);

    let total = 0;

    // singles
    for (const [pid, qtyRaw] of Object.entries(skus)) {
      const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0));
      const price = Number(priceMap[pid] || 0);

      const free = computeFreeUnitsSingles(qty);
      const payable = Math.max(0, qty - free);

      total += payable * price;
    }

    // packs
    for (const pack of packs) {
      total += Number(pack?.total || 0); // pack.total déjà calculé dans ton app.js
    }

    // giftcards
    for (const gc of giftcards) {
      total += Number(gc?.amount || 0);
    }

    total = Math.round(total * 100) / 100;

    // 4) Créer la commande
    const status =
  payment_mode === "transfer"
    ? "en attente du virement"
    : "preparation";

    const delivery_fee = 0;

    const { data: created, error: orderErr } = await supabase
      .from("orders")
      .insert({
        session_id: sid,
        email,
        phone,
        delivery_mode,
        payment_mode,
        address,
        cart,
        total,
        delivery_fee,
        status,
      })
      .select("id")
      .single();

    if (orderErr) throw orderErr;

    // 5) Décrément stock (singles + packs)
    const toDec = {}; // { productId: qtyToRemove }

    // singles
    for (const [pid, qtyRaw] of Object.entries(skus)) {
      const q = Math.max(0, Math.floor(Number(qtyRaw) || 0));
      if (q > 0) toDec[pid] = (toDec[pid] || 0) + q;
    }

    // packs (items: [{id, qty}])
    for (const pack of packs) {
      const items = Array.isArray(pack?.items) ? pack.items : [];
      for (const it of items) {
        const pid = String(it?.id || "").trim();
        const q = Math.max(0, Math.floor(Number(it?.qty) || 0));
        if (pid && q > 0) toDec[pid] = (toDec[pid] || 0) + q;
      }
    }

    // appliquer
    for (const [pid, q] of Object.entries(toDec)) {
      const { data: pRow, error: pErr } = await supabase
        .from("products")
        .select("stock")
        .eq("id", pid)
        .single();

      if (pErr) throw pErr;

      const current = Number(pRow?.stock || 0);
      const next = Math.max(0, current - Number(q || 0));

      const { error: uErr } = await supabase
        .from("products")
        .update({ stock: next })
        .eq("id", pid);

      if (uErr) throw uErr;
    }

    return ok(res, { ok: true, order_id: created.id, total });
  } catch (e) {
    console.error("CHECKOUT error:", e?.message || e);
    return bad(res, 500, e?.message || "Erreur checkout");
  }
});

app.post("/api/orders", async (req, res) => {
  if (!checkOrderRateLimit(req)) {
    return bad(res, 429, "Trop de commandes envoyées. Veuillez réessayer dans une heure.");
  }
  // Honeypot : un humain ne remplit jamais ce champ
  if (req.body?.website) return bad(res, 400, "Requête invalide");

  try {
    const session_id = String(req.body?.session_id || "").trim();
    const email = normalizeEmail(req.body?.email);
    const cart = req.body?.cart;

    const phone = String(req.body?.phone || "").trim() || null;
    const delivery_mode = String(req.body?.delivery_mode || "pickup").trim();
    const payment_mode = String(req.body?.payment_mode || "transfer").trim();
    const address =
      req.body?.address && typeof req.body.address === "object" ? req.body.address : null;
    const delivery_fee = Number(req.body?.delivery_fee || 0) || 0;

    const status =
      payment_mode === "transfer"
        ? "en attente du virement"
        : "preparation";


    if (!email || !email.includes("@")) return bad(res, 400, "Email invalide");
    if (!cart || typeof cart !== "object") return bad(res, 400, "Panier invalide");

    // Panier vide = rejet immédiat
    const cartSkus  = cart?.skus && typeof cart.skus === "object" ? cart.skus : {};
    const cartPacks = Array.isArray(cart?.packs) ? cart.packs : [];
    const cartGcs   = Array.isArray(cart?.giftcards) ? cart.giftcards : [];
    const cartIsEmpty = !Object.keys(cartSkus).length && !cartPacks.length && !cartGcs.length;
    if (cartIsEmpty) return bad(res, 400, "Panier vide");

    // Vérifier que le session_id est un vrai panier créé depuis le site (anti-bot)
    if (!session_id) return bad(res, 403, "Session manquante");

    const { data: cartRow } = await supabase
      .from("carts").select("session_id, created_at").eq("session_id", session_id).maybeSingle();
    if (!cartRow) return bad(res, 403, "Session invalide");

    // Session trop récente = bot qui enchaîne init + order instantanément
    const sessionAgeMs = Date.now() - new Date(cartRow.created_at).getTime();
    if (sessionAgeMs < 4000) return bad(res, 403, "Session trop récente");

    // Session à usage unique : 1 session = 1 commande max
    const { data: existingOrder } = await supabase
      .from("orders").select("id").eq("session_id", session_id).maybeSingle();
    if (existingOrder) return bad(res, 409, "Cette session a déjà été utilisée");

    // Recalcul du total côté serveur (prix depuis la DB — le client ne peut pas tricher)
    let serverTotal = 0;
    const allProductIds = [
      ...Object.keys(cartSkus),
      ...cartPacks.flatMap(p => (p.items || []).map(it => it.id)),
    ].filter(Boolean);

    if (allProductIds.length) {
      const { data: priceRows } = await supabase
        .from("products").select("id,price").in("id", allProductIds);
      const priceMap = Object.fromEntries((priceRows || []).map(p => [p.id, Number(p.price || 0)]));

      for (const [pid, qty] of Object.entries(cartSkus)) {
        serverTotal += (priceMap[pid] || 0) * Math.max(0, Math.floor(Number(qty) || 0));
      }
      for (const pack of cartPacks) {
        serverTotal += Number(pack.total ?? pack.value ?? 0);
      }
    }
    for (const gc of cartGcs) serverTotal += Number(gc.amount || 0);
    serverTotal += delivery_fee;

    // Appliquer la remise carte cadeau si fournie
    const gcDiscountReq = Math.max(0, Number(req.body?.gift_card_discount || 0));
    if (gcDiscountReq > 0) serverTotal = Math.max(0, serverTotal - gcDiscountReq);

    const total = Math.round(serverTotal * 100) / 100;

        // --- Build toDec (singles + packs) pour décrément ATOMIQUE ---
    const skus      = (cart && typeof cart === "object" && cart.skus && typeof cart.skus === "object") ? cart.skus : {};
    const packs     = Array.isArray(cart?.packs)      ? cart.packs      : [];
    const giftcards = Array.isArray(cart?.giftcards)  ? cart.giftcards  : [];

    const toDec = {}; // { productId: qtyToRemove }

    // singles
    for (const [pidRaw, qtyRaw] of Object.entries(skus)) {
      const pid = String(pidRaw || "").trim();
      const q = Math.floor(Number(qtyRaw) || 0);
      if (pid && q > 0) toDec[pid] = (toDec[pid] || 0) + q;
    }

    // packs
    for (const pack of packs) {
      const items = Array.isArray(pack?.items) ? pack.items : [];
      for (const it of items) {
        const pid = String(it?.id || "").trim();
        const q = Math.floor(Number(it?.qty) || 0);
        if (pid && q > 0) toDec[pid] = (toDec[pid] || 0) + q;
      }
    }

    // ✅ Décrément stock ATOMIQUE (anti double click / concurrence)
try {
  if (Object.keys(toDec).length) {
    const { error: decErr } = await supabase.rpc("decrement_stock_bulk", { items: toDec });
    if (decErr) throw decErr;
  }
} catch (e) {
  const msg = String(e?.message || e);

  if (msg.includes("insufficient_stock:")) {
    const pid = msg.split("insufficient_stock:")[1]?.trim() || "";
    return bad(res, 409, `Stock insuffisant (produit ${pid})`);
  }

  console.error("❌ STOCK decrement rpc error:", msg);
  return bad(res, 500, "Erreur stock");
}



    const cgvAcceptedAt = String(req.body?.cgv_accepted_at || "").trim() || new Date().toISOString();

    const { data, error } = await supabase
      .from("orders")
      .insert({
        session_id,
        email,
        phone,
        delivery_mode,
        payment_mode,
        address,
        cart,
        total,
        delivery_fee,
        status,
        cgv_accepted_at: cgvAcceptedAt,
      })
      .select("id")
      .single();
    if (error) throw error;

    let itemsHtml = "";
try {
  itemsHtml = await buildOrderItemsHtml(cart);
} catch (e) {
  console.error("itemsHtml error:", e?.message || e);
  itemsHtml = `<p style="margin:0;color:#666;">(Impossible de charger les articles)</p>`;
}


    // labels lisibles
const deliveryLabel = delivery_mode === "shipping" ? "Envoi à domicile" : "Retrait en magasin";
const paymentLabel = payment_mode === "cash" ? "Cash" : "Virement";

// ----- IBAN uniquement si paiement par virement -----
const isTransfer = payment_mode === "transfer"; // IMPORTANT
const iban = process.env.BANK_IBAN || "";
const bic = process.env.BANK_BIC || "";
const owner = process.env.BANK_OWNER || "";

const ibanHtml = (isTransfer && iban)
  ? `
    <div style="margin-top:10px;background:#fff;border:1px solid #eee;border-radius:10px;padding:12px;">
      <p style="margin:0 0 6px;"><strong>Titulaire :</strong> ${owner || "Guadaluz"}</p>
      <p style="margin:0 0 6px;"><strong>IBAN :</strong> ${iban}</p>
      ${bic ? `<p style="margin:0;"><strong>BIC :</strong> ${bic}</p>` : ""}
    </div>
  `
  : "";

  const statusLabel =
      payment_mode === "transfer"
        ? "en attente du virement"
        : "preparation";

// email client (best-effort)
try {
  await sendMail({
    to: email,
    subject: `Guadaluz — Confirmation de commande #${shortId(data.id)}`,
    html: orderConfirmationEmail({
      orderId: shortId(data.id),
      total: Number(total || 0).toFixed(2),
      gcDiscount: Number(req.body?.gift_card_discount || 0) || 0,
      deliveryLabel,
      paymentLabel,
      itemsHtml,
      ibanHtml,
      statusLabel,
    }),
  });
} catch (e) {
  console.error("❌ MAIL client error:", e?.message || e);
}

// email admin (best-effort)
try {
  const adminTo = process.env.ADMIN_EMAIL;
  if (adminTo) {
    await sendMail({
      to: adminTo,
      subject: `Nouvelle commande #${shortId(data.id)}`,
      html: adminNewOrderEmail({
        orderId: shortId(data.id),
        email,
        total: Number(total || 0).toFixed(2),
        deliveryLabel,
        paymentLabel,
        itemsHtml,
      }),
    });
  }
} catch (e) {
  console.error("❌ MAIL admin error:", e?.message || e);
}


    // Créer les gift cards achetées dans cette commande
    if (giftcards.length) {
      createGiftCardsFromOrder(data.id, giftcards, email).catch(e =>
        console.error("createGiftCardsFromOrder error:", e.message)
      );
    }

    // Appliquer le code cadeau si fourni
    const gcCode     = String(req.body?.gift_card_code || "").trim().toUpperCase();
    const gcDiscount = Number(req.body?.gift_card_discount || 0);
    if (gcCode && gcDiscount > 0) {
      const { data: gcRow } = await supabase.from("gift_cards").select("id,balance").eq("code", gcCode).maybeSingle();
      if (gcRow) {
        const used = Math.min(gcDiscount, gcRow.balance);
        const newBalance = Math.max(0, Math.round((gcRow.balance - used) * 100) / 100);
        await supabase.from("gift_cards").update({ balance: newBalance, is_active: newBalance > 0 }).eq("id", gcRow.id);
      }
    }

    return ok(res, { ok: true, order_id: data?.id });
  } catch (e) {
  // rollback best-effort si on a décrémenté puis crash après
  try {
    if (typeof toDec === "object" && toDec && Object.keys(toDec).length) {
      await supabase.rpc("increment_stock_bulk", { items: toDec });
    }
  } catch (rb) {
    console.error("⚠️ rollback stock failed:", rb?.message || rb);
  }

  return bad(res, 500, e?.message || "Erreur création commande");
}

});

// ---------- Reviews ----------
app.get("/api/reviews/summary", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("reviews").select("product_id,rating");
    if (error) throw error;

    const summary = {};
    for (const r of data || []) {
      const pid = r.product_id;
      const rating = Number(r.rating) || 0;
      if (!summary[pid]) summary[pid] = { sum: 0, count: 0 };
      summary[pid].sum += rating;
      summary[pid].count += 1;
    }

    const out = {};
    for (const [pid, v] of Object.entries(summary)) {
      out[pid] = { avg: v.count ? v.sum / v.count : 0, count: v.count };
    }
    return ok(res, { summary: out });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur summary avis");
  }
});

app.get("/api/reviews/:productId", async (req, res) => {
  try {
    const productId = String(req.params.productId || "").trim();
    if (!productId) return bad(res, 400, "productId manquant");

    const { data, error } = await supabase
      .from("reviews")
      .select("id,product_id,name,rating,text,created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(res, { reviews: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur avis");
  }
});

app.post("/api/reviews/:productId", async (req, res) => {
  try {
    const product_id = String(req.params.productId || "").trim();
    const name = String(req.body?.name || "").trim();
    const rating = Number(req.body?.rating || 0);
    const text = String(req.body?.text || "").trim();

    if (!product_id) return bad(res, 400, "productId manquant");
    if (!name) return bad(res, 400, "Nom requis");
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return bad(res, 400, "Note invalide");

    const { data, error } = await supabase
      .from("reviews")
      .insert({ product_id, name, rating, text })
      .select("id,product_id,name,rating,text,created_at")
      .single();
    if (error) throw error;

    return ok(res, { review: data });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur ajout avis");
  }
});

// ---------- Notify ----------
app.post("/api/notify/:productId", async (req, res) => {
  try {
    const product_id = String(req.params.productId || "").trim();
    const email = normalizeEmail(req.body?.email);
    if (!product_id) return bad(res, 400, "productId manquant");
    if (!email || !email.includes("@")) return bad(res, 400, "Email invalide");

    const { error } = await supabase.from("notify_subscriptions").insert({ product_id, email });
    if (error && !String(error.message || "").includes("duplicate")) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur subscribe");
  }
});

app.delete("/api/notify/:productId", async (req, res) => {
  try {
    const product_id = String(req.params.productId || "").trim();
    const email = normalizeEmail(req.body?.email);
    if (!product_id) return bad(res, 400, "productId manquant");
    if (!email || !email.includes("@")) return bad(res, 400, "Email invalide");

    const { error } = await supabase
      .from("notify_subscriptions")
      .delete()
      .eq("product_id", product_id)
      .eq("email", email);
    if (error) throw error;

    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur unsubscribe");
  }
});

// ---------- Admin: products ----------
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const id = String(payload.id || "").trim();
    const name = String(payload.name || "").trim();
    const price = Number(payload.price || 0);
    const stock = Number(payload.stock || 0);
    const image = String(payload.image || "").trim();
    const description = String(payload.description || "").trim();

    if (!id || !name) return bad(res, 400, "ID et nom requis");
    if (!Number.isFinite(price) || price < 0) return bad(res, 400, "Prix invalide");
    if (!Number.isFinite(stock) || stock < 0) return bad(res, 400, "Stock invalide");

    const { data, error } = await supabase
      .from("products")
      .insert({ id, name, price, stock, image, description })
      .select("*")
      .single();
    if (error) throw error;

    return ok(res, { product: data });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur création produit");
  }
});

app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return bad(res, 400, "ID manquant");

    const payload = req.body || {};
    const update = {
      ...(payload.name !== undefined ? { name: String(payload.name || "").trim() } : {}),
      ...(payload.price !== undefined ? { price: Number(payload.price || 0) } : {}),
      ...(payload.stock !== undefined ? { stock: Math.floor(Number(payload.stock || 0)) } : {}),
      ...(payload.image !== undefined ? { image: String(payload.image || "").trim() } : {}),
      ...(payload.description !== undefined ? { description: String(payload.description || "").trim() } : {}),
    };

    const { data, error } = await supabase
      .from("products")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return ok(res, { product: data });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur update produit");
  }
});

app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return bad(res, 400, "ID manquant");

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;

    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur suppression produit");
  }
});

// ---------- Testimonials ----------

app.get("/api/testimonials", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("testimonials")
      .select("id,name,rating,body,date_label")
      .eq("approved", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(res, { testimonials: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur témoignages");
  }
});

app.post("/api/testimonials", async (req, res) => {
  try {
    const name      = String(req.body?.name  || "").trim();
    const body      = String(req.body?.body  || "").trim();
    const rating    = Number(req.body?.rating || 0);
    const dateLabel = String(req.body?.date_label || "").trim();

    if (!name)                                         return bad(res, 400, "Nom requis");
    if (!body)                                         return bad(res, 400, "Texte requis");
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
                                                       return bad(res, 400, "Note invalide (1-5)");

    const { data, error } = await supabase
      .from("testimonials")
      .insert({ name, body, rating, date_label: dateLabel, approved: false })
      .select("id")
      .single();
    if (error) throw error;

    return ok(res, { ok: true, id: data.id });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur ajout témoignage");
  }
});

app.get("/api/admin/testimonials/pending", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("testimonials")
      .select("id,name,rating,body,date_label,created_at")
      .eq("approved", false)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(res, { testimonials: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur avis en attente");
  }
});

app.patch("/api/admin/testimonials/:id/approve", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return bad(res, 400, "id manquant");

    const { error } = await supabase
      .from("testimonials")
      .update({ approved: true })
      .eq("id", id);
    if (error) throw error;

    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur approbation");
  }
});

app.delete("/api/admin/testimonials/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return bad(res, 400, "id manquant");

    const { error } = await supabase.from("testimonials").delete().eq("id", id);
    if (error) throw error;

    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur suppression témoignage");
  }
});

// ---------- Admin: reviews ----------
app.delete("/api/admin/reviews/:reviewId", requireAdmin, async (req, res) => {
  try {
    const reviewId = String(req.params.reviewId || "").trim();
    if (!reviewId) return bad(res, 400, "reviewId manquant");

    const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
    if (error) throw error;

    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur suppression avis");
  }
});

app.delete("/api/admin/reviews/product/:productId", requireAdmin, async (req, res) => {
  try {
    const productId = String(req.params.productId || "").trim();
    if (!productId) return bad(res, 400, "productId manquant");

    const { error } = await supabase.from("reviews").delete().eq("product_id", productId);
    if (error) throw error;

    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur suppression avis produit");
  }
});

// ---------- Admin: orders ----------
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const include_done = String(req.query.include_done || "0") === "1";

    let q = supabase
      .from("orders")
      .select("id, total, status, created_at, cart")
      .order("created_at", { ascending: false });

    if (!include_done) q = q.neq("status", "termine");

    const { data, error } = await q;
    if (error) throw error;

    const orders = (data || []).map((o) => ({
      id: o.id,
      total: Number(o.total || 0),
      status: o.status,
      created_at: o.created_at,
      items_count: countItemsInCart(o.cart),
    }));

    return ok(res, { orders });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur chargement commandes");
  }
});

app.get("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return bad(res, 400, "id manquant");

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return bad(res, 404, "Commande introuvable");

    return ok(res, { order: data });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur commande");
  }
});

app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const status = String(req.body?.status || "").trim();

    if (!id) return bad(res, 400, "id manquant");
    if (!["en attente du virement", "preparation", "transit", "termine"].includes(status)) {
      return bad(res, 400, "Statut invalide");
    }

    const { data: order, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    // email client (best-effort)
    // email client (best-effort)
try {
  if (order?.email) {
    const statusLabel =
  status === "en attente du virement" ? "En attente du virement" :
  status === "preparation" ? "En préparation" :
  status === "transit" ? "En transit" :
  "Terminée";


    await sendMail({
      to: order.email,
      subject: `Guadaluz — Commande #${shortId(order.id)} : ${statusLabel}`,
      html: orderStatusEmail({
        orderId: shortId(order.id),
        statusLabel,
      }),
      text: `Commande #${order.id} — Statut : ${statusLabel}`, // fallback simple
    });
  }
} catch (e) {
  console.error("MAIL status error:", e?.message || e);
}


    // Si commande terminée → confirmer et envoyer les cartes cadeaux associées
    if (status === "termine") {
      confirmAndSendGiftCards(id).catch(e =>
        console.error("confirmAndSendGiftCards error:", e.message)
      );
    }

    return ok(res, { ok: true, order });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur update statut");
  }
});

// ---------- Gift Cards ----------

// Valider un code (public — checkout)
app.get("/api/gift-cards/validate/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code) return bad(res, 400, "Code manquant");

    const { data, error } = await supabase
      .from("gift_cards")
      .select("id,code,balance,initial_amount,recipient_email,is_active")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return bad(res, 404, "Code invalide");
    if (!data.is_active || data.balance <= 0) return bad(res, 400, "Cette carte cadeau a déjà été utilisée");

    return ok(res, {
      valid:          true,
      balance:        Number(data.balance),
      initial_amount: Number(data.initial_amount),
    });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur validation");
  }
});

// Cartes reçues (compte utilisateur)
app.get("/api/account/gift-cards/received", requireAuth, async (req, res) => {
  try {
    const email = normalizeEmail(req.user.email);
    const { data, error } = await supabase
      .from("gift_cards")
      .select("id,code,initial_amount,balance,from_name,message,color,send_date,sent_at,is_active,created_at")
      .eq("recipient_email", email)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(res, { gift_cards: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur cartes reçues");
  }
});

// Cartes envoyées (compte utilisateur)
app.get("/api/account/gift-cards/sent", requireAuth, async (req, res) => {
  try {
    const email = normalizeEmail(req.user.email);
    const { data, error } = await supabase
      .from("gift_cards")
      .select("id,code,initial_amount,balance,recipient_email,from_name,send_date,sent_at,is_active,created_at")
      .eq("sender_email", email)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(res, { gift_cards: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur cartes envoyées");
  }
});

// Admin — toutes les cartes
app.get("/api/admin/gift-cards", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("gift_cards")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(res, { gift_cards: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur liste gift cards");
  }
});

// Admin — rechercher un client par email + ses cartes cadeaux
app.get("/api/admin/clients/search", requireAdmin, async (req, res) => {
  try {
    const q = normalizeEmail(req.query?.q || "");
    if (!q || q.length < 3) return bad(res, 400, "Email trop court (min 3 car.)");

    // Profil Supabase Auth (si inscrit)
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .ilike("email", `%${q}%`)
      .limit(10);

    // Cartes cadeaux reçues ou envoyées
    const { data: gcData } = await supabase
      .from("gift_cards")
      .select("id,code,initial_amount,balance,color,recipient_email,sender_email,send_date,sent_at,payment_confirmed,is_active,created_at")
      .or(`recipient_email.ilike.%${q}%,sender_email.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    return ok(res, {
      profiles:    profilesData || [],
      gift_cards:  gcData       || [],
    });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur recherche client");
  }
});

// Admin — déduire un montant d'une carte cadeau
app.patch("/api/admin/gift-cards/:id/deduct", requireAdmin, async (req, res) => {
  try {
    const id     = String(req.params.id || "").trim();
    const amount = Number(req.body?.amount || 0);
    const reason = String(req.body?.reason || "Déduction manuelle admin").trim();

    if (!id)              return bad(res, 400, "id manquant");
    if (amount <= 0)      return bad(res, 400, "Montant invalide (doit être > 0)");

    const { data: gc, error } = await supabase
      .from("gift_cards")
      .select("id,code,balance,is_active")
      .eq("id", id)
      .single();
    if (error || !gc)     return bad(res, 404, "Carte introuvable");
    if (!gc.is_active)    return bad(res, 400, "Carte déjà épuisée");
    if (amount > gc.balance) return bad(res, 400, `Montant supérieur au solde (${gc.balance} €)`);

    const newBalance = Math.round((gc.balance - amount) * 100) / 100;
    await supabase
      .from("gift_cards")
      .update({ balance: newBalance, is_active: newBalance > 0 })
      .eq("id", id);

    console.log(`💳 Admin deduct: ${gc.code} — ${amount}€ (${reason}) → solde: ${newBalance}€`);
    return ok(res, { ok: true, new_balance: newBalance });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur déduction");
  }
});

// Admin — désactiver une carte
app.delete("/api/admin/gift-cards/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const { error } = await supabase.from("gift_cards").update({ is_active: false, balance: 0 }).eq("id", id);
    if (error) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur désactivation");
  }
});

// ---------- Health ----------
app.get("/health", (_req, res) => ok(res, { ok: true }));

app.listen(PORT, () => {
  console.log(`✅ API running on :${PORT}`);
});
