# SocietyHub Production Deployment Guide

This guide walks you through deploying the complete **SocietyHub** suite to production:
* **Backend Express API** → [Render](https://render.com)
* **Web Admin Dashboard (Next.js)** → [Vercel](https://vercel.com)
* **Managed Database (PostgreSQL)** → [Supabase](https://supabase.com) or [Neon](https://neon.tech)
* **Managed Redis Cache** → [Upstash](https://upstash.com) or [Render Redis](https://render.com/docs/redis)
* **Mobile App (React Native)** → [Expo Application Services (EAS)](https://expo.dev/eas)

---

## 🏗️ Deployment Architecture

```mermaid
graph TD
    User([Mobile App / Expo]) -->|HTTPS/WSS| Backend[Render Web Service]
    Admin([Admin Portal]) -->|HTTPS| Frontend[Vercel Next.js]
    Frontend -->|Client Fetch| Backend
    Backend -->|Queries| DB[(Supabase/Neon Postgres)]
    Backend -->|Key-Value / PubSub| Redis[(Upstash Redis)]
```

---

## 🗄️ Step 1 — Database & Redis Provisioning

Because Render's free tier database spins down, we recommend Neon or Supabase for a robust production-grade Postgres database, and Upstash for a serverless Redis store.

### A. Setup PostgreSQL (Neon / Supabase)
1. Sign up at [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Create a new project named `societyhub-prod`.
3. Locate your database connection string under Settings.
   * Format: `postgresql://username:password@hostname:5432/dbname?sslmode=require`
4. **Important**: Save this string as `DATABASE_URL` (use transaction pooling mode if deploying to serverless environments).

### B. Setup Redis (Upstash)
1. Sign up at [Upstash](https://upstash.com).
2. Create a new Redis Database in your preferred region.
3. Copy the **Redis URL** from the database dashboard.
   * Format: `rediss://default:password@hostname:port` (Note the `rediss://` protocol for TLS/SSL).

---

## ⚙️ Step 2 — Deploying the Backend API (Render)

Render hosts your Node.js Express backend and handles automatic TLS (HTTPS), custom domain routing, and scaling.

### A. Prepare GitHub Repository
Ensure all your backend changes are pushed to your remote repository:
```bash
git add .
git commit -m "chore: prepare for production deployment"
git push origin main
```

### B. Create Web Service on Render
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New** → **Web Service**.
3. Connect your GitHub repository.
4. Configure the service:
   * **Name**: `societyhub-backend`
   * **Region**: Select region closest to your users.
   * **Branch**: `main`
   * **Root Directory**: `backend`
   * **Runtime**: `Node`
   * **Build Command**: `npm install && npm run build` (Ensure your `package.json` contains a build script for compiling TypeScript: `tsc` or `nest build`).
   * **Start Command**: `node dist/src/index.js` (or your build target path).

### C. Configure Environment Variables
In the Render Web Service dashboard, navigate to **Environment** and add the following variables:

| Variable | Recommended Value | Purpose |
|----------|-------------------|---------|
| `NODE_ENV` | `production` | Enables Express security optimization |
| `PORT` | `10000` | Render's default routing port |
| `DATABASE_URL` | *[Your Neon/Supabase Connection String]* | Database client entrypoint |
| `REDIS_URL` | *[Your Upstash/Render Redis URL]* | Session storage & PubSub locks |
| `JWT_ACCESS_SECRET` | *[Generate 64-char key]* | RS256 key replacement |
| `JWT_REFRESH_SECRET` | *[Generate 64-char key]* | Secure refresh tokens |
| `PIN_PEPPER` | *[Generate 32-char key]* | Encrypts resident PINs |
| `AES_ENCRYPTION_KEY`| *[Generate 32-byte Base64 key]* | Deterministic PII encryption |
| `HMAC_SECRET` | *[Generate 64-char key]* | Gate visitor request signing |
| `SUPER_ADMIN_SECRET`| *[Generate secure alpha password]* | Web Admin dashboard master password |
| `CORS_ORIGIN` | `https://your-admin-dashboard.vercel.app` | Allows Next.js frontend calls |

> 💡 **Tip**: To generate secure secrets, run this command in your local terminal:
> `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

### D. Set Up Build Deploy Migrations
To ensure database schema migrations run automatically whenever you deploy:
1. Go to **Settings** in the Render service.
2. Scroll to **Build Command** and change it to:
   `npm install && npx prisma migrate deploy && npm run build`
This ensures schema alterations are applied to the production DB *before* the new code goes live.

---

## 🎨 Step 3 — Deploying the Admin Dashboard (Vercel)

Vercel is optimized for building and serving Next.js applications with global edge caching and minimal configuration.

### A. Deploy Next.js to Vercel
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New** → **Project**.
3. Select your GitHub repository.
4. Configure Project settings:
   * **Root Directory**: `apps/admin` (Crucial: Vercel must build only this subdirectory!)
   * **Framework Preset**: `Next.js`
   * **Build Command**: `next build`
   * **Output Directory**: `.next`
5. Click **Environment Variables** and add:
   * `NEXT_PUBLIC_API_URL` = `https://your-backend.onrender.com/api/v1` (Your Render API URL)

### B. Trigger Build & Deploy
1. Click **Deploy**. Vercel will build the assets and assign a live URL like `https://societyhub-admin.vercel.app`.
2. Go back to Render Dashboard and update your backend environment variable `CORS_ORIGIN` to match this live Vercel URL.

---

## 📱 Step 4 — Mobile App Production (Expo EAS)

To distribute the app to Google Play or Apple App Store, compile it using Expo Application Services.

### A. Configure API URLs
Open `apps/mobile/app.json` and set the production environment configurations:
```json
"extra": {
  "apiUrl": "https://your-backend.onrender.com/api/v1",
  "wsUrl": "wss://your-backend.onrender.com"
}
```

### B. Launch EAS Build
1. Log in to your Expo account in terminal:
   ```bash
   npx expo login
   ```
2. Configure EAS project:
   ```bash
   npm install -g eas-cli
   eas build:configure
   ```
3. Run the production build command:
   * For Android: `eas build --platform android`
   * For iOS: `eas build --platform ios`
4. EAS will compile your package (.apk/.aab/.ipa) and provide a download link on your Expo dashboard.

---

## 🛡️ Production Security Checklist

* **HTTPS & TLS**: Both Render and Vercel issue Let's Encrypt certificates automatically. Verify all API requests are routed through `https://` and websocket connections use `wss://`.
* **Prisma Client Generation**: Ensure `npx prisma generate` runs as a postinstall step in your backend `package.json` to prevent client initialization failures in production.
* **CORS Settings**: Do not use `*` for `CORS_ORIGIN` in production. Only allow your exact Vercel dashboard domain.
* **Regular Backups**: Enable auto-backups on Neon or Supabase to prevent loss of security auditing and resident logs.
