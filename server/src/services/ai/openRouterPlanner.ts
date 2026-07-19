import type { PlanNextRequest, PlanNextResponse } from '@ai-dj/shared';
import type { DJPlanner } from './types.js';
import { scoreCandidate } from './heuristicPlanner.js';
import { finalizePlan } from './claudePlanner.js';
import {
  AGENT_SYSTEM_PROMPT,
  AGENT_TOOLS,
  AGENT_TOOL_MAP,
  SUBMIT_PLAN_TOOL,
  buildAgentPrompt,
  type SubmitPlanInput,
  type ToolContext,
  type ToolDef,
} from './tools.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Same tier as the direct Anthropic planner's default (verified live in OpenRouter's catalog). */
const MODEL = process.env.AI_DJ_OPENROUTER_MODEL ?? 'anthropic/claude-opus-4.8';
const MAX_AGENT_TURNS = 6;

// ── OpenAI-compatible chat-completions wire types (minimal, just what we use) ──
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}
interface OpenAIResponse {
  choices?: Array<{ message: OpenAIMessage; finish_reason: string }>;
  error?: { message?: string };
}

function toFunctionTool(def: ToolDef) {
  return { type: 'function' as const, function: { name: def.name, description: def.description, parameters: def.input_schema } };
}

/**
 * Same tool-using agent as ClaudePlanner, routed through OpenRouter's
 * OpenAI-compatible /chat/completions endpoint instead of a direct Anthropic
 * API key — lets the app run the LLM planner off an OpenRouter account
 * (any of its Claude, or other, models) rather than requiring
 * ANTHROPIC_API_KEY. Shares the tool registry, system prompt and
 * plan-finalizing logic with ClaudePlanner so both stay in lockstep.
 */
export class OpenRouterPlanner implements DJPlanner {
  readonly name = 'openrouter';

  isAvailable(): boolean {
    return Boolean(process.env.OPENROUTER_API_KEY);
  }

  async planNext(req: PlanNextRequest): Promise<PlanNextResponse> {
    const scores = req.candidates.map((t) => scoreCandidate(t, req)).sort((a, b) => b.total - a.total);
    const shortlist = scores.slice(0, 12).map((s) => req.candidates.find((t) => t.id === s.trackId)!);

    const ctx: ToolContext = { req, knownTracks: new Map(shortlist.map((t) => [t.id, t])) };
    const tools = [...AGENT_TOOLS.map((t) => t.definition), SUBMIT_PLAN_TOOL].map(toFunctionTool);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      { role: 'user', content: buildAgentPrompt(req, shortlist) },
    ];

    let submitted: SubmitPlanInput | null = null;

    for (let turn = 0; turn < MAX_AGENT_TURNS && !submitted; turn++) {
      const forceFinish = turn === MAX_AGENT_TURNS - 1;
      const message = await this.chat(messages, tools, forceFinish);
      messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        // Answered in plain text instead of calling a tool — let the caller
        // fall back to the next planner rather than guessing at a decision.
        break;
      }

      for (const call of message.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function.arguments || '{}');
        } catch {
          // Malformed arguments — the tool below reports back to the model.
        }
        if (call.function.name === 'submit_plan') {
          submitted = input as unknown as SubmitPlanInput;
          continue;
        }
        const tool = AGENT_TOOL_MAP.get(call.function.name);
        const result = tool ? await tool.run(input, ctx) : { error: `unknown tool: ${call.function.name}` };
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    if (!submitted) throw new Error('openrouter agent did not submit a plan within the turn budget');
    return finalizePlan(req, ctx, shortlist, scores, submitted, 'openrouter');
  }

  private async chat(
    messages: OpenAIMessage[],
    tools: ReturnType<typeof toFunctionTool>[],
    forceFinish: boolean,
  ): Promise<OpenAIMessage> {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.AI_DJ_PUBLIC_URL ?? 'https://github.com/Edgar-Manuel/Dj-ia',
        'X-Title': 'AI DJ',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages,
        tools,
        tool_choice: forceFinish ? { type: 'function', function: { name: 'submit_plan' } } : 'auto',
      }),
    });

    const body = (await res.json()) as OpenAIResponse;
    if (!res.ok || body.error) {
      throw new Error(`OpenRouter error: ${body.error?.message ?? res.status}`);
    }
    const message = body.choices?.[0]?.message;
    if (!message) throw new Error('OpenRouter returned no message');
    return message;
  }
}
