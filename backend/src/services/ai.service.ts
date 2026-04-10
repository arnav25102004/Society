/**
 * AI Service — Complaint triage, committee response drafting, resident chatbot.
 *
 * Provider strategy:
 *   - 'mock'   : Fast rule-based logic. No API key needed. Used in dev by default.
 *   - 'gemini' : Google Gemini API (free tier available at aistudio.google.com)
 *   - 'openai' : OpenAI GPT-4o (set OPENAI_API_KEY)
 *
 * Switch provider via AI_PROVIDER env var.
 */
import { env } from '../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Category =
  | 'plumbing'
  | 'electrical'
  | 'structural'
  | 'sanitation'
  | 'security'
  | 'noise'
  | 'elevator'
  | 'parking'
  | 'internet'
  | 'pest'
  | 'other';

export interface TriageResult {
  priority: Priority;
  category: Category;
  confidence: number; // 0–1
  reasoning: string;  // Shown to committee
  suggestedTitle: string;
  estimatedResolutionHours: number;
  isEmergency: boolean;
}

export interface DraftResponse {
  subject: string;
  body: string;        // Message sent to resident
  internalNote: string; // Note shown only to committee
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  residentName: string;
  flatNumber: string;
  societyName: string;
  pendingDues: number;
  openComplaints: Array<{ title: string; status: string; priority: Priority }>;
  recentAnnouncements: Array<{ title: string; date: string }>;
}

// ─── Mock provider (rule-based, no API) ──────────────────────────────────────

const CRITICAL_KEYWORDS = ['fire', 'flood', 'leak', 'water', 'burst', 'electric shock', 'stuck', 'elevator', 'lift', 'gas', 'smoke', 'break-in', 'theft', 'assault', 'collapsed'];
const HIGH_KEYWORDS = ['no power', 'no electricity', 'no water', 'locked out', 'rat', 'cockroach', 'sewage', 'overflow', 'blocked drain', 'ac not working', 'heater'];
const SECURITY_KEYWORDS = ['break', 'theft', 'stranger', 'cctv', 'guard', 'gate', 'suspicious'];
const PLUMBING_KEYWORDS = ['pipe', 'leak', 'tap', 'drain', 'toilet', 'flush', 'water', 'sink', 'bathroom'];
const ELECTRICAL_KEYWORDS = ['power', 'electricity', 'light', 'fan', 'switch', 'short circuit', 'wire', 'socket'];
const NOISE_KEYWORDS = ['noise', 'loud', 'music', 'party', 'dog barking', 'construction', 'drilling'];
const PARKING_KEYWORDS = ['parking', 'car', 'bike', 'vehicle', 'block'];
const ELEVATOR_KEYWORDS = ['elevator', 'lift', 'stuck'];

function detectCategory(text: string): Category {
  const lower = text.toLowerCase();
  if (ELEVATOR_KEYWORDS.some(k => lower.includes(k))) return 'elevator';
  if (SECURITY_KEYWORDS.some(k => lower.includes(k))) return 'security';
  if (PLUMBING_KEYWORDS.some(k => lower.includes(k))) return 'plumbing';
  if (ELECTRICAL_KEYWORDS.some(k => lower.includes(k))) return 'electrical';
  if (NOISE_KEYWORDS.some(k => lower.includes(k))) return 'noise';
  if (PARKING_KEYWORDS.some(k => lower.includes(k))) return 'parking';
  if (lower.includes('pest') || lower.includes('rat') || lower.includes('cockroach')) return 'pest';
  if (lower.includes('wifi') || lower.includes('internet') || lower.includes('broadband')) return 'internet';
  return 'other';
}

function detectPriority(text: string, category: Category): Priority {
  const lower = text.toLowerCase();
  if (CRITICAL_KEYWORDS.some(k => lower.includes(k))) return 'critical';
  if (category === 'elevator' && lower.includes('stuck')) return 'critical';
  if (category === 'security') return 'high';
  if (HIGH_KEYWORDS.some(k => lower.includes(k))) return 'high';
  if (category === 'pest') return 'high';
  if (category === 'plumbing' || category === 'electrical') return 'medium';
  return 'low';
}

const SLA_HOURS: Record<Priority, number> = {
  critical: 4,
  high: 24,
  medium: 72,
  low: 168,
};

const REASONING_TEMPLATES: Record<Priority, (cat: Category, text: string) => string> = {
  critical: (cat) => `Classified as CRITICAL — ${cat === 'elevator' ? 'person may be trapped' : cat === 'plumbing' ? 'water damage risk to property and electrical systems' : 'immediate safety risk detected'}. SLA: 4 hours.`,
  high: (cat) => `Classified as HIGH — ${cat === 'pest' ? 'health hazard requiring urgent treatment' : cat === 'security' ? 'security threat to residents' : 'affects resident quality of life significantly'}. SLA: 24 hours.`,
  medium: () => `Classified as MEDIUM — functional issue that needs resolution but is not an immediate hazard. SLA: 72 hours.`,
  low: () => `Classified as LOW — cosmetic or minor issue. Can be scheduled at committee's convenience. SLA: 7 days.`,
};

function mockTriage(title: string, description: string): TriageResult {
  const combined = `${title} ${description}`;
  const category = detectCategory(combined);
  const priority = detectPriority(combined, category);

  return {
    priority,
    category,
    confidence: 0.78,
    reasoning: REASONING_TEMPLATES[priority](category, combined),
    suggestedTitle: title.length > 5 ? title : `${category.charAt(0).toUpperCase() + category.slice(1)} issue in flat`,
    estimatedResolutionHours: SLA_HOURS[priority],
    isEmergency: priority === 'critical',
  };
}

function mockDraftResponse(
  residentName: string,
  flatNumber: string,
  triage: TriageResult,
  complaintTitle: string
): DraftResponse {
  const firstName = residentName.split(' ')[0];
  const urgencyPhrase = {
    critical: 'This has been flagged as CRITICAL and our team is being mobilized immediately.',
    high: 'This has been marked HIGH priority and will be addressed within 24 hours.',
    medium: 'This has been assigned MEDIUM priority and will be resolved within 3 working days.',
    low: 'This has been logged and will be addressed during our next scheduled maintenance cycle.',
  }[triage.priority];

  const body = `Hi ${firstName},

Thank you for reporting this issue. We've received your complaint about "${complaintTitle}" from Flat ${flatNumber}.

${urgencyPhrase}

What happens next:
• You'll receive a notification when a technician is assigned
• You can track the live status of your complaint in the SocietyHub app
• Expected resolution: within ${triage.estimatedResolutionHours} hours

If this is an emergency, please use the SOS button in the app or call the guard post directly.

– Society Management Committee`;

  return {
    subject: `Re: Your complaint — ${complaintTitle}`,
    body,
    internalNote: `AI triage: ${triage.priority.toUpperCase()} | Category: ${triage.category} | Confidence: ${Math.round(triage.confidence * 100)}% | ${triage.reasoning}`,
  };
}

// ─── Gemini provider ──────────────────────────────────────────────────────────

async function geminiTriage(title: string, description: string): Promise<TriageResult> {
  const prompt = `You are an AI assistant for a housing society management app in India.

A resident has filed the following complaint:
Title: "${title}"
Description: "${description}"

Analyze this complaint and respond with ONLY valid JSON in this exact format:
{
  "priority": "critical|high|medium|low",
  "category": "plumbing|electrical|structural|sanitation|security|noise|elevator|parking|internet|pest|other",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why you chose this priority (1-2 sentences, shown to committee)",
  "suggestedTitle": "Clean, concise title for this complaint",
  "estimatedResolutionHours": 24,
  "isEmergency": false
}

Priority rules:
- critical: Fire, flooding, gas leak, person trapped in elevator, structural collapse risk, security breach
- high: No electricity/water in flat, sewage overflow, pest infestation, locked out, serious security issue
- medium: Plumbing issues (functional), AC not working, minor electrical, parking disputes
- low: Cosmetic issues, painting, gardening, suggestions`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.ai.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini returned no JSON');
  return JSON.parse(jsonMatch[0]) as TriageResult;
}

async function geminiDraftResponse(
  residentName: string,
  flatNumber: string,
  societyName: string,
  triage: TriageResult,
  complaintTitle: string
): Promise<DraftResponse> {
  const prompt = `You are helping a housing society committee in India respond to a resident complaint.

Resident: ${residentName}, Flat ${flatNumber}, ${societyName}
Complaint: "${complaintTitle}"
AI Priority: ${triage.priority.toUpperCase()}
Category: ${triage.category}
Expected resolution: ${triage.estimatedResolutionHours} hours

Write a warm, professional response from the committee. Keep it brief (under 150 words), empathetic, and specific. Mention what happens next. Include a line about tracking progress in the SocietyHub app.

Respond with ONLY valid JSON:
{
  "subject": "Re: [complaint title]",
  "body": "Full message to send to resident",
  "internalNote": "Brief note for committee eyes only (AI reasoning, suggested action)"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.ai.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini returned no JSON');
  return JSON.parse(jsonMatch[0]) as DraftResponse;
}

async function geminiChat(messages: ChatMessage[], context: ChatContext): Promise<string> {
  const systemContext = `You are SocietyBot, the AI assistant for ${context.societyName} housing society in India.
You are speaking with ${context.residentName} from Flat ${context.flatNumber}.

Their current context:
- Pending dues: ₹${context.pendingDues}
- Open complaints: ${context.openComplaints.length === 0 ? 'None' : context.openComplaints.map(c => `"${c.title}" (${c.status}, ${c.priority} priority)`).join(', ')}
- Recent announcements: ${context.recentAnnouncements.length === 0 ? 'None' : context.recentAnnouncements.map(a => `"${a.title}" on ${a.date}`).join(', ')}

Answer helpfully and concisely. If you don't know something specific, say so honestly and offer to create a ticket for the committee. Respond in the same language as the user (Hindi/English/Hinglish is fine). Keep responses under 100 words.`;

  const contents = [
    { role: 'user', parts: [{ text: systemContext }] },
    ...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.ai.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.5, maxOutputTokens: 300 } }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'I'm having trouble right now. Please try again.';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const aiService = {
  async triageComplaint(title: string, description: string): Promise<TriageResult> {
    try {
      if (env.ai.provider === 'gemini') return await geminiTriage(title, description);
    } catch (err) {
      console.warn('[AI] Gemini triage failed, falling back to mock:', (err as Error).message);
    }
    return mockTriage(title, description);
  },

  async draftCommitteeResponse(
    residentName: string,
    flatNumber: string,
    societyName: string,
    triage: TriageResult,
    complaintTitle: string
  ): Promise<DraftResponse> {
    try {
      if (env.ai.provider === 'gemini') {
        return await geminiDraftResponse(residentName, flatNumber, societyName, triage, complaintTitle);
      }
    } catch (err) {
      console.warn('[AI] Gemini draft failed, falling back to mock:', (err as Error).message);
    }
    return mockDraftResponse(residentName, flatNumber, triage, complaintTitle);
  },

  async chat(messages: ChatMessage[], context: ChatContext): Promise<string> {
    if (env.ai.provider === 'gemini') {
      try {
        return await geminiChat(messages, context);
      } catch (err) {
        console.warn('[AI] Gemini chat failed:', (err as Error).message);
      }
    }
    // Mock fallback for chat
    const last = messages[messages.length - 1]?.content?.toLowerCase() ?? '';
    if (last.includes('due') || last.includes('payment') || last.includes('maintenance')) {
      return context.pendingDues > 0
        ? `You have ₹${context.pendingDues} pending dues. Tap "Pay" on the home screen to pay instantly.`
        : `You have no pending dues! You're all clear.`;
    }
    if (last.includes('complaint') || last.includes('status')) {
      return context.openComplaints.length > 0
        ? `You have ${context.openComplaints.length} open complaint(s): ${context.openComplaints[0].title} is currently ${context.openComplaints[0].status}.`
        : `You have no open complaints. 🎉`;
    }
    return `I'm SocietyBot for ${context.societyName}! I can help you check your dues, complaint status, or society announcements. What would you like to know?`;
  },
};
