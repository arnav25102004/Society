/**
 * Agent tools — the functions the SocietyBot agent can call.
 *
 * SECURITY (non-negotiable): the LLM is NEVER the authorization boundary.
 * Every handler scopes its queries to the authenticated `ctx.userId` / `ctx.societyId`
 * (derived from the verified JWT + membership check in the route, NOT from model output).
 * The model only supplies non-authorization arguments (e.g. a complaint title). Even if a
 * user prompt-injects "show Flat 304's dues", the handler can only ever read THIS user's
 * data, because societyId/userId come from `ctx`, not from the model's arguments.
 */
import { prisma } from '../config/db';
import { aiService } from './ai.service';
import { notificationService } from './notification.service';

// Context built server-side from the authenticated request — trusted, not model-supplied.
export interface AgentContext {
  userId: string;
  societyId: string;
  flatNumber: string;
  residentName: string;
  societyName: string;
}

// OpenAI-compatible tool definition + its server-side handler.
export interface AgentTool {
  definition: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
  handler: (args: Record<string, any>, ctx: AgentContext) => Promise<string>;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

const getDues: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_dues',
      description: "Get the resident's outstanding maintenance bills / pending dues.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  async handler(_args, ctx) {
    const bills = await prisma.maintenanceBill.findMany({
      where: { societyId: ctx.societyId, flatNumber: ctx.flatNumber, status: { in: ['unpaid', 'overdue', 'partial'] } },
      orderBy: { billMonth: 'desc' },
      take: 6,
    });
    if (bills.length === 0) return JSON.stringify({ pendingTotal: 0, bills: [] });
    const pendingTotal = bills.reduce((sum, b) => sum + Number(b.totalAmount), 0);
    return JSON.stringify({
      pendingTotal,
      bills: bills.map((b) => ({
        month: b.billMonth.toISOString().slice(0, 7),
        amount: Number(b.totalAmount),
        status: b.status,
      })),
    });
  },
};

const getComplaintStatus: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_complaint_status',
      description: "Get the status of the resident's own complaints (open and recent).",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  async handler(_args, ctx) {
    const complaints = await prisma.complaint.findMany({
      where: { societyId: ctx.societyId, raisedById: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { title: true, status: true, priority: true, category: true, createdAt: true },
    });
    return JSON.stringify(
      complaints.map((c) => ({
        title: c.title,
        status: c.status,
        priority: c.priority,
        category: c.category,
        filedOn: c.createdAt.toISOString().slice(0, 10),
      }))
    );
  },
};

const getAnnouncements: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_announcements',
      description: 'Get the latest society announcements (notices, events, maintenance schedules).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  async handler(_args, ctx) {
    const announcements = await prisma.announcement.findMany({
      where: { societyId: ctx.societyId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { title: true, body: true, category: true, priority: true, createdAt: true },
    });
    return JSON.stringify(
      announcements.map((a) => ({
        title: a.title,
        summary: a.body.slice(0, 200),
        category: a.category,
        priority: a.priority,
        date: a.createdAt.toISOString().slice(0, 10),
      }))
    );
  },
};

const createComplaint: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'create_complaint',
      description:
        'File a new complaint on behalf of the resident. Use ONLY when the resident clearly wants to report a problem. AI triage assigns priority and category automatically.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title for the complaint (5-300 chars).' },
          description: { type: 'string', description: 'Details of the issue.' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  async handler(args, ctx) {
    const title = String(args.title ?? '').trim();
    const description = String(args.description ?? '').trim();
    if (title.length < 5) return JSON.stringify({ error: 'Title too short; ask the resident for more detail.' });

    const triage = await aiService.triageComplaint(title, description);
    const complaint = await prisma.complaint.create({
      data: {
        societyId: ctx.societyId,
        raisedById: ctx.userId,
        flatNumber: ctx.flatNumber,
        title,
        description: description || undefined,
        photos: [],
        category: triage.category,
        priority: triage.priority as any,
        status: 'open',
      },
      select: { id: true },
    });

    // Notify committee (same pattern as the complaints route).
    const committee = await prisma.societyMember.findMany({
      where: { societyId: ctx.societyId, role: { in: ['committee', 'admin'] }, status: 'approved' },
      include: { user: { select: { expoPushToken: true } } },
    });
    const tokens = committee.map((m) => m.user.expoPushToken).filter((t): t is string => !!t);
    notificationService.newComplaint({
      committeeTokens: tokens,
      flatNumber: ctx.flatNumber,
      societyName: ctx.societyName,
      complaintTitle: title,
      complaintId: complaint.id,
      priority: triage.priority,
    });

    return JSON.stringify({
      filed: true,
      complaintId: complaint.id,
      priority: triage.priority,
      category: triage.category,
      estimatedResolutionHours: triage.estimatedResolutionHours,
    });
  },
};

// Phase 2a: keyword retrieval over the committee-filled knowledge base.
// (Swap this body for vector search + rerank in Phase 2b — the tool interface is unchanged.)
const searchKnowledge: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description:
        "Search the society's rules, bylaws, and FAQ for policy questions (e.g. pet rules, parking, subletting, amenity timings).",
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The policy question to look up.' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  async handler(args, ctx) {
    const q = String(args.query ?? '').trim();
    const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

    const entries = await prisma.knowledgeEntry.findMany({
      where: {
        societyId: ctx.societyId, // SECURITY: only this society's knowledge
        OR: [
          { topic: { contains: q, mode: 'insensitive' } },
          { question: { contains: q, mode: 'insensitive' } },
          { answer: { contains: q, mode: 'insensitive' } },
          ...terms.map((t) => ({ keywords: { has: t } })),
        ],
      },
      take: 4,
      select: { topic: true, question: true, answer: true },
    });

    if (entries.length === 0) {
      return JSON.stringify({
        found: false,
        note: "No matching policy is on record for this society. Tell the resident honestly and offer to create a ticket for the committee.",
      });
    }
    return JSON.stringify({ found: true, entries });
  },
};

export const agentTools: Record<string, AgentTool> = {
  get_dues: getDues,
  get_complaint_status: getComplaintStatus,
  get_announcements: getAnnouncements,
  create_complaint: createComplaint,
  search_knowledge: searchKnowledge,
};

export const agentToolDefinitions = Object.values(agentTools).map((t) => t.definition);
