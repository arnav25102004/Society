/**
 * SocietyBot agent — tool-using chatbot loop (Groq tool calling).
 *
 * The model is given a set of tools (see ai.tools.ts) and decides which to call to
 * answer the resident. Unlike the old chat (which pre-fetched ALL context every message),
 * the agent fetches only what a given question needs, via the tools it chooses.
 *
 * Falls back to the simple `aiService.chat` if the provider isn't Groq or the loop errors,
 * so the chatbot never hard-breaks.
 */
import { env } from '../config/env';
import { groqChatCompletion, aiService, ChatMessage, ChatContext } from './ai.service';
import { agentTools, agentToolDefinitions, AgentContext } from './ai.tools';

const MAX_ITERATIONS = 5;   // safety cap on tool-call loops
const MAX_HISTORY = 12;     // bound token growth from long conversations

function systemPrompt(ctx: AgentContext): string {
  return `You are SocietyBot, the AI assistant for ${ctx.societyName} housing society in India.
You are speaking with ${ctx.residentName} from Flat ${ctx.flatNumber}.

Use the available tools to look up real, live information before answering — do not guess about
dues, complaint status, or announcements. Only call create_complaint when the resident clearly
wants to report a problem. For policy/rules questions, use search_knowledge.

Answer concisely (under 120 words). Respond in the same language as the user (Hindi/English/
Hinglish is fine). If a tool reports no data, say so honestly and offer to create a ticket.`;
}

export async function runAgent(
  messages: ChatMessage[],
  ctx: AgentContext,
  fallbackContext: ChatContext
): Promise<string> {
  // Non-Groq providers don't have tool calling wired here — use the simple chat path.
  if (env.ai.provider !== 'groq') {
    return aiService.chat(messages, fallbackContext);
  }

  try {
    const convo: any[] = [
      { role: 'system', content: systemPrompt(ctx) },
      ...messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
    ];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const data = await groqChatCompletion({
        model: env.ai.modelSmart,
        temperature: 0.4,
        max_tokens: 600,
        tools: agentToolDefinitions,
        tool_choice: 'auto',
        messages: convo,
      });

      const msg = data.choices?.[0]?.message;
      if (!msg) break;
      convo.push(msg);

      const toolCalls = msg.tool_calls as
        | Array<{ id: string; function: { name: string; arguments: string } }>
        | undefined;

      // No tool calls → the model produced its final answer.
      if (!toolCalls || toolCalls.length === 0) {
        return msg.content ?? '';
      }

      // Execute each requested tool. Handlers re-scope to ctx (server-side authz).
      for (const call of toolCalls) {
        const tool = agentTools[call.function.name];
        let result: string;
        if (!tool) {
          result = JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
        } else {
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(call.function.arguments || '{}');
          } catch {
            /* leave args empty on malformed JSON */
          }
          try {
            result = await tool.handler(args, ctx);
          } catch (err) {
            result = JSON.stringify({ error: (err as Error).message });
          }
        }
        convo.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }

    // Iterations exhausted — ask for a final answer with tools disabled.
    const finalData = await groqChatCompletion({
      model: env.ai.modelSmart,
      temperature: 0.4,
      max_tokens: 400,
      messages: convo,
    });
    return finalData.choices?.[0]?.message?.content ?? "I'm having trouble right now. Please try again.";
  } catch (err) {
    console.warn('[AI] agent loop failed, falling back to simple chat:', (err as Error).message);
    return aiService.chat(messages, fallbackContext);
  }
}
