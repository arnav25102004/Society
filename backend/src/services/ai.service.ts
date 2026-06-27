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
  low: () => `Classified as LOW — cosmetic or minor issue. Can be scheduled at committee convenience. SLA: 7 days.`,
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

Thank you for reporting this issue. We have received your complaint about "${complaintTitle}" from Flat ${flatNumber}.

${urgencyPhrase}

What happens next:
• You will receive a notification when a technician is assigned
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "I'm having trouble right now. Please try again.";
}

// ─── Groq provider (OpenAI-compatible, fetch-based) ──────────────────────────
//
// Groq runs open models (Llama 3.x, gpt-oss) behind an OpenAI-compatible API.
// We use plain fetch (no SDK) to stay consistent with the Gemini path above.
// Triage + draft use Structured Outputs (strict JSON schema) so the model
// physically cannot return malformed JSON — replacing the fragile regex parsing.

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function groqChatCompletion(body: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`${env.ai.groqBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.ai.groqApiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Groq API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

const TRIAGE_JSON_SCHEMA = {
  name: 'complaint_triage',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      category: {
        type: 'string',
        enum: ['plumbing', 'electrical', 'structural', 'sanitation', 'security', 'noise', 'elevator', 'parking', 'internet', 'pest', 'other'],
      },
      confidence: { type: 'number' },
      reasoning: { type: 'string' },
      suggestedTitle: { type: 'string' },
      estimatedResolutionHours: { type: 'integer' },
      isEmergency: { type: 'boolean' },
    },
    required: ['priority', 'category', 'confidence', 'reasoning', 'suggestedTitle', 'estimatedResolutionHours', 'isEmergency'],
  },
} as const;

const DRAFT_JSON_SCHEMA = {
  name: 'committee_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      subject: { type: 'string' },
      body: { type: 'string' },
      internalNote: { type: 'string' },
    },
    required: ['subject', 'body', 'internalNote'],
  },
} as const;

const TRIAGE_SYSTEM_PROMPT = `You are an AI assistant for a housing society management app in India. Analyze the resident's complaint and classify it.

Priority rules:
- critical: Fire, flooding, gas leak, person trapped in elevator, structural collapse risk, security breach
- high: No electricity/water in flat, sewage overflow, pest infestation, locked out, serious security issue
- medium: Plumbing issues (functional), AC not working, minor electrical, parking disputes
- low: Cosmetic issues, painting, gardening, suggestions

estimatedResolutionHours should reflect the priority SLA (critical 4, high 24, medium 72, low 168). reasoning is 1-2 sentences shown to the committee.`;

async function groqTriage(title: string, description: string): Promise<TriageResult> {
  const data = await groqChatCompletion({
    model: env.ai.modelFast,
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: 'json_schema', json_schema: TRIAGE_JSON_SCHEMA },
    messages: [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      { role: 'user', content: `Title: "${title}"\nDescription: "${description}"` },
    ] as GroqMessage[],
  });
  const content = data.choices?.[0]?.message?.content ?? '';
  return JSON.parse(content) as TriageResult;
}

async function groqDraftResponse(
  residentName: string,
  flatNumber: string,
  societyName: string,
  triage: TriageResult,
  complaintTitle: string
): Promise<DraftResponse> {
  const data = await groqChatCompletion({
    model: env.ai.modelFast,
    temperature: 0.4,
    max_tokens: 600,
    response_format: { type: 'json_schema', json_schema: DRAFT_JSON_SCHEMA },
    messages: [
      {
        role: 'system',
        content: `You help a housing society committee in India reply to a resident complaint. Write a warm, professional, empathetic response under 150 words. Mention what happens next and that progress is trackable in the SocietyHub app. internalNote is for committee eyes only (AI reasoning, suggested action).`,
      },
      {
        role: 'user',
        content: `Resident: ${residentName}, Flat ${flatNumber}, ${societyName}\nComplaint: "${complaintTitle}"\nPriority: ${triage.priority.toUpperCase()}\nCategory: ${triage.category}\nExpected resolution: ${triage.estimatedResolutionHours} hours`,
      },
    ] as GroqMessage[],
  });
  const content = data.choices?.[0]?.message?.content ?? '';
  return JSON.parse(content) as DraftResponse;
}

async function groqChat(messages: ChatMessage[], context: ChatContext): Promise<string> {
  const systemPrompt = `You are SocietyBot, the AI assistant for ${context.societyName} housing society in India.
You are speaking with ${context.residentName} from Flat ${context.flatNumber}.

Their current context:
- Pending dues: ₹${context.pendingDues}
- Open complaints: ${context.openComplaints.length === 0 ? 'None' : context.openComplaints.map(c => `"${c.title}" (${c.status}, ${c.priority} priority)`).join(', ')}
- Recent announcements: ${context.recentAnnouncements.length === 0 ? 'None' : context.recentAnnouncements.map(a => `"${a.title}" on ${a.date}`).join(', ')}

Answer helpfully and concisely (under 100 words). If you don't know something specific, say so honestly and offer to create a ticket for the committee. Respond in the same language as the user (Hindi/English/Hinglish is fine).`;

  const data = await groqChatCompletion({
    model: env.ai.modelSmart,
    temperature: 0.5,
    max_tokens: 400,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ] as GroqMessage[],
  });
  return data.choices?.[0]?.message?.content ?? "I'm having trouble right now. Please try again.";
}

// ─── Smart Agreements (Phase 3 — LLM generation, no RAG) ─────────────────────

export type AgreementType = 'rent' | 'lease' | 'leave_license';

export interface AgreementInput {
  type: AgreementType;
  societyName: string;
  flatNumber: string;
  details: Record<string, any>; // landlordName, tenantName, monthlyRent, deposit, durationMonths, startDate, …
}

const AGREEMENT_LABELS: Record<AgreementType, string> = {
  rent: 'Rental Agreement',
  lease: 'Lease Agreement',
  leave_license: 'Leave & License Agreement',
};

function mockGenerateAgreement(input: AgreementInput): string {
  const d = input.details ?? {};
  return `# ${AGREEMENT_LABELS[input.type]}

This ${AGREEMENT_LABELS[input.type]} is made for Flat ${input.flatNumber}, ${input.societyName}.

**Landlord/Licensor:** ${d.landlordName ?? '____'}
**Tenant/Licensee:** ${d.tenantName ?? '____'}
**Monthly Rent:** ₹${d.monthlyRent ?? '____'}
**Security Deposit:** ₹${d.deposit ?? '____'}
**Duration:** ${d.durationMonths ?? '____'} months from ${d.startDate ?? '____'}

## Society-specific clauses
1. The Tenant shall abide by all rules and bylaws of ${input.societyName}.
2. The Tenant shall pay maintenance charges as levied by the society.
3. The Tenant shall register with the society office and obtain gate access.

(Template fallback — set a Groq key for a fully drafted agreement.)`;
}

async function groqGenerateAgreement(input: AgreementInput): Promise<string> {
  const data = await groqChatCompletion({
    model: env.ai.modelSmart,
    temperature: 0.3,
    max_tokens: 2000,
    messages: [
      {
        role: 'system',
        content: `You are a legal document assistant for housing societies in India. Draft a complete, professional ${AGREEMENT_LABELS[input.type]} in Markdown. Use the provided structured details. Include standard clauses (parties, premises, rent/deposit, duration, termination, maintenance, use of premises) AND society-specific clauses (abide by society bylaws, pay society maintenance, register with society office for gate access). Use clear numbered clauses. Leave a blank line for any missing detail rather than inventing it. Output ONLY the agreement document.`,
      },
      {
        role: 'user',
        content: `Society: ${input.societyName}\nFlat: ${input.flatNumber}\nType: ${AGREEMENT_LABELS[input.type]}\nDetails: ${JSON.stringify(input.details)}`,
      },
    ] as GroqMessage[],
  });
  return data.choices?.[0]?.message?.content ?? mockGenerateAgreement(input);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const aiService = {
  async triageComplaint(title: string, description: string): Promise<TriageResult> {
    try {
      if (env.ai.provider === 'groq') return await groqTriage(title, description);
      if (env.ai.provider === 'gemini') return await geminiTriage(title, description);
    } catch (err) {
      console.warn(`[AI] ${env.ai.provider} triage failed, falling back to mock:`, (err as Error).message);
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
      if (env.ai.provider === 'groq') {
        return await groqDraftResponse(residentName, flatNumber, societyName, triage, complaintTitle);
      }
      if (env.ai.provider === 'gemini') {
        return await geminiDraftResponse(residentName, flatNumber, societyName, triage, complaintTitle);
      }
    } catch (err) {
      console.warn(`[AI] ${env.ai.provider} draft failed, falling back to mock:`, (err as Error).message);
    }
    return mockDraftResponse(residentName, flatNumber, triage, complaintTitle);
  },

  async chat(messages: ChatMessage[], context: ChatContext): Promise<string> {
    try {
      if (env.ai.provider === 'groq') return await groqChat(messages, context);
      if (env.ai.provider === 'gemini') return await geminiChat(messages, context);
    } catch (err) {
      console.warn(`[AI] ${env.ai.provider} chat failed, falling back to mock:`, (err as Error).message);
    }
    // Mock fallback for chat
    const last = messages[messages.length - 1]?.content?.toLowerCase() ?? '';
    if (last.includes('due') || last.includes('payment') || last.includes('maintenance')) {
      return context.pendingDues > 0
        ? `You have ₹${context.pendingDues} pending dues. Tap "Pay" on the home screen to pay instantly.`
        : `You have no pending dues! All clear.`;
    }
    if (last.includes('complaint') || last.includes('status')) {
      return context.openComplaints.length > 0
        ? `You have ${context.openComplaints.length} open complaint(s): ${context.openComplaints[0].title} is currently ${context.openComplaints[0].status}.`
        : `You have no open complaints. 🎉`;
    }
    return `I am SocietyBot for ${context.societyName}! I can help you check your dues, complaint status, or society announcements. What would you like to know?`;
  },

  async generateAgreement(input: AgreementInput): Promise<string> {
    try {
      if (env.ai.provider === 'groq') return await groqGenerateAgreement(input);
    } catch (err) {
      console.warn(`[AI] ${env.ai.provider} agreement generation failed, falling back to template:`, (err as Error).message);
    }
    return mockGenerateAgreement(input);
  },
};
