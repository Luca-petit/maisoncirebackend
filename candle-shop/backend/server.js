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
  const key = String(req.get('x-admin-key') || '').trim();
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
    .select('id,name,price,stock,description,image,updated_at')
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ products: data || [] });
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const { id, name, price, stock, description, image } = req.body || {};
  const pid = String(id || '').trim();
  if (!pid) return res.status(400).json({ error: 'id required' });
  const payload = {
    id: pid,
    name: String(name || '').trim() || pid,
    price: Number(price || 0),
    stock: clampInt(stock || 0, 0, 10_000),
    description: String(description || ''),
    image: String(image || '') || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('products').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ product: data });
});




app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const pid = String(req.params.id || '').trim();
  const { error } = await supabase.from('products').delete().eq('id', pid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

async function notifyBackInStock(productId) {
  // 1) récupérer tous les emails abonnés à ce produit
  const { data: subs, error: subErr } = await supabase
    .from('notify_subscriptions')
    .select('email')
    .eq('product_id', productId);

  if (subErr) throw new Error(subErr.message);
  if (!subs || subs.length === 0) return { sent: 0 };

  // 2) envoyer un email à chacun
  const subject = `Bonne nouvelle : "${productId}" est de retour en stock !`;
  const text = `Le produit "${productId}" est à nouveau disponible sur Maison Cire.`;
  const html = `<p>Le produit <strong>${productId}</strong> est à nouveau disponible sur Maison Cire.</p>`;

  // envoi en parallèle
  await Promise.all(
    subs.map(s => sendOrderEmail({ to: s.email, subject, html, text }))
  );

  // 3) supprimer les abonnements (pour éviter spam / double notif)
  const { error: delErr } = await supabase
    .from('notify_subscriptions')
    .delete()
    .eq('product_id', productId);

  if (delErr) throw new Error(delErr.message);

  return { sent: subs.length };
}

app.patch('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const pid = String(req.params.id || '').trim();
  if (!pid) return res.status(400).json({ error: 'bad id' });

  // 1) stock AVANT (important)
  const { data: beforeRow, error: beforeErr } = await supabase
    .from('products')
    .select('stock')
    .eq('id', pid)
    .single();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });

  const beforeStock = Number(beforeRow?.stock || 0);

  const b = req.body || {};
  const name = b.name ?? b.Name;
  const price = b.price ?? b.Price;
  const stock = b.stock ?? b.Stock;
  const description = b.description ?? b.desc ?? b.Description ?? b.Desc;
  const image = b.image ?? b.Image;

  const payload = { updated_at: new Date().toISOString() };

  if (name !== undefined) payload.name = String(name || '').trim();
  if (price !== undefined) payload.price = Number(price || 0);
  if (stock !== undefined) payload.stock = clampInt(stock || 0, 0, 10_000);
  if (description !== undefined) payload.description = String(description || '');
  if (image !== undefined) payload.image = String(image || '') || null;

  console.log("PATCH /api/admin/products/:id", { pid, body: b, payload });

  // 2) update
  const { data: updated, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', pid)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // 3) si stock passe de 0 à >0 => notify
  try {
    const afterStock = Number(updated?.stock || 0);
    if (beforeStock <= 0 && afterStock > 0) {
      const r = await notifyBackInStock(pid);
      console.log("✅ notifyBackInStock", { pid, ...r });
    }
  } catch (e) {
    console.log("❌ notifyBackInStock error", e?.message || e);
    // on n'empêche pas le patch de réussir
  }

  res.json({ product: updated });
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




// ------- Admin Reviews (DB) -------

// Supprimer UN avis par id
app.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });

  const { error } = await supabase.from('reviews').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// Supprimer TOUS les avis d’un produit
app.delete('/api/admin/reviews/product/:productId', requireAdmin, async (req, res) => {
  const pid = String(req.params.productId || '').trim();
  if (!pid) return res.status(400).json({ error: 'productId required' });

  const { error } = await supabase.from('reviews').delete().eq('product_id', pid);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
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

// ------- Admin Orders -------

// helper pour compter les items dans un cart
function countCartItems(cart) {
  if (!cart || typeof cart !== "object") return 0;

  const skus = cart.skus && typeof cart.skus === "object" ? cart.skus : {};
  const packs = Array.isArray(cart.packs) ? cart.packs : [];
  const giftcards = Array.isArray(cart.giftcards) ? cart.giftcards : [];

  const singlesCount = Object.values(skus).reduce((a, b) => a + (Number(b) || 0), 0);

  const packsUnits = packs.reduce((a, p) => {
    const items = Array.isArray(p.items) ? p.items : [];
    return a + items.reduce((aa, it) => aa + (Number(it.qty) || 0), 0);
  }, 0);

  const giftCount = giftcards.length;

  return singlesCount + packsUnits + giftCount;
}

// 1) Liste commandes (resume)
app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select("id,created_at,total,cart,email,delivery_mode,payment_method,shipping_fee")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  const orders = (data || []).map(o => ({
    id: o.id,
    created_at: o.created_at,
    total: Number(o.total) || 0,
    items_count: countCartItems(o.cart),
    email: o.email || "",
    delivery_mode: o.delivery_mode || "",
    payment_method: o.payment_method || "",
    shipping_fee: Number(o.shipping_fee) || 0
  }));

  res.json({ orders });
});

// 2) Détail complet d’une commande
app.get("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "id required" });

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ order: data });
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
  const phone = String(req.body?.phone || '').trim();

  const delivery_mode = String(req.body?.delivery_mode || '').trim(); // 'pickup' | 'shipping'
  const payment_mode = String(req.body?.payment_mode || '').trim();   // 'cash' | 'transfer'

  const address = req.body?.address || null; // { street, city, postal_code, number }

  if (!sid) return res.status(400).json({ error: 'sessionId required' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email invalid' });
  if (!delivery_mode || !['pickup','shipping'].includes(delivery_mode)) {
    return res.status(400).json({ error: 'delivery_mode invalid' });
  }
  if (!payment_mode || !['cash','transfer'].includes(payment_mode)) {
    return res.status(400).json({ error: 'payment_mode invalid' });
  }

  // règles business
  if (delivery_mode === 'shipping') {
    const n = String(address?.number || '').trim();
    const street = String(address?.street || '').trim();
    const postal_code = String(address?.postal_code || '').trim();
    const city = String(address?.city || '').trim();
    if (!n || !street || !postal_code || !city) {
      return res.status(400).json({ error: 'address required for shipping' });
    }
  }
  if (payment_mode === 'cash' && delivery_mode !== 'pickup') {
    return res.status(400).json({ error: 'cash allowed only for pickup' });
  }

  // charge panier
  const { data: cartRow, error: cartErr } = await supabase
    .from('carts')
    .select('cart')
    .eq('session_id', sid)
    .single();

  if (cartErr) return res.status(404).json({ error: 'cart not found' });
  const cart = cartRow.cart || {};

  // total server-side (comme tu fais déjà)
  const skuIds = Object.keys(cart.skus || {});
  const { data: prod, error: prodErr } = await supabase
    .from('products')
    .select('id,price,name')
    .in('id', skuIds.length ? skuIds : ['__none__']); // évite IN ()

  if (prodErr) return res.status(500).json({ error: prodErr.message });

  const priceMap = Object.fromEntries((prod || []).map(p => [p.id, Number(p.price) || 0]));
  const nameMap  = Object.fromEntries((prod || []).map(p => [p.id, String(p.name || p.id)]));

  let total = 0;
  for (const [id, qty] of Object.entries(cart.skus || {})) {
    total += (priceMap[id] || 0) * (Number(qty) || 0);
  }
  for (const pack of (cart.packs || [])) total += Number(pack.total || 0);
  for (const gc of (cart.giftcards || [])) total += Number(gc.amount || 0);
  total = Math.round(total * 100) / 100;

  // insert order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      session_id: sid,
      email,
      phone: phone || null,
      delivery_mode,
      payment_mode,
      address: delivery_mode === 'shipping' ? address : null,
      cart,
      total
    })
    .select('id,created_at,total,delivery_mode,payment_mode')
    .single();

  if (orderErr) return res.status(500).json({ error: orderErr.message });

  // Infos paiement
  const BANK_INFO = process.env.BANK_INFO || "BE00 XXXX XXXX XXXX"; // mets ton vrai IBAN dans Render env
  const payLine = payment_mode === 'transfer'
    ? `Paiement par virement : merci de verser ${order.total} € au ${BANK_INFO}.`
    : `Paiement en espèces au retrait en magasin.`;

  // petit récap lignes
  const lines = [];
  for (const [id, qty] of Object.entries(cart.skus || {})) {
    lines.push(`- ${nameMap[id] || id} x${qty}`);
  }
  for (const pack of (cart.packs || [])) lines.push(`- ${pack.name || 'Pack'} (${pack.total} €)`);
  for (const gc of (cart.giftcards || [])) lines.push(`- Carte cadeau (${gc.amount} €)`);

  const deliveryLine = delivery_mode === 'shipping'
    ? `Livraison : envoi à domicile`
    : `Livraison : retrait en magasin`;

  const addrLine = delivery_mode === 'shipping'
    ? `Adresse : ${address.number} ${address.street}, ${address.postal_code} ${address.city}`
    : `Adresse : —`;

  const subject = `Confirmation de commande — Maison Cire`;
  const text =
`Merci pour votre commande !

Commande: ${order.id}
Total: ${order.total} €

${deliveryLine}
${addrLine}
Téléphone: ${phone || '—'}

Articles:
${lines.join('\n')}

${payLine}
`;

  const html = `
  <p>Merci pour votre commande !</p>
  <p><strong>Commande:</strong> ${order.id}<br/>
     <strong>Total:</strong> ${order.total} €</p>
  <p><strong>${deliveryLine}</strong><br/>${addrLine}<br/>
     <strong>Téléphone:</strong> ${phone || '—'}</p>
  <p><strong>Articles:</strong><br/>${lines.map(x => escapeHTML(x)).join('<br/>')}</p>
  <p><strong>${escapeHTML(payLine)}</strong></p>
  `;

  await sendOrderEmail({ to: email, subject, html, text });

  res.json({ order, payLine });
});

// mini escape HTML (si tu n’en as pas côté server)
function escapeHTML(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
