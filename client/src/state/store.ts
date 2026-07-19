import { create } from 'zustand';
import type {
  DJPersonalityId,
  EnergyStateId,
  PlayedTrack,
  SessionModeId,
  Track,
  TransitionPlan,
  TrendProfile,
} from '@ai-dj/shared';
import type { DeckId } from '@/audio/Deck';

export interface NextUp {
  track: Track;
  transition: TransitionPlan;
  engine: 'heuristic' | 'claude' | 'openrouter' | 'local';
  ready: boolean;
}

interface DJState {
  // Library
  library: Track[];
  uploadsAnalyzing: number;

  // Session config
  sessionId: string | null;
  sessionName: string;
  genres: string[];
  mode: SessionModeId;
  personality: DJPersonalityId;
  setDurationMin: number;
  energyBias: number;
  autoMode: boolean;
  useServerAI: boolean;
  /** Region code for /api/trends (ISO-3166 alpha-2 lowercase, or "global"). */
  trendRegion: string;
  /** Last fetched regional chart snapshot, fed into scoring as a trend boost. */
  trendProfile: TrendProfile | null;

  // Live set state
  status: 'idle' | 'playing' | 'paused';
  activeDeck: DeckId;
  deckTracks: Record<DeckId, Track | null>;
  nextUp: NextUp | null;
  history: PlayedTrack[];
  energyState: EnergyStateId;
  targetEnergy: number;
  transitioning: boolean;
  lastTransitionReason: string | null;
  /** Notes from the mix self-critique for the last decision (empty = clean). */
  lastCritique: string | null;
  serverEngine: string | null;

  set: (partial: Partial<DJState>) => void;
  toggleGenre: (id: string) => void;
}

export const useDJStore = create<DJState>((setState) => ({
  library: [],
  uploadsAnalyzing: 0,

  sessionId: null,
  sessionName: 'Sesión sin título',
  genres: ['house', 'tech-house', 'melodic-techno'],
  mode: 'club',
  personality: 'house',
  setDurationMin: 120,
  energyBias: 0,
  autoMode: true,
  useServerAI: true,
  trendRegion: 'global',
  trendProfile: null,

  status: 'idle',
  activeDeck: 'A',
  deckTracks: { A: null, B: null },
  nextUp: null,
  history: [],
  energyState: 'groove',
  targetEnergy: 0.5,
  transitioning: false,
  lastTransitionReason: null,
  lastCritique: null,
  serverEngine: null,

  set: (partial) => setState(partial),
  toggleGenre: (id) =>
    setState((s) => {
      const has = s.genres.includes(id);
      if (has && s.genres.length === 1) return s; // always keep one style
      return { genres: has ? s.genres.filter((g) => g !== id) : [...s.genres, id] };
    }),
}));
