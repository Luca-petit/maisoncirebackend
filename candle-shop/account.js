// Maison Cire — account.js
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

  const hamburger = document.getElementById("hamburger");
  const nav       = document.getElementById("nav");
  if (!hamburger || !nav) return;
  if (hamburger.dataset.bound === "1") return;
  hamburger.dataset.bound = "1";

  // ── Hamburger ────────────────────────────────────────────
  function setMenuOpen(open) {
    nav.classList.toggle("open",    open);
    nav.classList.toggle("is-open", open);
    hamburger.classList.toggle("is-open", open);
    hamburger.setAttribute("aria-expanded", String(open));
  }
  hamburger.addEventListener("click", () => {
    setMenuOpen(!(nav.classList.contains("open") || nav.classList.contains("is-open")));
  });
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setMenuOpen(false)));

  // ── Helpers ──────────────────────────────────────────────
  function setMsg(el, text) { if (el) el.textContent = text || ""; }
  function clearMsgs() { setMsg(elLoginMsg, ""); setMsg(elSignupMsg, ""); }
  function ensureRevealVisible() {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-in"));
  }

  function showTab(which) {
    const isLogin = which === "login";
    if (elLoginForm)  elLoginForm.style.display  = isLogin ? "" : "none";
    if (elSignupForm) elSignupForm.style.display = isLogin ? "none" : "";
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

  // ── Récupérer le rôle depuis profiles ───────────────────
  async function getRole(userId) {
    const { data } = await supa.from("profiles").select("role").eq("id", userId).maybeSingle();
    return data?.role || "user";
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

  async function loadMyOrders() {
    if (!elMyOrdersSection || !elMyOrdersList) return;
    const emptyEl = document.getElementById("myOrdersEmpty");
    elMyOrdersList.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "none";
    setMsg(elMyOrdersMsg, "Chargement…");

    try {
      const token = getToken();
      const res  = await fetch(`${API_BASE}/api/account/orders`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const orders = data?.orders || [];

      if (!orders.length) {
        setMsg(elMyOrdersMsg, "0 commande");
        if (emptyEl) emptyEl.style.display = "";
        return;
      }

      setMsg(elMyOrdersMsg, `${orders.length} commande${orders.length > 1 ? "s" : ""}`);

      elMyOrdersList.innerHTML = orders.map(o => {
        const count    = Number(o.items_count || 0);
        const delivery = o.delivery_mode === "shipping" ? "🚚 Envoi" : "🏪 Retrait";
        const payment  = o.payment_mode  === "cash"     ? "💵 Cash"  : "🏦 Virement";
        const date     = formatDate(o.created_at);
        const idShort  = String(o.id).slice(0, 8).toUpperCase();

        return `
          <div class="orderCard">
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
          </div>`;
      }).join("");

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

    // Avatar initiale
    const avatar = document.getElementById("accountAvatar");
    if (avatar) avatar.textContent = (user?.email || "?")[0].toUpperCase();

    // Greeting
    const greeting = document.getElementById("accountGreeting");
    if (greeting) {
      const name = (user?.email || "").split("@")[0];
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
    }
  }

  // ── Gift cards ───────────────────────────────────────
  const GC_GRADIENTS = {
    violet: "linear-gradient(135deg,#7c3aed,#a78bfa,#6d28d9)",
    sauge:  "linear-gradient(135deg,#2d6a4f,#52b788,#1b4332)",
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
            <span class="gcCard__brand">Maison Cire</span>
            <span class="gcCard__amount">${Number(gc.initial_amount).toFixed(0)} €</span>
          </div>
          <div class="gcCard__label">Carte Cadeau</div>
          <div class="gcCard__code">${gc.code}</div>
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

      const token = data.session.access_token;
      const role  = await getRole(data.user.id);
      const user  = { email: data.user.email, role };

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
    const email    = (elSignupEmail?.value    || "").trim().toLowerCase();
    const password = (elSignupPassword?.value || "").trim();

    if (!email.includes("@"))  return setMsg(elSignupMsg, "Email invalide.");
    if (password.length < 6)   return setMsg(elSignupMsg, "Mot de passe trop court (min 6 caractères).");

    const btn = elSignupForm.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.textContent = "Création…"; }
    setMsg(elSignupMsg, "");

    try {
      const { data, error } = await supa.auth.signUp({ email, password });
      if (error) throw new Error(error.message);

      // Récupère la session — signUp() la retourne directement si
      // "Confirm email" est désactivé dans Supabase Auth settings.
      // Sinon on force un signIn immédiat.
      let session = data.session;
      if (!session) {
        const { data: loginData, error: loginErr } = await supa.auth.signInWithPassword({ email, password });
        if (loginErr) throw new Error(loginErr.message);
        session = loginData.session;
      }

      if (!session) throw new Error("Impossible de créer la session. Réessayez.");

      const role = await getRole(session.user.id);
      const user = { email: session.user.email, role };
      setAuth(session.access_token, user);
      showLogged(user);
    } catch (err) {
      setMsg(elSignupMsg, "❌ " + (err?.message || "Erreur création compte."));
      if (btn) { btn.disabled = false; btn.textContent = "Créer mon compte"; }
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
    const panels = { produits: "dashProduits", commandes: "dashCommandes", avis: "dashAvis" };

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

  (async () => {
    try {
      const { data: { session } } = await supa.auth.getSession();

      if (session?.access_token) {
        const role = await getRole(session.user.id);
        const user = { email: session.user.email, role };
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

  // Sync si la session change (ex: expiration, autre onglet)
  supa.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      clearAuth();
      showAnonymous();
    }
  });

})();
