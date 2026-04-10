# SocietyHub — Feature Strategy
## Built on Real Pain Points from MyGate, NoBrokerHood, ApnaComplex users

---

## WHAT COMPETITORS GET WRONG (Real user complaints, researched)

| Problem | App | Our Fix |
|---------|-----|---------|
| Complaints filed, never resolved, no update | NoBrokerHood | Swiggy-style live tracker + mandatory committee SLA |
| Bot doesn't know about yesterday's ticket | NoBrokerHood | AI with full context window per user |
| 3-4 ad notifications daily disguised as alerts | MyGate | Zero ads. Ever. No exceptions. |
| Domestic workers can't see their own ratings | MyGate | Worker Digital ID — workers own their data |
| App unusable in elevator/parking (no internet) | MyGate | Full offline mode — queue syncs when connected |
| Committee handover loses all historical data | All | Full audit trail, every action is permanent record |
| Residents don't trust committee's Excel sheets | All | Immutable expense ledger, every rupee traceable |
| Silent mode blocks visitor ring | All | Visitor ring bypasses silent mode (critical) |
| New societies can't afford ₹5,000/month | MyGate | Free tier for societies under 50 flats forever |
| No acknowledgement for 5 days on a ticket | NoBrokerHood | AI auto-acknowledges in 30 seconds, SLA enforced |
| Privacy violation — resident data sold | NoBrokerHood | Data stays in your society. No cross-selling. |

---

## OUR UNIQUE FEATURE SET

### 🤖 AI LAYER (What no Indian society app has)

#### 1. AI Complaint Triage Engine
**Problem it solves:** Committee gets flooded with complaints, can't prioritize. Residents wait days.

How it works:
- Resident files complaint with text + optional photo
- AI (Gemini/OpenAI) reads the text, analyzes the photo if attached
- Assigns priority: CRITICAL / HIGH / MEDIUM / LOW
- Assigns category: Plumbing / Electrical / Structural / Sanitation / Security / Noise / Other
- Explains reasoning: "Water leak near electrical panel — classified Critical because of electrocution risk"
- Committee sees AI recommendation, can override with one tap

Priority rules (AI-enforced):
- CRITICAL: Water leak, fire hazard, elevator stuck, structural damage, security breach
- HIGH: No power in flat, AC failure in summer, locked out, pest infestation
- MEDIUM: Plumbing issue (functional), parking dispute, garden maintenance
- LOW: Paint scuffs, minor cosmetic issues, suggestion requests

SLA enforcement:
- CRITICAL: Must be assigned within 1 hour, resolved within 4 hours. Auto-escalates to committee chairman.
- HIGH: Assigned within 4 hours, resolved within 24 hours
- MEDIUM: Assigned within 24 hours, resolved within 72 hours
- LOW: Assigned within 72 hours, resolved within 7 days

If SLA breached → Auto-post to society notice board + notify all committee members

---

#### 2. AI Committee Assistant — "Draft & Send"
**Problem it solves:** Residents file complaints and hear nothing for days. Committee is busy.

How it works:
- When complaint is filed, AI immediately drafts a response on behalf of the committee
- Response is personalized, empathetic, and specific to the complaint type
- Example: "Hi Rahul, we've received your complaint about the water leak in A-204. This has been marked HIGH priority and assigned to our plumbing team. You can expect a call from Ramesh (our plumber) within 2 hours. We apologize for the inconvenience."
- Committee member gets one screen: "AI drafted this response — Approve / Edit / Ignore"
- If committee approves: sent to resident instantly
- If committee ignores for 30 minutes: sent automatically (configurable)

Result: Resident gets a response within minutes even if committee is sleeping.

---

#### 3. AI Resident Chatbot — "Ask SocietyHub"
**Problem it solves:** Residents call committee at 11 PM asking "when is maintenance due?" or "what's my complaint status?"

How it works:
- Accessible from home screen — "Ask anything about your society"
- Has full context: your bills, your complaint history, society announcements, amenity availability
- Answers instantly, 24/7
- Sample queries it handles:
  - "What's the status of my water complaint?"
  - "Do I have any pending dues?"
  - "When is the next society AGM?"
  - "Is the gym available tomorrow 7 AM?"
  - "Who do I call for lift maintenance?"
  - "What's the society's bank account number for NEFT?"
- If it can't answer: creates a ticket for committee, notifies them

---

#### 4. AI Smart Notification Filter
**Problem it solves:** MyGate sends 3-4 ad notifications daily. Users turn off all notifications. Then miss real alerts.

How it works:
- Every notification is scored by AI: Urgent / Informational / FYI
- User sets threshold: "Only wake me for Urgent"
- Urgent (bypass silent mode): Visitor at gate, SOS emergency, CRITICAL complaint update
- Informational (normal notification): Complaint status change, payment receipt, new announcement
- FYI (badge only, no sound): Marketplace listing, event reminder, weather
- Zero promotional notifications. Committed in our Terms.

---

#### 5. AI Expense Fraud Detection
**Problem it solves:** Residents don't trust committee expense reports. Corruption is common.

How it works:
- Committee logs every expense (vendor, amount, category, photo of bill)
- AI compares against:
  - Historical averages for that category
  - Market rates for that service in that city
  - Frequency anomalies (e.g., elevator "repaired" 5 times in one month)
- If anomaly detected: flags to all committee members + shows in transparency dashboard
- Example alert: "Painting expense of ₹85,000 is 3.2x the average for a society your size. Verify this bill."

---

#### 6. Predictive Maintenance AI
**Problem it solves:** Reactive maintenance — things break, then get fixed. No prevention.

How it works:
- Tracks all past maintenance: elevators, water pumps, generators, common areas
- Learns patterns: "Elevator Motor B fails every ~85 days"
- Sends proactive alerts: "Elevator 2 is due for service in 8 days (last serviced 82 days ago)"
- Committee can one-tap schedule a vendor
- Shows cost comparison: Preventive service ₹3,000 vs. Emergency repair ₹25,000

---

### 🏠 CORE FEATURES (Done better than anyone)

#### 7. Swiggy-Style Complaint Tracker
**Problem it solves:** Residents file complaint, then silence. They don't know if anyone read it.

Every complaint has a live progress bar:
```
[●]─────────────────────────────────────────[ ]
Received  AI Triaged  Assigned  In Progress  Done

"Your complaint was received 12 mins ago.
 AI classified it as HIGH priority (Plumbing).
 Ramesh (Plumber) has been assigned and will
 arrive between 2 PM – 4 PM today."
```
Resident gets push notification + in-app update at every stage.

---

#### 8. Domestic Worker Digital ID
**Problem it solves:** MyGate lets owners rate maids but maids can't see ratings or contest them. Discriminatory.

How it works:
- Worker registers once (name, photo, phone) — takes 2 minutes at guard post
- Gets a unique QR code (printable / WhatsApp shareable)
- At gate: guard scans QR → auto-approved at all flats where they're pre-approved
- Worker can see their own ratings via a simple SMS link
- Owners can privately flag issues, but ratings are two-way — workers rate employers too
- Data belongs to the worker, not the society

---

#### 9. Family Flat Sharing
**Problem it solves:** Only the flat owner registers. Spouse/parents miss visitor approvals.

- Multiple family members under one flat
- Primary resident sets permissions: "Spouse can approve visitors", "Parents can only view"
- Visitor ring goes to all permitted family members — first to respond wins
- Each person gets their own login, same flat

---

#### 10. Offline-First Architecture
**Problem it solves:** Elevators, parking garages, basement — no signal. App breaks.

- All critical data cached locally (MMKV)
- Guard can register visitors, approve/reject, log entries — completely offline
- Everything syncs automatically when internet returns
- "Offline mode active — your actions will sync shortly" banner shown
- Works on 2G — all API responses compressed, images lazy-loaded

---

#### 11. Society Transparency Dashboard (Public)
**Problem it solves:** Prospective residents have no way to evaluate how well-managed a society is.

Public scorecard for every registered society:
- Complaint Resolution Rate (last 90 days)
- Average resolution time vs. city average
- Payment collection rate
- Community engagement score
- Last 3 announcements (to see how active committee is)

Residents use this to evaluate societies before renting/buying.
Committees are incentivized to perform well (public accountability).

---

#### 12. Zero-Trust Payment Transparency
**Problem it solves:** Residents pay ₹3,500/month but don't know where it goes.

- Every payment: resident sees exact account it goes to (society account, not personal)
- Receipt generated in 5 seconds
- Monthly "Your money this month" breakdown:
  ```
  ₹3,500 = Security ₹1,050 + Cleaning ₹700 + Electricity ₹525 + 
            Elevator AMC ₹350 + Sinking Fund ₹350 + Admin ₹175 + Reserve ₹350
  ```
- Resident can tap any line item to see actual invoices
- Committee cannot edit past expense entries (immutable ledger)

---

#### 13. WhatsApp Bridge (No App Needed)
**Problem it solves:** Elderly residents / non-smartphone users can't use apps.

- Society gets a WhatsApp Business number
- Residents text: "Status of my complaint" → AI replies with update
- Guard texts visitor photo → system processes, sends ring to resident via WhatsApp
- Resident replies "1" to approve, "2" to reject
- Works on any phone with WhatsApp (no install needed)

---

#### 14. SOS Emergency System
- One-tap SOS from home screen (also accessible from lock screen widget)
- Types: Medical / Fire / Security / Stuck in Elevator
- Broadcasts to: All guards on duty + 5 nearest neighbors + designated emergency contacts
- Auto-calls guard post
- Senior citizen daily check-in: "Tap here to confirm you're OK" — if not tapped by 10 AM → alerts designated neighbor
- Stays on-screen until resolved (can't accidentally dismiss)

---

#### 15. Escalation Chain (Auto-enforced)
If a complaint is not resolved within SLA:

```
Hour 0:    Complaint filed → AI triages → Staff assigned
Hour 4:    Not resolved → All committee members notified
Hour 24:   Not resolved → Posted to society notice board (public pressure)
Hour 48:   Not resolved → Flagged in Society Transparency Dashboard
Day 7:     Not resolved → Escalated to building admin / management company
Day 14:    Not resolved → Listed on "Chronic Issues" public report
```

Residents can see exactly where in this chain their complaint is.

---

## IMPLEMENTATION PRIORITY

### Phase 1 MVP (Now building):
1. ✅ Auth + Society join
2. ✅ Complaint filing
3. 🔄 AI Triage Engine (rules-based fallback, Gemini when key available)
4. 🔄 AI Committee Assistant (draft response)
5. 🔄 Swiggy-style complaint tracker
6. ✅ Payments
7. ✅ Visitor approval / Gate
8. ✅ Announcements

### Phase 2 (Month 2-3):
- AI Resident Chatbot
- Domestic Worker Digital ID
- Family Flat Sharing
- Offline-first sync
- Society Transparency Dashboard

### Phase 3 (Month 4-6):
- WhatsApp Bridge
- AI Expense Fraud Detection
- Predictive Maintenance
- AI Smart Notification Filter
- SOS Emergency System

---

## WHY THIS WINS

| Feature | MyGate | NoBrokerHood | SocietyHub |
|---------|--------|--------------|------------|
| AI complaint triage | ❌ | ❌ | ✅ |
| AI committee response drafting | ❌ | ❌ | ✅ |
| AI resident chatbot (24/7) | ❌ | ❌ | ✅ |
| Swiggy-style live tracker | ❌ | ❌ | ✅ |
| Worker Digital ID (two-way ratings) | ❌ | ❌ | ✅ |
| Offline-first | ❌ | ❌ | ✅ |
| Zero ad notifications | ❌ | ❌ | ✅ |
| Immutable expense ledger | ❌ | ❌ | ✅ |
| Public transparency dashboard | ❌ | ❌ | ✅ |
| Free tier (small societies) | ❌ | Partial | ✅ |
| WhatsApp bridge (no app needed) | ❌ | ❌ | ✅ |
