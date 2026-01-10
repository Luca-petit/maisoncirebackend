// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- ENV --------------------
const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Clé admin (doit matcher ton front qui envoie "x-admin-key")
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";

// Mail (optionnel)
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

// -------------------- SUPABASE --------------------
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -------------------- HELPERS --------------------
function requireAdmin(req, res, next) {
  const key = String(req.headers["x-admin-key"] || "").trim();
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function safeCart(obj) {
  if (!obj || typeof obj !== "object") return { skus: {}, packs: [], giftcards: [] };
  return {
    skus: obj.skus && typeof obj.skus === "object" ? obj.skus : {},
    packs: Array.isArray(obj.packs) ? obj.packs : [],
    giftcards: Array.isArray(obj.giftcards) ? obj.giftcards : [],
  };
}

function countItems(cart) {
  const c = safeCart(cart);
  const singles = Object.values(c.skus).reduce((a, b) => a + (Number(b) || 0), 0);
  return singles + c.packs.length + c.giftcards.length;
}

async function sendOrderEmail({ to, subject, html, text }) {
  // Email optionnel : si pas configuré, on skip
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text: text || "",
    html: html || "",
  });
}

// -------------------- HEALTH --------------------
app.get("/", (req, res) => res.json({ ok: true }));

// =======================================================
// PRODUCTS
// =======================================================
app.get("/api/products", async (req, res) => {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ products: data || [] });
});

// Admin: create product
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const payload = req.body || {};
  if (!payload?.id || !payload?.name) {
    return res.status(400).json({ error: "id + name requis" });
  }

  const { data, error } = await supabase
    .from("products")
    .insert([payload])
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ product: data });
});

// Admin: patch product
app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const patch = req.body || {};
  if (!id) return res.status(400).json({ error: "bad id" });

  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) return res.status(500).json({ error: error?.message || "update failed" });
  res.json({ product: data });
});

// Admin: delete product
app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "bad id" });

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// =======================================================
// REVIEWS
// =======================================================
app.get("/api/reviews/summary", async (req, res) => {
  // Retourne un map { [productId]: {avg, count} }
  const { data, error } = await supabase
    .from("reviews")
    .select("product_id,rating");

  if (error) return res.status(500).json({ error: error.message });

  const summary = {};
  for (const r of data || []) {
    const pid = r.product_id;
    if (!summary[pid]) summary[pid] = { sum: 0, count: 0 };
    summary[pid].sum += Number(r.rating) || 0;
    summary[pid].count += 1;
  }

  const out = {};
  for (const [pid, v] of Object.entries(summary)) {
    out[pid] = {
      avg: v.count ? v.sum / v.count : 0,
      count: v.count,
    };
  }

  res.json({ summary: out });
});

app.get("/api/reviews/:productId", async (req, res) => {
  const productId = String(req.params.productId || "").trim();

  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ reviews: data || [] });
});

app.post("/api/reviews/:productId", async (req, res) => {
  const productId = String(req.params.productId || "").trim();
  const { name, rating, text } = req.body || {};

  if (!name || !rating) {
    return res.status(400).json({ error: "name + rating requis" });
  }

  const payload = {
    product_id: productId,
    name: String(name).trim(),
    rating: Number(rating),
    text: String(text || ""),
  };

  const { data, error } = await supabase
    .from("reviews")
    .insert([payload])
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ review: data });
});

// Admin reviews: delete one
app.delete("/api/admin/reviews/:reviewId", requireAdmin, async (req, res) => {
  const reviewId = String(req.params.reviewId || "").trim();
  if (!reviewId) return res.status(400).json({ error: "bad id" });

  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// Admin reviews: clear by product
app.delete("/api/admin/reviews/product/:productId", requireAdmin, async (req, res) => {
  const productId = String(req.params.productId || "").trim();
  if (!productId) return res.status(400).json({ error: "bad product id" });

  const { error } = await supabase.from("reviews").delete().eq("product_id", productId);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// ------- Checkout: create order -------
app.post("/api/checkout/:sessionId", async (req, res) => {
  try {
    const sid = String(req.params.sessionId || "").trim();

    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim() || null;

    // delivery_mode: 'pickup' | 'shipping'
    const delivery_mode = String(req.body?.delivery_mode || "pickup").trim();
    // payment_mode: 'cash' | 'transfer'
    const payment_mode = String(req.body?.payment_mode || "transfer").trim();

    const address = req.body?.address && typeof req.body.address === "object" ? req.body.address : null;
    const delivery_fee = Number(req.body?.delivery_fee || 0) || 0;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "email invalid" });
    }

    // (optionnel) validations basiques
    if (!["pickup", "shipping"].includes(delivery_mode)) {
      return res.status(400).json({ error: "delivery_mode invalid" });
    }
    if (!["cash", "transfer"].includes(payment_mode)) {
      return res.status(400).json({ error: "payment_mode invalid" });
    }

    // 1) récup panier depuis carts
    const { data: cartRow, error: cartErr } = await supabase
      .from("carts")
      .select("cart")
      .eq("session_id", sid)
      .single();

    if (cartErr) return res.status(404).json({ error: "cart not found" });

    const cart = cartRow?.cart || { skus: {}, packs: [], giftcards: [] };

    // 2) total server-side
    const skuIds = Object.keys(cart.skus || {});
    let priceMap = {};

    if (skuIds.length) {
      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .select("id,price")
        .in("id", skuIds);

      if (prodErr) return res.status(500).json({ error: prodErr.message });

      priceMap = Object.fromEntries((prod || []).map(p => [p.id, Number(p.price) || 0]));
    }

    let total = 0;

    // singles
    for (const [id, qty] of Object.entries(cart.skus || {})) {
      total += (priceMap[id] || 0) * (Number(qty) || 0);
    }

    // packs: on prend pack.total si présent sinon pack.value - pack.free
    for (const pack of (cart.packs || [])) {
      const packTotal = Number(pack.total ?? ((Number(pack.value || 0) - Number(pack.free || 0)))) || 0;
      total += packTotal;
    }

    // giftcards
    for (const gc of (cart.giftcards || [])) total += Number(gc.amount || 0);

    // frais livraison
    total += delivery_fee;

    total = Math.round(total * 100) / 100;

    // 3) insert order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        session_id: sid,
        email,
        phone,
        delivery_mode,
        payment_mode,
        address,
        delivery_fee,
        status: "preparation",
        cart,
        total,
      })
      .select("id,created_at,total,status")
      .single();

    if (orderErr) return res.status(500).json({ error: orderErr.message });

    // (optionnel) vider le panier après commande
    // await supabase.from("carts").update({ cart: { skus:{}, packs:[], giftcards:[] }, updated_at: new Date().toISOString() }).eq("session_id", sid);

    res.json({ order });
  } catch (e) {
    res.status(500).json({ error: e?.message || "server error" });
  }
});


// =======================================================
// NOTIFY (stock alert)
// =======================================================
app.post("/api/notify/:productId", async (req, res) => {
  const productId = String(req.params.productId || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();

  if (!email) return res.status(400).json({ error: "email requis" });

  const payload = { product_id: productId, email };

  const { data, error } = await supabase
    .from("notify")
    .upsert([payload], { onConflict: "product_id,email" })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, row: data });
});

app.delete("/api/notify/:productId", async (req, res) => {
  const productId = String(req.params.productId || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();

  if (!email) return res.status(400).json({ error: "email requis" });

  const { error } = await supabase
    .from("notify")
    .delete()
    .eq("product_id", productId)
    .eq("email", email);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// =======================================================
// CART (session-based)
// Table attendue: carts { session_id (text), cart (jsonb), updated_at }
// =======================================================
app.post("/api/cart/init", async (req, res) => {
  const session_id = crypto.randomUUID();

  const empty = { skus: {}, packs: [], giftcards: [] };

  const { error } = await supabase
    .from("carts")
    .insert([{ session_id, cart: empty }]);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ session_id });
});

app.get("/api/cart/:sid", async (req, res) => {
  const sid = String(req.params.sid || "").trim();
  if (!sid) return res.status(400).json({ error: "bad sid" });

  const { data, error } = await supabase
    .from("carts")
    .select("cart")
    .eq("session_id", sid)
    .single();

  if (error || !data) return res.status(404).json({ error: "cart not found" });
  res.json({ cart: safeCart(data.cart) });
});

app.put("/api/cart/:sid", async (req, res) => {
  const sid = String(req.params.sid || "").trim();
  const cart = safeCart(req.body?.cart);

  const { data, error } = await supabase
    .from("carts")
    .update({ cart, updated_at: new Date().toISOString() })
    .eq("session_id", sid)
    .select("cart")
    .single();

  if (error || !data) return res.status(500).json({ error: error?.message || "update failed" });
  res.json({ cart: safeCart(data.cart) });
});

// =======================================================
// ORDERS (ADMIN)
// Table attendue: orders { id (uuid), created_at, total, status, cart(jsonb), email, delivery_mode, payment_mode }
// =======================================================
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  const status = String(req.query?.status || "").trim();

  let q = supabase
    .from("orders")
    .select("id,created_at,total,status,cart")
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const orders = (data || []).map((o) => ({
    id: o.id,
    created_at: o.created_at,
    total: Number(o.total || 0),
    status: o.status || "preparation",
    items_count: countItems(o.cart),
  }));

  res.json({ orders });
});

app.get("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "bad id" });

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return res.status(404).json({ error: "order not found" });
  res.json({ order: data });
});

app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const status = String(req.body?.status || "").trim();

  const allowed = new Set(["preparation", "transit", "termine"]);
  if (!allowed.has(status)) return res.status(400).json({ error: "bad status" });

  const { data, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) return res.status(404).json({ error: error?.message || "order not found" });

  // Email best-effort
  try {
    if (data.email) {
      const subject = "Mise à jour de votre commande — Maison Cire";
      const text = `Votre commande ${data.id} est maintenant : ${status}.`;
      const html = `<p>Votre commande <strong>${data.id}</strong> est maintenant : <strong>${status}</strong>.</p>`;
      await sendOrderEmail({ to: data.email, subject, text, html });
    }
  } catch (_) {}

  res.json({ ok: true, order: data });
});

// =======================================================
// START
// =======================================================
app.listen(PORT, () => {
  console.log(`✅ API listening on port ${PORT}`);
});
