import {
  TRANSITION_MAP,
  critiqueMix,
  planTransition,
  type PlanNextRequest,
  type Track,
  type TransitionType,
} from '@ai-dj/shared';
import { listTracks } from '../libraryService.js';
import { trendsService } from '../trends/trendsService.js';

/**
 * Provider-agnostic JSON Schema tool definition. Deliberately not typed
 * against @anthropic-ai/sdk's `Tool` — each planner (Claude direct,
 * OpenRouter) maps this into its own wire format (Anthropic's `input_schema`
 * vs. OpenAI-style `function.parameters`), which happen to be the same JSON
 * Schema object, just nested differently.
 */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Shared state across one plan-next agent turn: the request being answered
 * and every Track the agent has seen so far (shortlist + anything fetched
 * via get_library), so tools can resolve a trackId by id without re-fetching.
 */
export interface ToolContext {
  req: PlanNextRequest;
  knownTracks: Map<string, Track>;
}

export interface AgentTool {
  definition: ToolDef;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

const getTrendsTool: AgentTool = {
  definition: {
    name: 'get_trends',
    description:
      'Top de pistas trending ahora mismo (Deezer) en una región. Úsala para saber qué ' +
      'artistas suenan de verdad y priorizarlos en tu elección — no inventes tendencias.',
    input_schema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Código ISO-3166 alpha-2 en minúsculas (ej. "es", "us", "mx") o "global".',
        },
      },
      required: ['region'],
    },
  },
  async run(input) {
    const region = typeof input.region === 'string' && input.region.trim() ? input.region : 'global';
    const profile = await trendsService.getRegion(region);
    return {
      region: profile.region,
      regionLabel: profile.regionLabel,
      source: profile.source, // "fallback" = sin red o región desconocida; no lo trates como señal real
      top: profile.tracks.slice(0, 15).map((t) => `${t.rank}. ${t.artist} — ${t.title}`),
    };
  },
};

const getLibraryTool: AgentTool = {
  definition: {
    name: 'get_library',
    description:
      'Busca en TODA la biblioteca (más allá de los candidatos ya sugeridos) por género y/o ' +
      'rango de BPM. Úsala si el shortlist inicial no tiene nada que encaje bien.',
    input_schema: {
      type: 'object',
      properties: {
        genre: { type: 'string', description: 'Id de género (ej. "techno"). Omite para no filtrar.' },
        minBpm: { type: 'number' },
        maxBpm: { type: 'number' },
        limit: { type: 'integer', description: 'Máximo de resultados (por defecto 15, tope 30).' },
      },
    },
  },
  async run(input, ctx) {
    const all = await listTracks();
    const genre = typeof input.genre === 'string' ? input.genre : undefined;
    const minBpm = typeof input.minBpm === 'number' ? input.minBpm : undefined;
    const maxBpm = typeof input.maxBpm === 'number' ? input.maxBpm : undefined;
    const limit = Math.min(30, Math.max(1, Number(input.limit) || 15));

    const filtered = all
      .filter((t) => !genre || t.genre === genre)
      .filter((t) => minBpm === undefined || t.bpm >= minBpm)
      .filter((t) => maxBpm === undefined || t.bpm <= maxBpm)
      .slice(0, limit);

    filtered.forEach((t) => ctx.knownTracks.set(t.id, t));
    return filtered.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      bpm: t.bpm,
      key: t.key,
      energy: t.energy,
      genre: t.genre,
      mood: t.mood,
      popularity: t.popularity,
    }));
  },
};

const critiqueMixTool: AgentTool = {
  definition: {
    name: 'critique_mix',
    description:
      'Evalúa objetivamente (ventana de tempo, choque armónico Camelot, alineación de frase, ' +
      'salto de loudness, salto de energía) un plan de mezcla hacia una pista candidata. Devuelve ' +
      'accept/adjust/reject con motivos; en "adjust" ya trae la transición corregida. Llama esta ' +
      'tool antes de decidir — nunca propongas una mezcla sin haberla criticado primero.',
    input_schema: {
      type: 'object',
      properties: {
        trackId: {
          type: 'string',
          description: 'Id de la pista candidata (debe venir del shortlist inicial o de get_library).',
        },
        transitionType: { type: 'string', enum: [...TRANSITION_MAP.keys()] },
        beats: { type: 'integer', description: 'Longitud del blend en beats. Opcional; por defecto usa la heurística.' },
      },
      required: ['trackId'],
    },
  },
  async run(input, ctx) {
    const next = ctx.knownTracks.get(String(input.trackId));
    if (!next) {
      return { error: `trackId desconocido: "${input.trackId}". Usa un id del shortlist o de get_library.` };
    }
    const base = planTransition(ctx.req.current, next, ctx.req);
    const type = TRANSITION_MAP.has(input.transitionType as TransitionType)
      ? (input.transitionType as TransitionType)
      : base.type;
    const beats = Number.isFinite(input.beats) ? Math.max(1, Math.min(64, Number(input.beats))) : base.beats;

    const critique = critiqueMix(
      ctx.req.current,
      next,
      { ...base, type, beats },
      { personality: ctx.req.personality, targetEnergy: ctx.req.targetEnergy },
    );
    return {
      verdict: critique.verdict,
      issues: critique.issues.map((i) => `[${i.severity}] ${i.detail}`),
      transition: critique.transition,
    };
  },
};

/** Read-only/decision-support tools available to any agent loop. */
export const AGENT_TOOLS: readonly AgentTool[] = [getTrendsTool, getLibraryTool, critiqueMixTool];

export const AGENT_TOOL_MAP: ReadonlyMap<string, AgentTool> = new Map(
  AGENT_TOOLS.map((t) => [t.definition.name, t]),
);

/**
 * The terminal action of every agent loop — not a read/decision-support
 * tool, so it isn't in AGENT_TOOLS/AGENT_TOOL_MAP. Each planner appends it
 * to its own tool list and watches for a call to this name to end the loop.
 */
export const SUBMIT_PLAN_TOOL: ToolDef = {
  name: 'submit_plan',
  description:
    'Entrega tu decisión FINAL: la pista a mezclar a continuación y cómo hacer la transición. ' +
    'Llámala solo después de haber validado tu elección con critique_mix (no ignores un veredicto ' +
    '"reject": prueba otra pista o ajusta la transición y vuelve a criticarla antes de terminar).',
  input_schema: {
    type: 'object',
    properties: {
      trackId: { type: 'string' },
      transitionType: { type: 'string', enum: [...TRANSITION_MAP.keys()] },
      beats: { type: 'integer' },
      reason: { type: 'string', description: 'Explicación breve en español, para mostrar en la UI.' },
    },
    required: ['trackId', 'transitionType', 'beats', 'reason'],
    additionalProperties: false,
  },
};

export interface SubmitPlanInput {
  trackId: string;
  transitionType: string;
  beats: number;
  reason: string;
}

export const AGENT_SYSTEM_PROMPT =
  'Eres un DJ profesional con décadas de experiencia, actuando como agente autónomo con ' +
  'herramientas. Eliges el siguiente tema y la transición ideal aplicando mezcla armónica ' +
  '(rueda Camelot), compatibilidad de BPM, narrativa de energía y memoria del set (no repetir ' +
  'artistas). Dispones de tools para consultar tendencias reales (get_trends), ampliar la ' +
  'búsqueda más allá del shortlist (get_library) y validar objetivamente tu elección ' +
  '(critique_mix). SIEMPRE llama a critique_mix sobre tu candidato antes de responder; si el ' +
  'veredicto es "reject", prueba otra pista o ajusta la transición y vuelve a criticarla — nunca ' +
  'envíes submit_plan sin al menos una llamada a critique_mix cuyo veredicto no sea "reject". ' +
  'Responde siempre en español y termina la tarea llamando a submit_plan.';

/** Build the initial user turn: the musical context both planners share. */
export function buildAgentPrompt(req: PlanNextRequest, shortlist: Track[]): string {
  return JSON.stringify({
    nowPlaying: req.current
      ? {
          id: req.current.id, title: req.current.title, artist: req.current.artist,
          bpm: req.current.bpm, key: req.current.key, energy: req.current.energy,
          genre: req.current.genre, mood: req.current.mood,
        }
      : null,
    targetEnergy: req.targetEnergy,
    energyState: req.energyState,
    personality: req.personality,
    mode: req.mode,
    recentArtists: req.recentArtists,
    shortlist: shortlist.map((t) => ({
      id: t.id, title: t.title, artist: t.artist, bpm: t.bpm, key: t.key,
      energy: t.energy, genre: t.genre, mood: t.mood, popularity: t.popularity,
    })),
  });
}
