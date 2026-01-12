// Maison Cire — backend/server.js (clean)
// ✅ Products + Cart + Orders + Reviews + Notify + Admin + Auth (email/password)

import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { supabase } from "./supabase.js";
import { sendMail } from "./mailer.js";

import { orderConfirmationEmail } from "./emails/orderConfirmation.js";
import { adminNewOrderEmail } from "./emails/adminNewOrder.js";
import { orderStatusEmail } from "./emails/orderStatus.js";



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

// Construit un tableau HTML avec les articles (singles + packs)
async function buildOrderItemsHtml(cart) {
  const skus = (cart && typeof cart === "object" && cart.skus && typeof cart.skus === "object")
    ? cart.skus
    : {};
  const packs = Array.isArray(cart?.packs) ? cart.packs : [];

  const ids = new Set();

  // singles
  for (const pid of Object.keys(skus)) ids.add(String(pid));

  // packs
  for (const pack of packs) {
    for (const it of (Array.isArray(pack?.items) ? pack.items : [])) {
      if (it?.id) ids.add(String(it.id));
    }
  }

  // rien à afficher
  if (ids.size === 0) {
    return `<p style="margin:0;color:#666;">Aucun article.</p>`;
  }

  // charge les produits concernés
  const { data: prods, error } = await supabase
    .from("products")
    .select("id,name,price")
    .in("id", Array.from(ids));

  if (error) throw error;

  const byId = Object.fromEntries((prods || []).map(p => [String(p.id), p]));

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

function computeFreeUnitsSingles(qty) {
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const group5 = Math.floor(q / 5);
  const rem = q % 5;
  const group3 = Math.floor(rem / 3);
  return group5 * 2 + group3 * 1;
}

// ---------- Auth (JWT) ----------
function signToken(user) {
  const payload = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function readBearer(req) {
  const h = String(req.headers.authorization || "");
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}
function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
function getAuthUser(req) {
  // Authorization: Bearer <jwt>
  const bearer = readBearer(req);
  const p1 = verifyToken(bearer);
  if (p1?.email) return p1;

  // Compat: x-admin-key contains jwt (for your existing app.js calls)
  const x = String(req.headers["x-admin-key"] || "").trim();
  const p2 = verifyToken(x);
  if (p2?.email) return p2;

  return null;
}

function requireAuth(req, res, next) {
  const u = getAuthUser(req);
  if (!u?.email) return bad(res, 401, "Non connecté");
  req.user = u;
  next();
}

async function requireAdmin(req, res, next) {
  const u = getAuthUser(req);
  if (!u?.email) return bad(res, 401, "Non connecté");

  // ✅ IMPORTANT : on re-check en DB, comme ça si tu changes role à la main, ça marche sans re-login
  try {
    const email = normalizeEmail(u.email);
    const { data, error } = await supabase
      .from("users")
      .select("role")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;

    const role = data?.role || u.role || "user";
    if (role !== "admin") return bad(res, 401, "Admin requis");

    req.user = { ...u, role };
    return next();
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur auth admin");
  }
}

// ---------- Auth routes ----------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !email.includes("@")) return bad(res, 400, "Email invalide");
    if (password.length < 6) return bad(res, 400, "Mot de passe trop court (min 6)");

    const { data: existing, error: exErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing?.id) return bad(res, 409, "Un compte existe déjà avec cet email");

    const password_hash = await bcrypt.hash(password, 10);

    const { data: created, error: cErr } = await supabase
      .from("users")
      .insert({ email, password_hash, role: "user" })
      .select("id,email,role")
      .single();
    if (cErr) throw cErr;

    const token = signToken(created);
    return ok(res, { token, user: { email: created.email, role: created.role } });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur signup");
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) return bad(res, 400, "Email et mot de passe requis");

    const { data: user, error } = await supabase
      .from("users")
      .select("id,email,role,password_hash")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    if (!user?.id) return bad(res, 401, "Identifiants invalides");

    const okPwd = await bcrypt.compare(password, user.password_hash || "");
    if (!okPwd) return bad(res, 401, "Identifiants invalides");

    const token = signToken(user);
    return ok(res, { token, user: { email: user.email, role: user.role } });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur login");
  }
});

// ✅ refresh role from DB (important when you set admin manually)
app.get("/api/auth/me", async (req, res) => {
  const u = getAuthUser(req);
  if (!u?.email) return bad(res, 401, "Non connecté");

  try {
    const email = normalizeEmail(u.email);
    const { data, error } = await supabase
      .from("users")
      .select("email,role")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;

    const role = data?.role || u.role || "user";
    return ok(res, { user: { email, role } });
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
app.post("/api/cart/init", async (_req, res) => {
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


    const total = Number(req.body?.total || 0) || 0;
    if (!email || !email.includes("@")) return bad(res, 400, "Email invalide");
    if (!cart || typeof cart !== "object") return bad(res, 400, "Panier invalide");

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

// --- Décrément stock en DB (singles + packs) ---
try {
  const skus = (cart && typeof cart === "object" && cart.skus && typeof cart.skus === "object")
    ? cart.skus
    : {};

  const packs = Array.isArray(cart?.packs) ? cart.packs : [];

  // 1) build { id -> qtyToRemove }
  const toDec = {};

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

  const ids = Object.keys(toDec);
  if (ids.length) {
    // 2) fetch all stocks in one query
    const { data: rows, error: readErr } = await supabase
      .from("products")
      .select("id,stock")
      .in("id", ids);

    if (readErr) throw readErr;

    const foundIds = new Set((rows || []).map(r => String(r.id)));
    const missing = ids.filter(id => !foundIds.has(id));
    if (missing.length) {
      console.error("STOCK decrement: produits introuvables:", missing);
    }

    // 3) update each found row
    for (const r of (rows || [])) {
      const pid = String(r.id);
      const current = Number(r.stock || 0);
      const q = Number(toDec[pid] || 0);
      const next = Math.max(0, current - q);

      const { error: upErr } = await supabase
        .from("products")
        .update({ stock: next })
        .eq("id", pid);

      if (upErr) throw upErr;
    }

    console.log("✅ STOCK decremented:", toDec);
  } else {
    console.log("ℹ️ STOCK decrement: rien à décrémenter (panier vide?)");
  }
} catch (e) {
  console.error("❌ STOCK decrement error:", e?.message || e);
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
      <p style="margin:0 0 6px;"><strong>Titulaire :</strong> ${owner || "Maison Cire"}</p>
      <p style="margin:0 0 6px;"><strong>IBAN :</strong> ${iban}</p>
      ${bic ? `<p style="margin:0;"><strong>BIC :</strong> ${bic}</p>` : ""}
    </div>
  `
  : "";

// email client (best-effort)
try {
  await sendMail({
    to: email,
    subject: `Maison Cire — Confirmation de commande #${data.id}`,
    html: orderConfirmationEmail({
      orderId: data.id,
      total: Number(total || 0).toFixed(2),
      deliveryLabel,
      paymentLabel,
      itemsHtml,
      ibanHtml,
    }),
  });
} catch (e) {
  console.error("MAIL client error:", e?.message || e);
}

// email admin (best-effort)
try {
  const adminTo = process.env.ADMIN_EMAIL;
  if (adminTo) {
    await sendMail({
      to: adminTo,
      subject: `Nouvelle commande #${data.id}`,
      html: adminNewOrderEmail({
        orderId: data.id,
        email,
        total: Number(total || 0).toFixed(2),
        deliveryLabel,
        paymentLabel,
        itemsHtml,
      }),
    });
  }
} catch (e) {
  console.error("MAIL admin error:", e?.message || e);
}


    return ok(res, { ok: true, order_id: data?.id });
  } catch (e) {
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
      subject: `Maison Cire — Commande #${order.id} : ${statusLabel}`,
      html: orderStatusEmail({
        orderId: order.id,
        statusLabel,
      }),
      text: `Commande #${order.id} — Statut : ${statusLabel}`, // fallback simple
    });
  }
} catch (e) {
  console.error("MAIL status error:", e?.message || e);
}


    return ok(res, { ok: true, order });
  } catch (e) {
    return bad(res, 500, e?.message || "Erreur update statut");
  }
});

// ---------- Health ----------
app.get("/health", (_req, res) => ok(res, { ok: true }));

app.listen(PORT, () => {
  console.log(`✅ API running on :${PORT}`);
});
