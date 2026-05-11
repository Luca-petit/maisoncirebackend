// Guadaluz — account.js
// ✅ Auth 100 % via Supabase Auth (signUp / signInWithPassword / getSession / signOut)
// ✅ Rôle récupéré depuis la table `profiles` (id = auth.users.id)
// ✅ Token Supabase stocké → utilisé pour les appels backend admin

(function () {
  const API_BASE = (window.__API_BASE__ || "https://backendmaisoncire.onrender.com").replace(/\/$/, "");
  const TOKEN_KEY = "mc_auth_token_v1";

  // ── Supabase client ──────────────────────────────────────
  const SUPA_URL = "https://lgewjddjwvhvtfiqskru.supabase.co";
  const SUPA_KEY = "sb_publishable_Q0xoPBZJdqpYfo86CZfTxQ_hZMOdco2";
  const supa = window.supabase.createClient(SUPA_URL, SUPA_KEY);

  // ── DOM ──────────────────────────────────────────────────
  const elAuthBox          = document.getElementById("authBox");
  const elLoginForm        = document.getElementById("loginForm");
  const elLoginEmail       = document.getElementById("loginEmail");
  const elLoginPassword    = document.getElementById("loginPassword");
  const elLoginMsg         = document.getElementById("loginMsg");
  const elSignupForm       = document.getElementById("signupForm");
  const elSignupEmail      = document.getElementById("signupEmail");
  const elSignupPassword   = document.getElementById("signupPassword");
  const elSignupMsg        = document.getElementById("signupMsg");
  const elAccountBox       = document.getElementById("accountBox");
  const elAccountEmail     = document.getElementById("accountEmail");
  const elAccountRole      = document.getElementById("accountRole");
  const elLogoutBtn        = document.getElementById("logoutBtn");
  const elSubtitle         = document.getElementById("accountSubtitle");
  const elMyOrdersSection  = document.getElementById("myOrders");
  const elMyOrdersMsg      = document.getElementById("myOrdersMsg");
  const elMyOrdersList     = document.getElementById("myOrdersList");
  const elAdminSection     = document.getElementById("admin");

  // ── Helpers ──────────────────────────────────────────────
  function setMsg(el, text, type = "") {
    if (!el) return;
    el.textContent = text || "";
    el.className = "formMsg" + (type ? ` is-${type}` : "");
  }
  function clearMsgs() { setMsg(elLoginMsg); setMsg(elSignupMsg); }
  function ensureRevealVisible() {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-in"));
  }

  const elForgotForm          = document.getElementById("forgotForm");
  const elForgotEmail         = document.getElementById("forgotEmail");
  const elForgotMsg           = document.getElementById("forgotMsg");
  const elResetForm           = document.getElementById("resetForm");
  const elResetPassword       = document.getElementById("resetPassword");
  const elResetPasswordConfirm= document.getElementById("resetPasswordConfirm");
  const elResetMsg            = document.getElementById("resetMsg");

  function showTab(which) {
    const forms = { login: elLoginForm, signup: elSignupForm, forgot: elForgotForm, reset: elResetForm };
    Object.entries(forms).forEach(([key, el]) => {
      if (el) el.style.display = key === which ? "" : "none";
    });
    elAuthBox?.classList.toggle("authCard--wide", which === "signup");
    clearMsgs();
  }

  // ── Auth storage ─────────────────────────────────────────
  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }

  function setAuth(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    // admin key pour les appels backend (app.js utilise getAdminKey())
    if (user?.role === "admin" && token) {
      localStorage.setItem("candle_shop_admin_key", token);
    } else {
      localStorage.removeItem("candle_shop_admin_key");
    }
    window.MC_AUTH?.refreshNav?.();
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("candle_shop_admin_key");
    window.MC_AUTH?.refreshNav?.();
  }

  // ── Récupérer le rôle + infos depuis profiles ───────────
  async function getProfile(userId) {
    const { data, error } = await supa.from("profiles").select("role,first_name,last_name").eq("id", userId).maybeSingle();
    if (error) console.warn("getProfile error:", error.message);
    return data || {};
  }

  // Récupère le rôle depuis le backend (service_role key → bypasse RLS, source de vérité)
  async function getRoleFromBackend(token) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const d = await res.json().catch(() => null);
      return d?.user?.role || null;
    } catch {
      return null;
    }
  }

  async function getRole(userId) {
    const p = await getProfile(userId);
    return p.role || "user";
  }

  // ── Commandes utilisateur ────────────────────────────────
  function formatEUR(n) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  }
  function formatDate(ts) {
    try { return new Date(ts).toLocaleString("fr-FR"); } catch { return ""; }
  }

  function orderStatusBadge(status) {
    const map = {
      "en attente du virement": ["waiting",  "En attente du virement"],
      "preparation":            ["prep",     "En préparation"],
      "transit":                ["transit",  "En transit"],
      "termine":                ["done",     "Terminée"],
    };
    const [cls, label] = map[status] || ["default", status || "—"];
    return `<span class="orderStatus orderStatus--${cls}">${label}</span>`;
  }

  let _userProductsMap = null;
  async function getProductsMap() {
    if (_userProductsMap) return _userProductsMap;
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.products) ? data.products : [];
      _userProductsMap = Object.fromEntries(list.map(p => [String(p.id), p]));
    } catch (_) { _userProductsMap = {}; }
    return _userProductsMap;
  }

  function openUserOrderDetail(order, productsMap) {
    const existing = document.getElementById("userOrderDetailOverlay");
    if (existing) existing.remove();

    const cart      = order.cart || {};
    const skus      = cart.skus && typeof cart.skus === "object" ? cart.skus : {};
    const packs     = Array.isArray(cart.packs) ? cart.packs : [];
    const giftcards = Array.isArray(cart.giftcards) ? cart.giftcards : [];
    const idShort   = String(order.id || "").slice(0, 8).toUpperCase();
    const delivery  = order.delivery_mode === "shipping" ? "Envoi à domicile" : "Retrait en magasin";
    const payment   = order.payment_mode  === "cash"     ? "Cash"             : "Virement";

    const itemRows = [
      ...Object.entries(skus).map(([pid, qty]) => {
        const p = productsMap[pid] || {};
        const imgHtml = p.image
          ? `<img src="${p.image}" alt="${p.name || ""}" class="uod-item__img">`
          : `<div class="uod-item__placeholder">🕯️</div>`;
        return `<div class="uod-item">
          ${imgHtml}
          <div class="uod-item__info">
            <div class="uod-item__name">${p.name || pid}</div>
            <div class="uod-item__sub">×${qty}${p.price ? " · " + formatEUR(Number(p.price) * Number(qty)) : ""}</div>
          </div>
        </div>`;
      }),
      ...packs.map(pack => {
        const firstItem = (pack.items || [])[0];
        const firstP = firstItem ? (productsMap[firstItem.id] || {}) : {};
        const imgHtml = firstP.image
          ? `<img src="${firstP.image}" alt="" class="uod-item__img">`
          : `<div class="uod-item__placeholder">🎁</div>`;
        const subItems = (pack.items || []).map(it => {
          const p = productsMap[it.id] || {};
          return `${p.name || it.id} ×${it.qty}`;
        }).join(" · ");
        return `<div class="uod-item">
          ${imgHtml}
          <div class="uod-item__info">
            <div class="uod-item__name">${pack.name || "Pack"}</div>
            <div class="uod-item__sub">${subItems}${pack.total ? " · " + formatEUR(pack.total) : ""}</div>
          </div>
        </div>`;
      }),
      ...giftcards.map(gc => `<div class="uod-item">
          <div class="uod-item__placeholder">🎁</div>
          <div class="uod-item__info">
            <div class="uod-item__name">Carte cadeau ${formatEUR(gc.amount)}</div>
            <div class="uod-item__sub">Pour : ${gc.receiver || "—"}</div>
          </div>
        </div>`),
    ].join("");

    const overlay = document.createElement("div");
    overlay.id = "userOrderDetailOverlay";
    overlay.className = "uod-overlay";
    overlay.innerHTML = `
      <div class="uod-panel">
        <div class="uod-panel__header">
          <h3 class="uod-panel__title">Commande #${idShort}</h3>
          <button id="userOrderDetailClose" class="uod-close" aria-label="Fermer">✕</button>
        </div>

        <div class="uod-status">${orderStatusBadge(order.status)}</div>

        <div class="uod-meta">
          <p class="uod-date">${formatDate(order.created_at)}</p>
          <p><strong>Livraison :</strong> ${delivery}</p>
          <p><strong>Paiement :</strong> ${payment}</p>
          <div class="uod-total-line">
            <span>Total payé</span>
            <span class="uod-total-value">${formatEUR(order.total)}</span>
          </div>
        </div>

        <p class="uod-section-label">Articles</p>
        <div class="uod-items">
          ${itemRows || '<p style="color:var(--muted);">Aucun article.</p>'}
        </div>
      </div>`;

    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("#userOrderDetailClose").addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  }

  async function loadMyOrders() {
    if (!elMyOrdersSection || !elMyOrdersList) return;
    const emptyEl = document.getElementById("myOrdersEmpty");
    elMyOrdersList.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "none";
    setMsg(elMyOrdersMsg, "Chargement…");

    try {
      const token = getToken();
      const [ordersRes, productsMap] = await Promise.all([
        fetch(`${API_BASE}/api/account/orders`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        }),
        getProductsMap(),
      ]);
      const data = await ordersRes.json().catch(() => ({}));
      if (!ordersRes.ok) throw new Error(data?.error || `HTTP ${ordersRes.status}`);

      const orders = data?.orders || [];

      if (!orders.length) {
        setMsg(elMyOrdersMsg, "0 commande");
        if (emptyEl) emptyEl.style.display = "";
        return;
      }

      setMsg(elMyOrdersMsg, `${orders.length} commande${orders.length > 1 ? "s" : ""}`);

      elMyOrdersList.innerHTML = orders.map((o, i) => {
        const count    = Number(o.items_count || 0);
        const delivery = o.delivery_mode === "shipping" ? "🚚 Envoi" : "🏪 Retrait";
        const payment  = o.payment_mode  === "cash"     ? "💵 Cash"  : "🏦 Virement";
        const date     = formatDate(o.created_at);
        const idShort  = String(o.id || "").slice(0, 8).toUpperCase();

        return `
          <div class="orderCard" data-order-idx="${i}" style="cursor:pointer;">
            <div class="orderCard__head">
              <span class="orderCard__id">#${idShort}</span>
              ${orderStatusBadge(o.status)}
            </div>
            <div class="orderCard__body">
              <div class="orderCard__meta">
                <span>🕯️ ${count} article${count > 1 ? "s" : ""}</span>
                <span>${delivery}</span>
                <span>${payment}</span>
                <span class="orderCard__date">${date}</span>
              </div>
              <strong class="orderCard__total">${formatEUR(o.total)}</strong>
            </div>
            <div class="orderCard__cta">Voir le détail →</div>
          </div>`;
      }).join("");

      elMyOrdersList.addEventListener("click", e => {
        const card = e.target.closest("[data-order-idx]");
        if (!card) return;
        const idx = Number(card.dataset.orderIdx);
        openUserOrderDetail(orders[idx], productsMap);
      });

    } catch (e) {
      setMsg(elMyOrdersMsg, "❌ " + (e?.message || "Erreur chargement"));
    }
  }

  // ── UI states ────────────────────────────────────────────
  function showAnonymous() {
    if (elSubtitle)    elSubtitle.textContent = "Connexion / Inscription";
    if (elAuthBox)     elAuthBox.style.display = "";
    if (elAccountBox)  elAccountBox.style.display = "none";
    if (elMyOrdersSection) elMyOrdersSection.style.display = "none";
    if (elAdminSection)    elAdminSection.style.display = "none";
    showTab("login");
  }

  function showLogged(user) {
    if (elSubtitle)   elSubtitle.textContent = "Mon espace";
    if (elAuthBox)    elAuthBox.style.display = "none";
    if (elAccountBox) elAccountBox.style.display = "";

    // Avatar initiale (prénom > email)
    const displayName = user?.firstName || user?.lastName || (user?.email || "?").split("@")[0];
    const avatar = document.getElementById("accountAvatar");
    if (avatar) avatar.textContent = displayName[0].toUpperCase();

    // Greeting
    const greeting = document.getElementById("accountGreeting");
    if (greeting) {
      const name = user?.firstName || displayName;
      greeting.textContent = `Bonjour, ${name.charAt(0).toUpperCase() + name.slice(1)} !`;
    }

    if (elAccountEmail) elAccountEmail.textContent = user?.email || "—";
    if (elAccountRole)  elAccountRole.textContent  = user?.role === "admin" ? "admin" : "";

    const isAdmin = user?.role === "admin";

    const elGcSection = document.getElementById("myGiftCards");
    if (elMyOrdersSection) elMyOrdersSection.style.display  = isAdmin ? "none" : "";
    if (elGcSection)        elGcSection.style.display        = isAdmin ? "none" : "";
    if (!isAdmin) { loadMyOrders(); loadGiftCards(); }

    if (elAdminSection) elAdminSection.style.display = isAdmin ? "" : "none";

    if (isAdmin) {
      document.getElementById("adminAuth")?.style &&
        (document.getElementById("adminAuth").style.display = "none");
      document.getElementById("adminPanel")?.classList.remove("hidden");
      window.loadAdminOrders?.();
      window.loadAdminPendingTestimonials?.();
    }
  }

  // ── Gift cards ───────────────────────────────────────
  const GC_GRADIENTS = {
    violet: "linear-gradient(135deg,#7c3aed,#a78bfa,#6d28d9)",
    rose:   "linear-gradient(135deg,#c47878,#fdddd0,#b86060)",
    ambre:  "linear-gradient(135deg,#aa8820,#d4b84e,#c9a428)",
    noir:   "linear-gradient(135deg,#1c1814,#3d3530,#0d0b09)",
  };

  function gcCardHtml(gc, mode = "received") {
    const grad    = GC_GRADIENTS[gc.color] || GC_GRADIENTS.ambre;
    const pct     = gc.initial_amount > 0 ? Math.round((gc.balance / gc.initial_amount) * 100) : 0;
    const used    = Math.round((Number(gc.initial_amount) - Number(gc.balance)) * 100) / 100;
    const isSent  = !!gc.sent_at;
    const isActive = gc.is_active && gc.balance > 0;

    return `
      <div class="gcCard ${isActive ? "" : "gcCard--used"}">
        <div class="gcCard__visual" style="background:${grad};">
          <div class="gcCard__visual-top">
            <span class="gcCard__brand">Guadaluz</span>
            <span class="gcCard__amount">${Number(gc.initial_amount).toFixed(0)} €</span>
          </div>
          <div class="gcCard__label">Carte Cadeau</div>
          ${mode === "received"
            ? `<div class="gcCard__code">${gc.code}</div>`
            : `<div class="gcCard__code" style="letter-spacing:.18em;opacity:.5;">MC-••••-••••-••••</div>`
          }
        </div>
        <div class="gcCard__body">
          ${mode === "received" ? `
            <div class="gcCard__balance">
              <div class="gcCard__balanceBar">
                <div class="gcCard__balanceFill" style="width:${pct}%;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:6px;">
                <span class="tiny muted">Utilisé : ${formatEUR(used)}</span>
                <strong style="font-size:15px;color:${isActive ? "var(--brand)" : "var(--muted)"};">
                  ${isActive ? `Solde : ${formatEUR(gc.balance)}` : "Épuisée"}
                </strong>
              </div>
            </div>
          ` : `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="tiny muted">Pour : ${gc.recipient_email}</span>
              <span class="tiny" style="color:${isSent ? "var(--brand2)" : "var(--muted)"};">
                ${isSent ? "✓ Envoyée" : "⏳ En attente"}
              </span>
            </div>
          `}
        </div>
      </div>`;
  }

  async function loadGiftCards() {
    const token = getToken();
    if (!token) return;

    // Reçues
    const receivedMsg  = document.getElementById("gcReceivedMsg");
    const receivedList = document.getElementById("gcReceivedList");
    try {
      const d = await fetch(`${API_BASE}/api/account/gift-cards/received`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      const cards = d?.gift_cards || [];
      if (receivedMsg) receivedMsg.textContent = `${cards.length} carte(s) reçue(s)`;
      if (receivedList) {
        receivedList.innerHTML = cards.length
          ? cards.map(gc => gcCardHtml(gc, "received")).join("")
          : `<p class="tiny muted" style="padding:20px 0;">Aucune carte reçue pour l'instant.</p>`;
      }
    } catch { if (receivedMsg) receivedMsg.textContent = "❌ Erreur chargement"; }

    // Envoyées
    const sentMsg  = document.getElementById("gcSentMsg");
    const sentList = document.getElementById("gcSentList");
    try {
      const d = await fetch(`${API_BASE}/api/account/gift-cards/sent`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      const cards = d?.gift_cards || [];
      if (sentMsg)  sentMsg.textContent  = `${cards.length} carte(s) envoyée(s)`;
      if (sentList) {
        sentList.innerHTML = cards.length
          ? cards.map(gc => gcCardHtml(gc, "sent")).join("")
          : `<p class="tiny muted" style="padding:20px 0;">Aucune carte envoyée pour l'instant.</p>`;
      }
    } catch { if (sentMsg) sentMsg.textContent = "❌ Erreur chargement"; }
  }

  // Tabs cartes cadeaux
  document.querySelectorAll("[data-gc-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-gc-tab]").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const tab = btn.dataset.gcTab;
      document.getElementById("gcReceived").style.display = tab === "received" ? "" : "none";
      document.getElementById("gcSent").style.display     = tab === "sent"     ? "" : "none";
    });
  });

  // ── Auth events ──────────────────────────────────────────
  document.getElementById("switchToSignup")?.addEventListener("click", e => { e.preventDefault(); showTab("signup"); });
  document.getElementById("switchToLogin") ?.addEventListener("click", e => { e.preventDefault(); showTab("login");  });
  document.getElementById("switchToForgot")?.addEventListener("click", e => { e.preventDefault(); showTab("forgot"); });
  document.getElementById("backToLogin")   ?.addEventListener("click", e => { e.preventDefault(); showTab("login");  });

  // Login
  elLoginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = (elLoginEmail?.value    || "").trim().toLowerCase();
    const password = (elLoginPassword?.value || "").trim();

    if (!email.includes("@")) return setMsg(elLoginMsg, "Email invalide.");
    if (!password)            return setMsg(elLoginMsg, "Mot de passe requis.");

    const btn = elLoginForm.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.textContent = "Connexion…"; }
    setMsg(elLoginMsg, "");

    try {
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);

      const token   = data.session.access_token;
      const [profile, backendRole] = await Promise.all([
        getProfile(data.user.id),
        getRoleFromBackend(token),
      ]);
      const role = backendRole || profile.role || "user";
      const user    = { email: data.user.email, role, firstName: profile.first_name, lastName: profile.last_name };

      setAuth(token, user);
      showLogged(user);
    } catch (err) {
      setMsg(elLoginMsg, "❌ " + (err?.message || "Identifiants invalides."));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
    }
  });

  // Signup
  elSignupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const firstName = (document.getElementById("signupFirstName")?.value || "").trim();
    const lastName  = (document.getElementById("signupLastName")?.value  || "").trim();
    const email     = (elSignupEmail?.value    || "").trim().toLowerCase();
    const password  = (elSignupPassword?.value || "").trim();
    const phone     = (document.getElementById("signupPhone")?.value   || "").trim();
    const address   = (document.getElementById("signupAddress")?.value || "").trim();

    if (!firstName)            return setMsg(elSignupMsg, "Prénom requis.");
    if (!lastName)             return setMsg(elSignupMsg, "Nom requis.");
    if (!email.includes("@"))  return setMsg(elSignupMsg, "Email invalide.");
    if (password.length < 6)   return setMsg(elSignupMsg, "Mot de passe trop court (min 6 caractères).");

    const btn = elSignupForm.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.textContent = "Création…"; }
    setMsg(elSignupMsg, "");

    try {
      const { data, error } = await supa.auth.signUp({ email, password });
      if (error) throw new Error(error.message);

      // Email déjà utilisé : Supabase renvoie identities=[] au lieu d'une erreur
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setMsg(elSignupMsg, "❌ Un compte existe déjà avec cette adresse email. Connectez-vous ou utilisez « Mot de passe oublié ».", "error");
        if (btn) { btn.disabled = false; btn.textContent = "Créer mon compte"; }
        return;
      }

      // Cas 1 : confirmation email requise → pas de session
      if (!data.session) {
        setMsg(elSignupMsg,
          "✅ Un email de confirmation a été envoyé à " + email + ". Veuillez cliquer sur le lien pour activer votre compte.",
          "success"
        );
        if (btn) { btn.disabled = false; btn.textContent = "Créer mon compte"; }
        return;
      }

      // Cas 2 : confirmation désactivée → session immédiate
      const session = data.session;

      // Sauvegarder les infos du profil
      await supa.from("profiles").update({
        first_name: firstName,
        last_name:  lastName,
        phone:      phone  || null,
        address:    address || null,
      }).eq("id", session.user.id);

      const role = await getRole(session.user.id);
      const user = { email: session.user.email, role, firstName };
      setAuth(session.access_token, user);
      showLogged(user);
    } catch (err) {
      setMsg(elSignupMsg, "❌ " + (err?.message || "Erreur création compte."), "error");
      if (btn) { btn.disabled = false; btn.textContent = "Créer mon compte"; }
    }
  });

  // Mot de passe oublié
  elForgotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (elForgotEmail?.value || "").trim().toLowerCase();
    if (!email.includes("@")) return setMsg(elForgotMsg, "Email invalide.");

    const btn = elForgotForm.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.textContent = "Envoi…"; }

    try {
      const { error } = await supa.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/account.html",
      });
      if (error) throw new Error(error.message);
      setMsg(elForgotMsg, "✅ Email envoyé ! Vérifiez votre boîte mail.");
      if (btn) { btn.disabled = false; btn.textContent = "Envoyer le lien"; }
    } catch (err) {
      setMsg(elForgotMsg, "❌ " + (err?.message || "Erreur envoi"));
      if (btn) { btn.disabled = false; btn.textContent = "Envoyer le lien"; }
    }
  });

  // Nouveau mot de passe (après clic sur le lien dans l'email)
  elResetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pwd     = (elResetPassword?.value         || "").trim();
    const confirm = (elResetPasswordConfirm?.value  || "").trim();

    if (pwd.length < 6)    return setMsg(elResetMsg, "Mot de passe trop court (min 6 caractères).");
    if (pwd !== confirm)   return setMsg(elResetMsg, "Les mots de passe ne correspondent pas.");

    const btn = elResetForm.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.textContent = "Mise à jour…"; }

    try {
      const { error } = await supa.auth.updateUser({ password: pwd });
      if (error) throw new Error(error.message);

      setMsg(elResetMsg, "✅ Mot de passe mis à jour !");
      setTimeout(() => {
        showTab("login");
        if (elResetPassword)        elResetPassword.value = "";
        if (elResetPasswordConfirm) elResetPasswordConfirm.value = "";
      }, 1800);
    } catch (err) {
      setMsg(elResetMsg, "❌ " + (err?.message || "Erreur mise à jour"));
      if (btn) { btn.disabled = false; btn.textContent = "Mettre à jour"; }
    }
  });

  // Logout
  elLogoutBtn?.addEventListener("click", async () => {
    await supa.auth.signOut().catch(() => {});
    clearAuth();
    window.location.href = "index.html";
  });

  // ── Dashboard tabs ────────────────────────────────────────
  function initDashTabs() {
    const tabs   = document.querySelectorAll("[data-dash-tab]");
    const panels = { produits: "dashProduits", commandes: "dashCommandes", avis: "dashAvis", clients: "dashClients" };

    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.dashTab;
        tabs.forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        Object.values(panels).forEach(id => document.getElementById(id)?.classList.add("hidden"));
        document.getElementById(panels[tab])?.classList.remove("hidden");
        if (tab === "commandes") window.loadAdminOrders?.();
        if (tab === "avis")      window.loadAdminPendingTestimonials?.();
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────
  ensureRevealVisible();
  initDashTabs();

  document.getElementById("clientSearchBtn")?.addEventListener("click", () => window.searchClient?.());
  document.getElementById("clientSearchInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.searchClient?.();
  });

  // Détecter un lien de reset dans l'URL AVANT tout chargement de session
  function isRecoveryUrl() {
    const hash   = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    return hash.get("type") === "recovery" || search.get("type") === "recovery";
  }

  // Si c'est un lien de reset, afficher directement le formulaire
  if (isRecoveryUrl()) {
    if (elAuthBox)    elAuthBox.style.display    = "";
    if (elAccountBox) elAccountBox.style.display = "none";
    showTab("reset");
  }

  // Sync session Supabase
  supa.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      if (elAuthBox)    elAuthBox.style.display    = "";
      if (elAccountBox) elAccountBox.style.display = "none";
      showTab("reset");
      return;
    }
    if (event === "SIGNED_OUT" || !session) {
      clearAuth();
      showAnonymous();
    }
  });

  (async () => {
    // Si on est en mode recovery, laisser onAuthStateChange gérer
    if (isRecoveryUrl()) return;

    try {
      const { data: { session } } = await supa.auth.getSession();

      if (session?.access_token) {
        const [profile, backendRole] = await Promise.all([
          getProfile(session.user.id),
          getRoleFromBackend(session.access_token),
        ]);
        // Le backend (service_role) est la source de vérité pour le rôle
        const role = backendRole || profile.role || "user";
        const user = { email: session.user.email, role, firstName: profile.first_name, lastName: profile.last_name };
        setAuth(session.access_token, user);
        showLogged(user);
      } else {
        clearAuth();
        showAnonymous();
      }
    } catch {
      clearAuth();
      showAnonymous();
    }
  })();

})();
