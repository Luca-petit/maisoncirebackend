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

  async function loadMyOrders() {
    if (!elMyOrdersSection || !elMyOrdersList) return;
    elMyOrdersList.innerHTML = "";
    setMsg(elMyOrdersMsg, "Chargement…");

    try {
      const token = getToken();
      const res  = await fetch(`${API_BASE}/api/account/orders`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const orders = data?.orders || [];
      if (!orders.length) { setMsg(elMyOrdersMsg, "Aucune commande pour le moment."); return; }
      setMsg(elMyOrdersMsg, `${orders.length} commande(s)`);

      elMyOrdersList.innerHTML = orders.map(o => {
        const count = Number(o.items_count || 0);
        const status = o.status || "preparation";
        return `
          <div class="cartItem" style="align-items:flex-start;">
            <div style="flex:1;">
              <h4 style="margin:0;">Commande <span style="color:var(--muted);font-weight:500;">#${o.id.slice(0, 8)}…</span></h4>
              <div class="tiny muted" style="margin-top:6px;">
                ${formatDate(o.created_at)} · ${count} article(s)
              </div>
              <div class="tiny muted" style="margin-top:4px;">
                ${o.delivery_mode === "shipping" ? "Envoi à domicile" : "Retrait"} ·
                ${o.payment_mode === "cash" ? "Cash" : "Virement"} ·
                <span style="color:var(--brand2);font-weight:700;">${status}</span>
              </div>
            </div>
            <strong style="font-size:16px;">${formatEUR(o.total)}</strong>
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

    if (elAccountEmail) elAccountEmail.textContent = user?.email || "—";
    if (elAccountRole)  elAccountRole.textContent  = user?.role === "admin" ? "admin" : "";

    const isAdmin = user?.role === "admin";

    if (elMyOrdersSection) elMyOrdersSection.style.display = isAdmin ? "none" : "";
    if (!isAdmin) loadMyOrders();

    if (elAdminSection) elAdminSection.style.display = isAdmin ? "" : "none";

    if (isAdmin) {
      document.getElementById("adminAuth")?.style &&
        (document.getElementById("adminAuth").style.display = "none");
      document.getElementById("adminPanel")?.classList.remove("hidden");
      window.loadAdminOrders?.();
    }
  }

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
