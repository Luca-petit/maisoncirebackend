import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

import { getSupabase } from './supabase.js';
import { sendOrderEmail } from './mailer.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const supabase = getSupabase();

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';

function requireAdmin(req, res, next) {
  const key = req.get('x-admin-key') || '';
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function clampInt(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ------- Products -------
app.get('/api/products', async (_req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,stock,desc,image,updated_at')
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ products: data || [] });
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const { id, name, price, stock, desc, image } = req.body || {};
  const pid = String(id || '').trim();
  if (!pid) return res.status(400).json({ error: 'id required' });
  const payload = {
    id: pid,
    name: String(name || '').trim() || pid,
    price: Number(price || 0),
    stock: clampInt(stock || 0, 0, 10_000),
    desc: String(desc || ''),
    image: String(image || '') || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('products').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ product: data });
});

app.patch('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const pid = String(req.params.id || '').trim();
  if (!pid) return res.status(400).json({ error: 'bad id' });

  const { name, price, stock, desc, image } = req.body || {};
  const payload = {
    updated_at: new Date().toISOString()
  };
  if (name !== undefined) payload.name = String(name || '').trim();
  if (price !== undefined) payload.price = Number(price || 0);
  if (stock !== undefined) payload.stock = clampInt(stock || 0, 0, 10_000);
  if (desc !== undefined) payload.desc = String(desc || '');
  if (image !== undefined) payload.image = String(image || '') || null;

  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', pid)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ product: data });
});

// ------- Reviews -------
app.get('/api/reviews/summary', async (_req, res) => {
  // aggregate in SQL (supabase RPC not needed): fetch ratings then reduce
  const { data, error } = await supabase
    .from('reviews')
    .select('product_id,rating');
  if (error) return res.status(500).json({ error: error.message });

  const summary = {};
  for (const r of (data || [])) {
    const pid = r.product_id;
    if (!summary[pid]) summary[pid] = { sum: 0, count: 0 };
    summary[pid].sum += Number(r.rating) || 0;
    summary[pid].count += 1;
  }
  const out = {};
  for (const [pid, v] of Object.entries(summary)) {
    out[pid] = { avg: v.count ? v.sum / v.count : 0, count: v.count };
  }
  res.json({ summary: out });
});

app.get('/api/reviews/:productId', async (req, res) => {
  const pid = String(req.params.productId || '').trim();
  const { data, error } = await supabase
    .from('reviews')
    .select('id,name,rating,text,created_at')
    .eq('product_id', pid)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reviews: data || [] });
});

app.post('/api/reviews/:productId', async (req, res) => {
  const pid = String(req.params.productId || '').trim();
  const name = String(req.body?.name || '').trim();
  const rating = clampInt(req.body?.rating, 1, 5);
  const text = String(req.body?.text || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  const { data, error } = await supabase
    .from('reviews')
    .insert({ product_id: pid, name, rating, text: text || null })
    .select('id,name,rating,text,created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ review: data });
});

// ------- Notify subscriptions -------
app.post('/api/notify/:productId', async (req, res) => {
  const pid = String(req.params.productId || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email invalid' });

  const { error } = await supabase
    .from('notify_subscriptions')
    .upsert({ product_id: pid, email }, { onConflict: 'product_id,email' });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

app.delete('/api/notify/:productId', async (req, res) => {
  const pid = String(req.params.productId || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email invalid' });

  const { error } = await supabase
    .from('notify_subscriptions')
    .delete()
    .eq('product_id', pid)
    .eq('email', email);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// ------- Cart -------
app.post('/api/cart/init', async (_req, res) => {
  const session_id = crypto.randomUUID();
  const { error } = await supabase.from('carts').insert({ session_id, cart: { skus: {}, packs: [], giftcards: [] } });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ session_id });
});

app.get('/api/cart/:sessionId', async (req, res) => {
  const sid = String(req.params.sessionId || '').trim();
  const { data, error } = await supabase.from('carts').select('cart,updated_at').eq('session_id', sid).single();
  if (error) return res.status(404).json({ error: 'cart not found' });
  res.json({ cart: data.cart });
});

app.put('/api/cart/:sessionId', async (req, res) => {
  const sid = String(req.params.sessionId || '').trim();
  const cart = req.body?.cart;
  if (!cart || typeof cart !== 'object') return res.status(400).json({ error: 'cart required' });

  const { data, error } = await supabase
    .from('carts')
    .upsert({ session_id: sid, cart, updated_at: new Date().toISOString() })
    .select('cart')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ cart: data.cart });
});

// ------- Checkout: create order + (optional) email -------
app.post('/api/checkout/:sessionId', async (req, res) => {
  const sid = String(req.params.sessionId || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email invalid' });

  const { data: cartRow, error: cartErr } = await supabase
    .from('carts')
    .select('cart')
    .eq('session_id', sid)
    .single();

  if (cartErr) return res.status(404).json({ error: 'cart not found' });
  const cart = cartRow.cart || {};

  // compute total server-side from products
  const { data: prod, error: prodErr } = await supabase.from('products').select('id,price').in('id', Object.keys(cart.skus || {}));
  if (prodErr) return res.status(500).json({ error: prodErr.message });
  const priceMap = Object.fromEntries((prod || []).map(p => [p.id, Number(p.price) || 0]));

  let total = 0;
  for (const [id, qty] of Object.entries(cart.skus || {})) {
    total += (priceMap[id] || 0) * (Number(qty) || 0);
  }
  // packs & giftcards already include totals in cart object (as front computes)
  for (const pack of (cart.packs || [])) total += Number(pack.total || 0);
  for (const gc of (cart.giftcards || [])) total += Number(gc.amount || 0);
  total = Math.round(total * 100) / 100;

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({ session_id: sid, email, cart, total })
    .select('id,created_at,total')
    .single();

  if (orderErr) return res.status(500).json({ error: orderErr.message });

  const subject = `Confirmation de commande — Maison Cire`;
  const text = `Merci pour votre commande !\n\nTotal: ${order.total} €\nCommande: ${order.id}`;
  const html = `<p>Merci pour votre commande !</p><p><strong>Total:</strong> ${order.total} €</p><p><strong>Commande:</strong> ${order.id}</p>`;
  await sendOrderEmail({ to: email, subject, html, text });

  res.json({ order });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
