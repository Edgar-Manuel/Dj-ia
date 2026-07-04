import Anthropic from '@anthropic-ai/sdk';
import {
  TRANSITION_MAP,
  type PlanNextRequest,
  type PlanNextResponse,
  type TransitionType,
} from '@ai-dj/shared';
import type { DJPlanner } from './types.js';
import { planTransition, scoreCandidate } from './heuristicPlanner.js';

const MODEL = process.env.AI_DJ_CLAUDE_MODEL ?? 'claude-opus-4-8';

interface ClaudePlan {
  trackId: string;
  transitionType: string;
  beats: number;
  reason: string;
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    trackId: { type: 'string' },
    transitionType: {
      type: 'string',
      enum: [...TRANSITION_MAP.keys()],
    },
    beats: { type: 'integer' },
    reason: { type: 'string' },
  },
  required: ['trackId', 'transitionType', 'beats', 'reason'],
  additionalProperties: false,
} as const;

/**
 * Claude-backed planner. Sends the musical context (current track, candidate
 * crate, energy target, personality/mode) and receives a structured decision.
 * Enabled when ANTHROPIC_API_KEY is present; falls back to heuristics on error.
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

    const response = await this.getClient().messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: PLAN_SCHEMA },
      },
      system:
        'Eres un DJ profesional con décadas de experiencia. Eliges el siguiente tema ' +
        'y la transición ideal aplicando mezcla armónica (rueda Camelot), compatibilidad ' +
        'de BPM, narrativa de energía y memoria del set (no repetir artistas). ' +
        'Responde únicamente con el JSON pedido.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            nowPlaying: req.current
              ? { id: req.current.id, title: req.current.title, artist: req.current.artist, bpm: req.current.bpm, key: req.current.key, energy: req.current.energy, genre: req.current.genre, mood: req.current.mood }
              : null,
            targetEnergy: req.targetEnergy,
            energyState: req.energyState,
            personality: req.personality,
            mode: req.mode,
            recentArtists: req.recentArtists,
            candidates: shortlist.map((t) => ({ id: t.id, title: t.title, artist: t.artist, bpm: t.bpm, key: t.key, energy: t.energy, genre: t.genre, mood: t.mood, popularity: t.popularity })),
          }),
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new Error('empty Claude response');
    const plan = JSON.parse(text.text) as ClaudePlan;

    const chosen = shortlist.find((t) => t.id === plan.trackId) ?? shortlist[0];
    const base = planTransition(req.current, chosen, req);
    const type = (TRANSITION_MAP.has(plan.transitionType as TransitionType)
      ? plan.transitionType
      : base.type) as TransitionType;
    const beats = Number.isFinite(plan.beats) ? Math.max(1, Math.min(64, plan.beats)) : base.beats;
    const secPerBeat = req.current ? 60 / req.current.bpm : 0.5;

    return {
      trackId: chosen.id,
      transition: {
        ...base,
        type,
        beats,
        startBeforeEnd: beats * secPerBeat,
        reason: plan.reason || base.reason,
      },
      scores: scores.slice(0, 8),
      engine: 'claude',
    };
  }
}
