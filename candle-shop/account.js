// Maison Cire — account.js (READY)
// Page /account.html
// ✅ Tabs login/signup
// ✅ JWT stored in localStorage
// ✅ role=user -> Mes commandes
// ✅ role=admin -> affiche dashboard admin (déjà dans account.html) + loadAdminOrders() depuis app.js
// ✅ plus de "code admin" front

(function () {
  const API_BASE = (window.__API_BASE__ || "https://backendmaisoncire.onrender.com").replace(/\/$/, "");

  const TOKEN_KEY = "mc_auth_token_v1";
  const USER_KEY = "mc_auth_user_v1";

  // ---- DOM (matches your account.html exactly) ----
  const elAuthBox = document.getElementById("authBox");
  const elTabLogin = document.getElementById("tabLogin");
  const elTabSignup = document.getElementById("tabSignup");

  const elLoginForm = document.getElementById("loginForm");
  const elLoginEmail = document.getElementById("loginEmail");
  const elLoginPassword = document.getElementById("loginPassword");
  const elLoginMsg = document.getElementById("loginMsg");

  const elSignupForm = document.getElementById("signupForm");
  const elSignupEmail = document.getElementById("signupEmail");
  const elSignupPassword = document.getElementById("signupPassword");
  const elSignupMsg = document.getElementById("signupMsg");

  const elAccountBox = document.getElementById("accountBox");
  const elAccountEmail = document.getElementById("accountEmail");
  const elAccountRole = document.getElementById("accountRole");
  const elLogoutBtn = document.getElementById("logoutBtn");

  const elSubtitle = document.getElementById("accountSubtitle");

  const elMyOrdersSection = document.getElementById("myOrders");
  const elMyOrdersMsg = document.getElementById("myOrdersMsg");
  const elMyOrdersList = document.getElementById("myOrdersList");

const hamburger = document.getElementById("hamburger");
  const nav = document.getElementById("nav");
  if (!hamburger || !nav) return;

  // évite double-binding si le script est exécuté 2 fois
  if (hamburger.dataset.bound === "1") return;
  hamburger.dataset.bound = "1";

  function setMenuOpen(open) {
    nav.classList.toggle("open", open);
    nav.classList.toggle("is-open", open);
    hamburger.classList.toggle("is-open", open);
    hamburger.setAttribute("aria-expanded", String(open));
  }

  hamburger.addEventListener("click", () => {
    const isOpen = nav.classList.contains("open") || nav.classList.contains("is-open");
    setMenuOpen(!isOpen);
  });

  nav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => setMenuOpen(false));
  });

  // Admin section in account.html
  const elAdminSection = document.getElementById("admin");

  // ---- UI helpers ----
  function ensureRevealVisible() {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
  }

  function setupHamburger() {
    const hamburger = document.getElementById("hamburger");
    const nav = document.getElementById("nav");
    if (!hamburger || !nav) return;

    const setMenuOpen = (open) => {
      nav.classList.toggle("open", open);
      nav.classList.toggle("is-open", open);
      hamburger.classList.toggle("is-open", open);
      hamburger.setAttribute("aria-expanded", String(open));
    };

    hamburger.addEventListener("click", () => {
      const isOpen = nav.classList.contains("open") || nav.classList.contains("is-open");
      setMenuOpen(!isOpen);
    });

    document.querySelectorAll("#nav a").forEach((a) => {
      a.addEventListener("click", () => setMenuOpen(false));
    });
  }

  function setYear() {
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  function setMsg(el, text) {
    if (!el) return;
    el.textContent = text || "";
  }

  function clearMsgs() {
    setMsg(elLoginMsg, "");
    setMsg(elSignupMsg, "");
  }

  function showTab(which) {
    const isLogin = which === "login";
    elTabLogin?.classList.toggle("btn--ghost", !isLogin);
    elTabSignup?.classList.toggle("btn--ghost", isLogin);

    if (elLoginForm) elLoginForm.style.display = isLogin ? "" : "none";
    if (elSignupForm) elSignupForm.style.display = isLogin ? "none" : "";

    clearMsgs();
  }

  // ---- Auth storage ----
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setAuth(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));

    // compat app.js: it sends x-admin-key
    if (user?.role === "admin" && token) {
      localStorage.setItem("candle_shop_admin_key", token);
    } else {
      localStorage.removeItem("candle_shop_admin_key");
    }

    // update nav if auth.js is present
    window.MC_AUTH?.refreshNav?.();
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("candle_shop_admin_key");
    window.MC_AUTH?.refreshNav?.();
  }

  // ---- API ----
  async function api(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  }

  async function fetchMe() {
    const token = getToken();
    if (!token) return null;

    const data = await api("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    return data?.user || null;
  }

  // ---- Orders (user) ----
  function formatEUR(n) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  }
  function formatDate(ts) {
    try {
      return new Date(ts).toLocaleString("fr-FR");
    } catch {
      return "";
    }
  }

  async function loadMyOrders() {
    if (!elMyOrdersSection || !elMyOrdersList) return;

    elMyOrdersList.innerHTML = "";
    setMsg(elMyOrdersMsg, "Chargement...");

    try {
      const token = getToken();
      const data = await api("/api/account/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const orders = data?.orders || [];
      if (!orders.length) {
        setMsg(elMyOrdersMsg, "Aucune commande.");
        return;
      }

      setMsg(elMyOrdersMsg, `${orders.length} commande(s)`);

      elMyOrdersList.innerHTML = orders
        .map((o) => {
          const count = Number(o.items_count || 0);
          return `
            <div class="cartItem" style="align-items:flex-start;">
              <div style="flex:1;">
                <h4 style="margin:0;">Commande #${o.id}</h4>
                <div class="tiny muted" style="margin-top:6px;">
                  ${formatDate(o.created_at)} · ${count} article(s) · ${o.status || "preparation"}
                </div>
                <div class="tiny muted" style="margin-top:6px;">
                  Livraison: ${o.delivery_mode || "—"} · Paiement: ${o.payment_mode || "—"}
                </div>
              </div>
              <div style="text-align:right;">
                <strong>${formatEUR(o.total)}</strong>
              </div>
            </div>
          `;
        })
        .join("");
    } catch (e) {
      setMsg(elMyOrdersMsg, "❌ " + (e?.message || "Erreur"));
    }
  }

  // ---- UI states ----
  function showAnonymous() {
    if (elSubtitle) elSubtitle.textContent = "Connexion / Inscription";

    if (elAuthBox) elAuthBox.style.display = "";
    if (elAccountBox) elAccountBox.style.display = "none";

    if (elMyOrdersSection) elMyOrdersSection.style.display = "none";
    if (elAdminSection) elAdminSection.style.display = "none";

    showTab("login");
  }

  function showLogged(user) {
    if (elSubtitle) elSubtitle.textContent = "Vous êtes connecté";

    if (elAuthBox) elAuthBox.style.display = "none";
    if (elAccountBox) elAccountBox.style.display = "";

    if (elAccountEmail) elAccountEmail.textContent = user?.email || "—";
    if (elAccountRole) elAccountRole.textContent = user?.role ? `(${user.role})` : "";

    const isAdmin = user?.role === "admin";

    // user -> orders
    if (elMyOrdersSection) elMyOrdersSection.style.display = isAdmin ? "none" : "";
    if (!isAdmin) loadMyOrders();

    // admin -> dashboard (already in account.html)
    if (elAdminSection) elAdminSection.style.display = isAdmin ? "" : "none";

    if (isAdmin) {
      // Ensure admin panel is visible (no "adminAuth" anymore)
      // In your account.html, adminPanel is inside adminBox and may be "hidden" by default.
      const adminAuth = document.getElementById("adminAuth");
      const adminPanel = document.getElementById("adminPanel");
      if (adminAuth) adminAuth.style.display = "none";
      if (adminPanel) adminPanel.classList.remove("hidden");

      // Load admin data from app.js
      window.loadAdminOrders?.();
    }
  }

  // ---- Events ----
  elTabLogin?.addEventListener("click", () => showTab("login"));
  elTabSignup?.addEventListener("click", () => showTab("signup"));

  function setActiveTab(which){
  const loginBtn = document.getElementById("tabLogin");
  const signupBtn = document.getElementById("tabSignup");
  if (!loginBtn || !signupBtn) return;

  loginBtn.classList.toggle("is-active", which === "login");
  signupBtn.classList.toggle("is-active", which === "signup");
}

// état initial
setActiveTab("login");

// quand tu cliques
document.getElementById("tabLogin")?.addEventListener("click", () => setActiveTab("login"));
document.getElementById("tabSignup")?.addEventListener("click", () => setActiveTab("signup"));


  elSignupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (elSignupEmail?.value || "").trim().toLowerCase();
    const password = (elSignupPassword?.value || "").trim();

    if (!email || !email.includes("@")) return setMsg(elSignupMsg, "Email invalide.");
    if (password.length < 6) return setMsg(elSignupMsg, "Mot de passe trop court (min 6).");

    try {
      setMsg(elSignupMsg, "Création...");
      const data = await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setAuth(data.token, data.user);
      setMsg(elSignupMsg, "✅ Compte créé");
      showLogged(data.user);
    } catch (err) {
      setMsg(elSignupMsg, "❌ " + (err?.message || "Erreur"));
    }
  });

  elLoginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (elLoginEmail?.value || "").trim().toLowerCase();
    const password = (elLoginPassword?.value || "").trim();

    if (!email || !email.includes("@")) return setMsg(elLoginMsg, "Email invalide.");
    if (!password) return setMsg(elLoginMsg, "Mot de passe requis.");

    try {
      setMsg(elLoginMsg, "Connexion...");
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setAuth(data.token, data.user);
      setMsg(elLoginMsg, "✅ Connecté");
      showLogged(data.user);
    } catch (err) {
      setMsg(elLoginMsg, "❌ " + (err?.message || "Erreur"));
    }
  });

  elLogoutBtn?.addEventListener("click", () => {
    clearAuth();
    window.location.href = "index.html";
  });

  // ---- Init ----
  ensureRevealVisible();
  setupHamburger();
  setYear();

  (async () => {
    const user = await fetchMe().catch(() => null);
    if (user) {
      setAuth(getToken(), user);
      showLogged(user);
    } else {
      clearAuth();
      showAnonymous();
    }
  })();
})();
