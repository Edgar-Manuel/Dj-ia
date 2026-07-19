import Anthropic from '@anthropic-ai/sdk';
import {
  TRANSITION_MAP,
  type PlanNextRequest,
  type PlanNextResponse,
  type TransitionType,
} from '@ai-dj/shared';
import type { DJPlanner } from './types.js';
import { planTransition, scoreCandidate } from './heuristicPlanner.js';
import {
  AGENT_SYSTEM_PROMPT,
  AGENT_TOOLS,
  AGENT_TOOL_MAP,
  SUBMIT_PLAN_TOOL,
  buildAgentPrompt,
  type SubmitPlanInput,
  type ToolContext,
} from './tools.js';

const MODEL = process.env.AI_DJ_CLAUDE_MODEL ?? 'claude-opus-4-8';
/** Safety net: forces a submit_plan call on the last turn so the loop always terminates. */
const MAX_AGENT_TURNS = 6;

/**
 * Claude-backed planner, calling the Anthropic API directly, run as a
 * tool-using agent (brainstorm §2 / HANDOFF §4B): it plans, consults
 * get_trends/get_library when useful, and must validate its pick with
 * critique_mix before submitting — the "measure → critique → correct" loop
 * applied to the LLM's own decision, not just the local brain. Enabled when
 * ANTHROPIC_API_KEY is present; any failure (malformed output, network,
 * exhausted turn budget) throws and services/ai/index.ts falls back to the
 * next planner (OpenRouter, then heuristics).
 */
export class ClaudePlanner implements DJPlanner {
  readonly name = 'claude';
  private client: Anthropic | null = null;

  isAvailable(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.client) this.client = new Anthropic();
    return this.client;
  }

  async planNext(req: PlanNextRequest): Promise<PlanNextResponse> {
    const scores = req.candidates.map((t) => scoreCandidate(t, req)).sort((a, b) => b.total - a.total);
    const shortlist = scores.slice(0, 12).map((s) => req.candidates.find((t) => t.id === s.trackId)!);

    const ctx: ToolContext = { req, knownTracks: new Map(shortlist.map((t) => [t.id, t])) };
    const tools = [...AGENT_TOOLS.map((t) => t.definition), SUBMIT_PLAN_TOOL] as Anthropic.Tool[];

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildAgentPrompt(req, shortlist) },
    ];

    const client = this.getClient();
    let submitted: SubmitPlanInput | null = null;

    for (let turn = 0; turn < MAX_AGENT_TURNS && !submitted; turn++) {
      const forceFinish = turn === MAX_AGENT_TURNS - 1;
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: AGENT_SYSTEM_PROMPT,
        tools,
        tool_choice: forceFinish ? { type: 'tool', name: 'submit_plan' } : { type: 'auto' },
        messages,
      });

      messages.push({ role: 'assistant', content: response.content as unknown as Anthropic.ContentBlockParam[] });

      if (response.stop_reason !== 'tool_use') {
        // Answered in plain text instead of calling a tool — let the caller
        // fall back to heuristics rather than guessing at a decision.
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        if (block.name === 'submit_plan') {
          submitted = block.input as SubmitPlanInput;
          break;
        }
        const tool = AGENT_TOOL_MAP.get(block.name);
        const result = tool
          ? await tool.run(block.input as Record<string, unknown>, ctx)
          : { error: `unknown tool: ${block.name}` };
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      if (submitted) break;
      messages.push({ role: 'user', content: toolResults });
    }

    if (!submitted) throw new Error('claude agent did not submit a plan within the turn budget');
    return finalizePlan(req, ctx, shortlist, scores, submitted, 'claude');
  }
}

/** Shared by every agent planner: turn the model's submit_plan call into a PlanNextResponse. */
export function finalizePlan(
  req: PlanNextRequest,
  ctx: ToolContext,
  shortlist: PlanNextRequest['candidates'],
  scores: PlanNextResponse['scores'],
  submitted: SubmitPlanInput,
  engine: PlanNextResponse['engine'],
): PlanNextResponse {
  const chosen = ctx.knownTracks.get(submitted.trackId) ?? shortlist[0];
  const base = planTransition(req.current, chosen, req);
  const type = (TRANSITION_MAP.has(submitted.transitionType as TransitionType)
    ? submitted.transitionType
    : base.type) as TransitionType;
  const beats = Number.isFinite(submitted.beats) ? Math.max(1, Math.min(64, submitted.beats)) : base.beats;
  const secPerBeat = req.current ? 60 / req.current.bpm : 0.5;

  return {
    trackId: chosen.id,
    transition: {
      ...base,
      type,
      beats,
      startBeforeEnd: beats * secPerBeat,
      reason: submitted.reason || base.reason,
    },
    scores: scores.slice(0, 8),
    engine,
  };
}
