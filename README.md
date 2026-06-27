# SocietyHub

A housing-society management app — complaints, visitors, payments, announcements,
marketplace, amenities, SOS, and an AI layer (complaint triage, committee draft replies,
a tool-using resident chatbot, knowledge base, and Smart Agreements).

- **Backend:** Node + Express + TypeScript + Prisma (PostgreSQL) + Redis
- **Mobile:** React Native (Expo)
- **AI:** Groq (OpenAI-compatible) with a rule-based `mock` fallback — no key needed for dev

---

## Prerequisites

- **Node.js** 18+ and npm
- **Docker** + Docker Compose (runs Postgres + Redis)
- **Expo Go** app on your phone, or an Android/iOS emulator (for the mobile app)

---

## 1. Install dependencies

```bash
# from the project root
cd backend && npm install && cd ..
cd apps/mobile && npm install && cd ..
```

## 2. Start the database & cache (Docker)

Postgres runs on host port **5433**, Redis on **6380** (see `docker-compose.yml`).

```bash
npm run db:up        # docker compose up -d  (postgres + redis)
```

To stop / reset later:

```bash
npm run db:down      # stop containers
npm run db:reset     # wipe volumes and restart fresh
```

## 3. Configure environment

The backend reads `backend/.env`. Sensible dev defaults are already committed; the keys that
matter:

```ini
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/societyhub?schema=public"
REDIS_URL="redis://localhost:6380"
PORT=3002
OTP_PROVIDER="console"     # OTP printed to the backend terminal (dev). Master OTP: 000000
AI_PROVIDER="mock"         # "mock" = no key needed. Change to "groq" to use the real LLM.
GROQ_API_KEY=""            # paste a free key from https://console.groq.com, then set AI_PROVIDER="groq"
```

> In dev you can log in with OTP **`000000`**, or read the real OTP from the backend console.

## 4. Run database migrations & seed

```bash
npm run db:migrate   # apply Prisma migrations (creates all tables)
npm run db:seed      # optional: load sample data
```

## 5. Run the backend

```bash
npm run backend      # starts the API on http://localhost:3002 (hot reload)
```

Health check: open `http://localhost:3002/health` → `{ "status": "ok" }`.

## 6. Run the mobile app

In a second terminal:

```bash
npm run mobile       # expo start — scan the QR with Expo Go, or press a/i for emulator
```

> The mobile app points at the backend via `apps/mobile/src/services/api.ts`. If running on a
> physical phone, set the API base URL to your computer's LAN IP (not `localhost`).

---

## Quick start (TL;DR)

```bash
cd backend && npm install && cd ../apps/mobile && npm install && cd ../..
npm run db:up
npm run db:migrate
npm run backend      # terminal 1
npm run mobile       # terminal 2
```

---

## Root npm scripts

| Command | What it does |
|---|---|
| `npm run db:up` | Start Postgres + Redis (Docker) |
| `npm run db:down` | Stop the containers |
| `npm run db:reset` | Wipe volumes and restart the DB fresh |
| `npm run db:migrate` | Run Prisma migrations (`backend`) |
| `npm run db:seed` | Seed sample data (`backend`) |
| `npm run backend` | Start the API dev server |
| `npm run mobile` | Start the Expo dev server |

## Backend-only scripts (`cd backend`)

| Command | What it does |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm test` | Run tests |
| `npm run lint` | Lint |

---

## Enabling the AI features (optional)

The app runs fully without an LLM (rule-based `mock` mode). To switch on the real AI:

1. Get a free key at <https://console.groq.com>.
2. In `backend/.env`: set `GROQ_API_KEY="..."` and `AI_PROVIDER="groq"`.
3. Restart the backend.

Models are configurable via `AI_MODEL_FAST` (triage/draft) and `AI_MODEL_SMART` (chat/agent).
See `docs/AI-STRATEGY.md` and `docs/SECURITY-FEATURES.md` for the design.

## Troubleshooting

- **DB connection refused:** ensure `npm run db:up` is running; Postgres is on port **5433**, not 5432.
- **Port 3002 in use:** change `PORT` in `backend/.env`.
- **Mobile can't reach the API:** use your machine's LAN IP in `apps/mobile/src/services/api.ts`, not `localhost`.
- **Migrations fail:** confirm the DB container is healthy (`docker ps`) before `npm run db:migrate`.
