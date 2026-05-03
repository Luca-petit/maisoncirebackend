// Guadaluz — auth.js (front)
// - Met à jour le menu: Connexion / Mon compte
// - Helpers pour lire/écrire le token

(function () {
  const TOKEN_KEY = "mc_auth_token_v1";
  const USER_KEY = "mc_auth_user_v1"; // { email, role }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setUser(user) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }

  // Expose globally (simple)
  window.MCAuth = {
    TOKEN_KEY,
    USER_KEY,
    getToken,
    setToken,
    getUser,
    setUser,
    logout() {
      setToken("");
      setUser(null);
      // Pour compat avec l'admin existant (app.js)
      localStorage.removeItem("candle_shop_admin_key");
    }
  };

  function updateMenu() {
    const link = document.getElementById("accountLink");
    if (!link) return;

    const token = getToken();
    link.textContent = token ? "Mon compte" : "Connexion";
    link.setAttribute("href", "account.html");
  }

  document.addEventListener("DOMContentLoaded", updateMenu);
})();
