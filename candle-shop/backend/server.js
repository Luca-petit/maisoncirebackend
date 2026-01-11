// Maison Cire — backend/server.js (clean)
// ✅ Products + Cart + Orders + Reviews + Notify + Admin + Auth (email/password)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { supabase } from './supabase.js';
import { sendMail } from './mailer.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;

// ---------- Config ----------
const ADMIN_KEY = (process.env.ADMIN_KEY || '').trim();
const JWT_SECRET = (process.env.JWT_SECRET || 'dev_jwt_secret_change_me').trim();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

// ---------- Small utils ----------
function ok(res, payload) {
  res.json(payload);
}

function bad(res, status, message) {
  res.status(status).json({ error: message });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function countItemsInCart(cart) {
  if (!cart || typeof cart !== 'object') return 0;
  const skus = cart.skus && typeof cart.skus === 'object' ? cart.skus : {};
  const packs = Array.isArray(cart.packs) ? cart.packs : [];
  const giftcards = Array.isArray(cart.giftcards) ? cart.giftcards : [];
  return Object.values(skus).reduce((a, b) => a + (Number(b) || 0), 0) + packs.length + giftcards.length;
}

// ---------- Auth (JWT) ----------
function signToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function readBearer(req) {
  const h = String(req.headers.authorization || '');
  if (!h.toLowerCase().startsWith('bearer ')) return '';
  return h.slice(7).trim();
}

function looksLikeJwt(s) {
  const parts = String(s || '').split('.');
  return parts.length === 3 && parts.every(Boolean);
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
  // 1) Authorization: Bearer <jwt>
  const bearer = readBearer(req);
  const p1 = verifyToken(bearer);
  if (p1) return p1;

  // 2) Compatibility: x-admin-key might contain a JWT
  const x = String(req.headers['x-admin-key'] || '').trim();
  if (looksLikeJwt(x)) {
    const p2 = verifyToken(x);
    if (p2) return p2;
  }

  return null;
}

function requireAuth(req, res, next) {
  const u = getAuthUser(req);
  if (!u?.email) return bad(res, 401, 'Non connecté');
  req.user = u;
  next();
}

function requireAdmin(req, res, next) {
  // legacy admin key
  const key = String(req.headers['x-admin-key'] || '').trim();
  if (ADMIN_KEY && key && key === ADMIN_KEY) return next();

  // jwt admin
  const u = getAuthUser(req);
  if (u?.role === 'admin') {
    req.user = u;
    return next();
  }
  return bad(res, 401, 'Admin requis');
}

// ---------- Auth routes ----------
app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !email.includes('@')) return bad(res, 400, 'Email invalide');
    if (password.length < 6) return bad(res, 400, 'Mot de passe trop court (min 6)');

    const { data: existing, error: exErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing?.id) return bad(res, 409, 'Un compte existe déjà avec cet email');

    const password_hash = await bcrypt.hash(password, 10);
    const { data: created, error: cErr } = await supabase
      .from('users')
      .insert({ email, password_hash, role: 'user' })
      .select('id,email,role')
      .single();
    if (cErr) throw cErr;

    const token = signToken(created);
    return ok(res, { token, user: { email: created.email, role: created.role } });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur signup');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) return bad(res, 400, 'Email et mot de passe requis');

    const { data: user, error } = await supabase
      .from('users')
      .select('id,email,role,password_hash')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!user?.id) return bad(res, 401, 'Identifiants invalides');

    const okPwd = await bcrypt.compare(password, user.password_hash || '');
    if (!okPwd) return bad(res, 401, 'Identifiants invalides');

    const token = signToken(user);
    return ok(res, { token, user: { email: user.email, role: user.role } });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur login');
  }
});

app.get('/api/auth/me', (req, res) => {
  const u = getAuthUser(req);
  if (!u?.email) return bad(res, 401, 'Non connecté');
  return ok(res, { user: { email: u.email, role: u.role || 'user' } });
});

// Orders for logged-in user (by email)
app.get('/api/account/orders', requireAuth, async (req, res) => {
  try {
    const email = normalizeEmail(req.user.email);
    const { data, error } = await supabase
      .from('orders')
      .select('id, email, total, status, created_at, delivery_mode, payment_mode, cart')
      .eq('email', email)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok(res, { orders: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur chargement commandes');
  }
});

// ---------- Products ----------
app.get('/api/products', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ok(res, { products: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur produits');
  }
});

// ---------- Cart ----------
app.post('/api/cart/init', async (_req, res) => {
  try {
    const session_id = `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const { error } = await supabase.from('carts').insert({ session_id });
    if (error) throw error;
    return ok(res, { session_id });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur init panier');
  }
});

app.get('/api/cart/:sessionId', async (req, res) => {
  try {
    const sid = String(req.params.sessionId || '').trim();
    if (!sid) return bad(res, 400, 'sessionId manquant');

    const { data, error } = await supabase
      .from('carts')
      .select('cart')
      .eq('session_id', sid)
      .maybeSingle();
    if (error) throw error;

    return ok(res, { cart: data?.cart || null });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur panier');
  }
});

app.put('/api/cart/:sessionId', async (req, res) => {
  try {
    const sid = String(req.params.sessionId || '').trim();
    const cart = req.body?.cart;
    if (!sid) return bad(res, 400, 'sessionId manquant');
    if (!cart || typeof cart !== 'object') return bad(res, 400, 'Cart invalide');

    const { error } = await supabase
      .from('carts')
      .upsert({ session_id: sid, cart, updated_at: new Date().toISOString() });
    if (error) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur maj panier');
  }
});

// ---------- Orders ----------
app.post('/api/orders', async (req, res) => {
  try {
    const session_id = String(req.body?.session_id || '').trim();
    const email = normalizeEmail(req.body?.email);
    const cart = req.body?.cart;

    const phone = String(req.body?.phone || '').trim() || null;
    const delivery_mode = String(req.body?.delivery_mode || 'pickup').trim();
    const payment_mode = String(req.body?.payment_mode || 'transfer').trim();
    const address = req.body?.address && typeof req.body.address === 'object' ? req.body.address : null;
    const delivery_fee = Number(req.body?.delivery_fee || 0) || 0;
    const status = String(req.body?.status || 'preparation');

    const total = Number(req.body?.total || 0) || 0;
    if (!email || !email.includes('@')) return bad(res, 400, 'Email invalide');
    if (!cart || typeof cart !== 'object') return bad(res, 400, 'Panier invalide');

    const { data, error } = await supabase
      .from('orders')
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
      .select('id')
      .single();
    if (error) throw error;

    // (optionnel) email client
    // await sendMail({ to: email, subject: 'Commande reçue', text: `Merci ! Votre commande #${data.id} est enregistrée.` });

    return ok(res, { ok: true, order_id: data?.id });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur création commande');
  }
});

// ---------- Reviews ----------
app.get('/api/reviews/summary', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('product_id,rating');
    if (error) throw error;

    const summary = {};
    for (const r of (data || [])) {
      const pid = r.product_id;
      const rating = Number(r.rating) || 0;
      if (!summary[pid]) summary[pid] = { sum: 0, count: 0 };
      summary[pid].sum += rating;
      summary[pid].count += 1;
    }
    const out = {};
    for (const [pid, v] of Object.entries(summary)) {
      out[pid] = {
        avg: v.count ? v.sum / v.count : 0,
        count: v.count,
      };
    }

    return ok(res, { summary: out });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur summary avis');
  }
});

app.get('/api/reviews/:productId', async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!productId) return bad(res, 400, 'productId manquant');

    const { data, error } = await supabase
      .from('reviews')
      .select('id,product_id,name,rating,text,created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok(res, { reviews: data || [] });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur avis');
  }
});

app.post('/api/reviews/:productId', async (req, res) => {
  try {
    const product_id = String(req.params.productId || '').trim();
    const name = String(req.body?.name || '').trim();
    const rating = Number(req.body?.rating || 0);
    const text = String(req.body?.text || '').trim();

    if (!product_id) return bad(res, 400, 'productId manquant');
    if (!name) return bad(res, 400, 'Nom requis');
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return bad(res, 400, 'Note invalide');

    const { data, error } = await supabase
      .from('reviews')
      .insert({ product_id, name, rating, text })
      .select('id,product_id,name,rating,text,created_at')
      .single();
    if (error) throw error;
    return ok(res, { review: data });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur ajout avis');
  }
});

// ---------- Notify ----------
app.post('/api/notify/:productId', async (req, res) => {
  try {
    const product_id = String(req.params.productId || '').trim();
    const email = normalizeEmail(req.body?.email);
    if (!product_id) return bad(res, 400, 'productId manquant');
    if (!email || !email.includes('@')) return bad(res, 400, 'Email invalide');

    const { error } = await supabase
      .from('notify_subscriptions')
      .insert({ product_id, email });
    if (error && !String(error.message || '').includes('duplicate')) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur subscribe');
  }
});

app.delete('/api/notify/:productId', async (req, res) => {
  try {
    const product_id = String(req.params.productId || '').trim();
    const email = normalizeEmail(req.body?.email);
    if (!product_id) return bad(res, 400, 'productId manquant');
    if (!email || !email.includes('@')) return bad(res, 400, 'Email invalide');

    const { error } = await supabase
      .from('notify_subscriptions')
      .delete()
      .eq('product_id', product_id)
      .eq('email', email);
    if (error) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur unsubscribe');
  }
});

// ---------- Admin: products ----------
app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const id = String(payload.id || '').trim();
    const name = String(payload.name || '').trim();
    const price = Number(payload.price || 0);
    const stock = Number(payload.stock || 0);
    const image = String(payload.image || '').trim();
    const description = String(payload.description || '').trim();

    if (!id || !name) return bad(res, 400, 'ID et nom requis');
    if (!Number.isFinite(price) || price < 0) return bad(res, 400, 'Prix invalide');
    if (!Number.isFinite(stock) || stock < 0) return bad(res, 400, 'Stock invalide');

    const { data, error } = await supabase
      .from('products')
      .insert({ id, name, price, stock, image, description })
      .select('*')
      .single();
    if (error) throw error;
    return ok(res, { product: data });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur création produit');
  }
});

app.patch('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return bad(res, 400, 'ID manquant');

    const payload = req.body || {};
    const update = {
      ...(payload.name !== undefined ? { name: String(payload.name || '').trim() } : {}),
      ...(payload.price !== undefined ? { price: Number(payload.price || 0) } : {}),
      ...(payload.stock !== undefined ? { stock: Math.floor(Number(payload.stock || 0)) } : {}),
      ...(payload.image !== undefined ? { image: String(payload.image || '').trim() } : {}),
      ...(payload.description !== undefined ? { description: String(payload.description || '').trim() } : {}),
    };

    const { data, error } = await supabase
      .from('products')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return ok(res, { product: data });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur update produit');
  }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return bad(res, 400, 'ID manquant');
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur suppression produit');
  }
});

// ---------- Admin: reviews ----------
app.delete('/api/admin/reviews/:reviewId', requireAdmin, async (req, res) => {
  try {
    const reviewId = String(req.params.reviewId || '').trim();
    if (!reviewId) return bad(res, 400, 'reviewId manquant');
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
    if (error) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur suppression avis');
  }
});

app.delete('/api/admin/reviews/product/:productId', requireAdmin, async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!productId) return bad(res, 400, 'productId manquant');
    const { error } = await supabase.from('reviews').delete().eq('product_id', productId);
    if (error) throw error;
    return ok(res, { ok: true });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur suppression avis produit');
  }
});

// ---------- Admin: orders ----------
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const include_done = String(req.query.include_done || '0') === '1';
    let q = supabase
      .from('orders')
      .select('id, total, status, created_at, cart')
      .order('created_at', { ascending: false });
    if (!include_done) q = q.neq('status', 'termine');
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
    return bad(res, 500, e?.message || 'Erreur chargement commandes');
  }
});

app.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return bad(res, 400, 'id manquant');

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return bad(res, 404, 'Commande introuvable');
    return ok(res, { order: data });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur commande');
  }
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!id) return bad(res, 400, 'id manquant');
    if (!['preparation', 'transit', 'termine'].includes(status)) {
      return bad(res, 400, 'Statut invalide');
    }

    const { data: order, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    // email client (best-effort)
    try {
      if (order?.email) {
        await sendMail({
          to: order.email,
          subject: `Mise à jour de votre commande #${order.id}`,
          text: `Statut : ${status}`,
        });
      }
    } catch (_) {}

    return ok(res, { ok: true, order });
  } catch (e) {
    return bad(res, 500, e?.message || 'Erreur update statut');
  }
});

// ---------- Health ----------
app.get('/health', (_req, res) => ok(res, { ok: true }));

app.listen(PORT, () => {
  console.log(`✅ API running on :${PORT}`);
});

