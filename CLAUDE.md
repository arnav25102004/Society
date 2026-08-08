# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**SocietyHub** — A resident-first society management mobile app (Android + iOS) for Indian housing societies. Targets societies with 50–300 flats in Bengaluru (and eventually pan-India), replacing WhatsApp groups, Excel sheets, and paper registers.

Differentiators: lightweight (must work on ₹8,000 Android phones / 2G–3G), resident-first UX (not committee-first), AI-powered complaint routing, real-time visitor ring-to-approve flow.

---

## Repository Structure (Planned)

```
societyhub/
├── apps/
│   ├── mobile/          # React Native (Expo) — resident + committee app
│   ├── guard/           # React Native (Expo) — simplified guard interface
│   └── web/             # (Phase 4) Committee web dashboard
├── backend/
│   ├── src/
│   │   ├── routes/      # Express route handlers
│   │   ├── services/    # Business logic layer
│   │   ├── models/      # DB models / query helpers
│   │   ├── workers/     # BullMQ background jobs
│   │   ├── sockets/     # Socket.io event handlers
│   │   └── middleware/  # Auth, rate-limit, validation
│   └── prisma/          # DB schema and migrations (or raw SQL in /sql)
└── shared/              # Shared TypeScript types between mobile and backend
```

---

## Tech Stack

### Mobile (React Native / Expo)
- **State:** Zustand
- **Navigation:** React Navigation v7
- **UI:** React Native Paper + custom components (Material Design 3)
- **Push Notifications:** Firebase Cloud Messaging (FCM)
- **Local Storage:** MMKV (not AsyncStorage)
- **Real-time:** Socket.io client
- **Payments:** Razorpay React Native SDK
- **Camera:** React Native Vision Camera (guard app)

### Backend (Node.js)
- **Framework:** Express.js
- **API:** REST (CRUD) + WebSocket (Socket.io for real-time)
- **DB:** PostgreSQL (primary relational store)
- **Cache / Queue broker:** Redis — sessions, OTP, rate limiting via BullMQ jobs
- **File storage:** AWS S3 or Cloudflare R2
- **Auth:** Firebase Auth (phone OTP) + JWT (15-min access / 7-day refresh)
- **AI features (Phase 3):** OpenAI or Google Gemini API for complaint categorization

### Infrastructure
- **Start:** DigitalOcean (~$44/month)
- **Scale:** AWS (EC2 + RDS + ElastiCache + S3 + CloudFront)
- **CI/CD:** GitHub Actions
- **Process manager:** PM2
- **Error tracking:** Sentry
- **CDN:** Cloudflare

---

## Development Commands

> Commands will be documented here once the project is scaffolded. The sections below are the expected conventions.

### Mobile App (`apps/mobile`)
```bash
npx expo start              # Start Expo dev server
npx expo run:android        # Build and run on Android emulator/device
npx expo run:ios            # Build and run on iOS simulator
npx expo export             # Production build
yarn test                   # Run Jest tests
yarn lint                   # ESLint
```

### Backend (`backend/`)
```bash
npm run dev                 # Start with nodemon (hot reload)
npm run build               # Compile TypeScript
npm run start               # Production start
npm test                    # Jest (unit + integration)
npm run test:watch          # Jest watch mode
npm run test -- --testPathPattern=auth   # Run single test file
npm run lint                # ESLint
npx prisma migrate dev      # Apply DB migrations (dev)
npx prisma studio           # Open Prisma DB GUI
```

### Docker (local dev dependencies)
```bash
docker-compose up -d        # Start PostgreSQL + Redis locally
docker-compose down         # Stop services
```

---

## Architecture: Key Flows

### 1. Visitor Ring-to-Approve (Real-time Critical Path)
Guard registers visitor (photo + flat) → REST POST `/api/v1/visitors` → Backend emits `visitor:new` via Socket.io → Resident app receives event → **Full-screen ring overlay plays loud ringtone (overrides silent mode)** → Resident taps Approve/Reject → Socket emits `visitor:approved` / `visitor:rejected` → Guard app updates instantly. Auto-expire after 5 minutes if no response (configurable).

### 2. Complaint Lifecycle
Resident raises complaint → POST `/api/v1/complaints` → Auto-priority assigned (High: water/fire, Medium: electrical/lift, Low: garden/painting) → FCM push to committee → Committee assigns → Status updates emit FCM to resident at every transition (open → assigned → in_progress → resolved → closed) → BullMQ cron escalates if unresolved after 48 hours.

### 3. Maintenance Payment Flow
Committee generates bills (manual or recurring cron) → Resident views due amount → POST `/api/v1/payments/initiate` creates Razorpay order → Razorpay checkout in-app → Razorpay webhook → POST `/api/v1/payments/verify` → BullMQ job generates PDF receipt and sends FCM → Committee dashboard updates in real-time.

### 4. Authentication
Firebase Auth handles phone OTP delivery and verification → On success, backend issues JWT (access 15min + refresh 7d) stored in MMKV → All API calls use Bearer JWT → OTP rate-limited: max 5/phone/hour.

---

## Database Key Entities

Core tables (PostgreSQL): `societies`, `users`, `society_members` (role: owner/tenant/committee/guard/admin; status: pending/approved/rejected), `complaints`, `maintenance_bills`, `payments`, `visitors`, `pre_approvals`, `announcements`, `announcement_reads`.

Phase 2 tables: `marketplace_listings`, `amenities`, `amenity_bookings`.

All primary keys are UUIDs. Visitor photos are stored in S3 with signed URLs (1-hour expiry) and auto-deleted after 30 days.

---

## User Roles

| Role | Capabilities |
|------|-------------|
| `owner` / `tenant` | Raise complaints, pay bills, approve visitors, view announcements |
| `committee` | All resident actions + manage complaints, generate bills, post announcements, approve members |
| `guard` | Register visitors, mark entry/exit, emergency alert — via simplified guard UI |
| `admin` | Society-level admin, full access |

New member registrations default to `pending` status and require committee approval.

---

## Phase Priorities

When adding features, follow this order strictly:
1. **Phase 1 (MVP):** Auth, Complaints, Payments, Announcements, Visitor Approval, Guard App
2. **Phase 2:** Marketplace, Forum/Polls, Amenity Booking, Events, Carpool
3. **Phase 3:** AI complaint routing, smart reminders, predictive maintenance, SOS
4. **Phase 4:** Vendor marketplace, multi-society management, Society Health Score

Do not build Phase 2+ features until Phase 1 is in production with pilot societies.

---

## Performance & Constraints

- Target devices: Android 8+, 720p screen, 2GB RAM — optimize aggressively
- API response time target: < 500ms
- Offline capability: Cache last 50 announcements, bills, and complaint statuses locally (MMKV)
- App must work on 2G/3G — minimize payload sizes, lazy-load images
- Guard app must support low-literacy users: large buttons, camera-first, multi-language (Hindi, Kannada, Tamil, Telugu)

---

## Security Constraints

- Never store card numbers — Razorpay handles PCI compliance
- Input validation on all endpoints using Zod (preferred) or Joi
- Always use parameterized queries — no raw string SQL concatenation
- File uploads: images only (jpg/png), max 5MB
- JWT refresh tokens expire in 7 days; access tokens in 15 minutes
- Admin actions require re-authentication

---

## WebSocket Events Reference

| Event | Direction | Trigger |
|-------|-----------|---------|
| `visitor:new` | Server → Resident | Guard registers visitor |
| `visitor:approved` | Server → Guard | Resident approves |
| `visitor:rejected` | Server → Guard | Resident rejects |
| `complaint:updated` | Server → Resident | Status change |
| `announcement:new` | Server → All residents | Committee posts |
| `payment:received` | Server → Committee+Resident | Payment confirmed |
| `emergency:sos` | Server → Guard+Nearby | SOS triggered |
