// Maison Cire — account.js
// Page /account.html :
// - Si non connecté : onglets Créer un compte / Se connecter
// - Si connecté : email + logout + Mes commandes
// - Si role=admin : affiche le dashboard admin (réutilise app.js)

(function () {
  const API_BASE = (window.__API_BASE__ || "https://backendmaisoncire.onrender.com").replace(/\/$/, "");
  const TOKEN_KEY = "mc_auth_token_v1";
  const USER_KEY = "mc_auth_user_v1";

  const elAuthBox = document.getElementById("accountAuthBox");
  const elTabs = document.getElementById("accountAuthTabs");
  const elTabSignup = document.getElementById("tabSignup");
  const elTabLogin = document.getElementById("tabLogin");
  const elSignupForm = document.getElementById("signupForm");
  const elLoginForm = document.getElementById("loginForm");
  const elSignupEmail = document.getElementById("signupEmail");
  const elSignupPassword = document.getElementById("signupPassword");
  const elLoginEmail = document.getElementById("loginEmail");
  const elLoginPassword = document.getElementById("loginPassword");
  const elAuthMsg = document.getElementById("accountAuthMsg");

  const elLoggedBox = document.getElementById("accountLoggedBox");
  const elEmail = document.getElementById("accountEmail");
  const elRole = document.getElementById("accountRole");
  const elLogout = document.getElementById("accountLogout");

  const elOrdersBox = document.getElementById("accountOrdersBox");
  const elOrdersMsg = document.getElementById("accountOrdersMsg");
  const elOrdersList = document.getElementById("accountOrdersList");

  const elAdminDash = document.getElementById("adminDashboard");

  // ----- UI: le CSS du projet cache les sections `.reveal` tant que `.is-in` n'est pas ajouté.
  // Sur /account.html on n'inclut pas app.js (qui gère ça sur index), donc on force l'affichage ici.
  function ensureRevealVisible() {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
  }

  // ----- UI: hamburger menu (même comportement que sur index)
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

  // Init UI (évite page blanche : `.reveal` était invisible sans app.js)
  ensureRevealVisible();
  setupHamburger();
  setYear();

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setAuth(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));

    // Compat: app.js admin calls use x-admin-key
    if (user?.role === "admin" && token) {
      localStorage.setItem("candle_shop_admin_key", token);
    } else {
      localStorage.removeItem("candle_shop_admin_key");
    }

    // Met à jour le menu
    window.MC_AUTH?.refreshNav?.();
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("candle_shop_admin_key");
    window.MC_AUTH?.refreshNav?.();
  }

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
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
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

  function showTab(which) {
    const isSignup = which === "signup";
    elTabSignup?.classList.toggle("is-selected", isSignup);
    elTabLogin?.classList.toggle("is-selected", !isSignup);
    if (elSignupForm) elSignupForm.style.display = isSignup ? "" : "none";
    if (elLoginForm) elLoginForm.style.display = isSignup ? "none" : "";
    if (elAuthMsg) elAuthMsg.textContent = "";
  }

  function setAuthMsg(text) {
    if (!elAuthMsg) return;
    elAuthMsg.textContent = text;
  }

  function formatEUR(n) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
  }

  function formatDate(ts) {
    try { return new Date(ts).toLocaleString("fr-FR"); } catch { return ""; }
  }

  async function loadMyOrders() {
    if (!elOrdersBox || !elOrdersList) return;
    elOrdersList.innerHTML = "";
    if (elOrdersMsg) elOrdersMsg.textContent = "Chargement...";

    try {
      const token = getToken();
      const data = await api("/api/account/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const orders = data?.orders || [];

      if (!orders.length) {
        if (elOrdersMsg) elOrdersMsg.textContent = "Aucune commande.";
        return;
      }
      if (elOrdersMsg) elOrdersMsg.textContent = `${orders.length} commande(s)`;

      elOrdersList.innerHTML = orders.map(o => {
        const count = Number(o.items_count || 0);
        return `
          <div class="cartItem" style="align-items:flex-start;">
            <div style="flex:1;">
              <h4 style="margin:0;">Commande #${o.id}</h4>
              <div class="tiny muted" style="margin-top:6px;">${formatDate(o.created_at)} · ${count} article(s) · ${o.status || "preparation"}</div>
            </div>
            <div style="text-align:right;">
              <strong>${formatEUR(Number(o.total || 0))}</strong>
            </div>
          </div>
        `;
      }).join("");
    } catch (e) {
      if (elOrdersMsg) elOrdersMsg.textContent = "❌ " + (e?.message || "Erreur");
    }
  }

  function showLogged(user) {
    if (elAuthBox) elAuthBox.style.display = "none";
    if (elLoggedBox) elLoggedBox.style.display = "";

    if (elEmail) elEmail.textContent = user?.email || "";
    if (elRole) elRole.textContent = user?.role || "user";

    const isAdmin = user?.role === "admin";
    if (elAdminDash) elAdminDash.style.display = isAdmin ? "" : "none";
    if (elOrdersBox) elOrdersBox.style.display = isAdmin ? "none" : "";

    if (isAdmin) {
      // Charge les commandes admin (app.js)
      window.loadAdminOrders?.();
    } else {
      loadMyOrders();
    }
  }

  function showAnonymous() {
    if (elAuthBox) elAuthBox.style.display = "";
    if (elLoggedBox) elLoggedBox.style.display = "none";
    if (elAdminDash) elAdminDash.style.display = "none";
    if (elOrdersBox) elOrdersBox.style.display = "none";
    showTab("signup");
  }

  // --- Events ---
  elTabSignup?.addEventListener("click", () => showTab("signup"));
  elTabLogin?.addEventListener("click", () => showTab("login"));

  elSignupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (elSignupEmail?.value || "").trim().toLowerCase();
    const password = (elSignupPassword?.value || "").trim();
    if (!email || !email.includes("@")) return setAuthMsg("Email invalide.");
    if (password.length < 6) return setAuthMsg("Mot de passe trop court (min 6).");

    try {
      setAuthMsg("Création...");
      const data = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
      setAuth(data.token, data.user);
      showLogged(data.user);
    } catch (err) {
      setAuthMsg("❌ " + (err?.message || "Erreur"));
    }
  });

  elLoginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (elLoginEmail?.value || "").trim().toLowerCase();
    const password = (elLoginPassword?.value || "").trim();
    if (!email || !email.includes("@")) return setAuthMsg("Email invalide.");
    if (!password) return setAuthMsg("Mot de passe requis.");

    try {
      setAuthMsg("Connexion...");
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setAuth(data.token, data.user);
      showLogged(data.user);
    } catch (err) {
      setAuthMsg("❌ " + (err?.message || "Erreur"));
    }
  });

  elLogout?.addEventListener("click", () => {
    clearAuth();
    window.location.href = "index.html";
  });

  // Init
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
