# Maison Cire — Backend (Express + Supabase)

## 1) Créer les tables dans Supabase
- Ouvre ton projet Supabase → SQL Editor
- Colle le contenu de `schema.sql` et exécute.

## 2) Variables d’environnement (Render)
Dans ton service Render (Node):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (⚠️ server-side uniquement)
- `ADMIN_KEY` (par défaut `admin123`)

Email (optionnel, pour confirmation de commande):
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`

## 3) Lancer en local
```bash
cd backend
npm install
npm run dev
```
API: `http://localhost:8080`

## 4) Brancher le front
Si ton front et ton backend ne sont pas sur le même domaine, mets l’URL du backend dans `index.html`:
```js
window.__API_BASE__ = "https://ton-backend.onrender.com";
```
