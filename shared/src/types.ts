/** Core domain types shared between client and server. */
import type { TrendProfile } from './trends/types.js';

export type CamelotNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type CamelotLetter = 'A' | 'B';
/** Camelot wheel notation, e.g. "8A" (A minor) or "8B" (C major). */
export type CamelotKey = `${CamelotNumber}${CamelotLetter}`;

export type Mood =
  | 'dark'
  | 'uplifting'
  | 'euphoric'
  | 'melancholic'
  | 'chill'
  | 'aggressive'
  | 'groovy'
  | 'dreamy';

export type SectionKind = 'intro' | 'build' | 'drop' | 'break' | 'outro';

/**
 * Precise tempo map of an audio file: where beats and downbeats fall.
 * A scalar BPM is not enough to mix: aligning two decks needs the phase
 * (first beat) and the bar anchor (first downbeat) of each track.
 */
export interface Beatgrid {
  /** Fractional tempo in beats per minute (e.g. 173.9). */
  bpm: number;
  /** Seconds from the start of the file to the first beat. */
  firstBeatOffset: number;
  /** Seconds from the start of the file to the first downbeat (beat 1 of a bar). */
  firstDownbeatOffset: number;
  /** Beats per bar; 4 in every supported genre. */
  beatsPerBar: number;
}

/** Musical section inside a track, used to pick mix points. */
export interface TrackSection {
  kind: SectionKind;
  /** Start offset in seconds from the beginning of the track. */
  start: number;
  /** Section length in seconds. */
  duration: number;
  /** Relative intensity of this section, 0..1. */
  intensity: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  key: CamelotKey;
  /** Overall energy 0..1. */
  energy: number;
  /** Duration in seconds. */
  duration: number;
  /** Popularity 0..1 — how crowd-pleasing the track is. */
  popularity: number;
  mood: Mood;
  year: number;
  source: 'demo' | 'upload';
  sections: TrackSection[];
  /** Deterministic seed for procedural audio synthesis of demo tracks. */
  seed: number;
  /** Integrated loudness estimate in dB relative to full scale (uploads). */
  loudness?: number;
  /** Integrated loudness per EBU R128, in LUFS (uploads). */
  lufs?: number;
  /** Measured beatgrid (uploads); demo tracks derive an exact grid from bpm. */
  beatgrid?: Beatgrid;
}

export type TransitionType =
  | 'beatmatch'
  | 'eq-mix'
  | 'echo-out'
  | 'filter-sweep'
  | 'loop-transition'
  | 'reverb-tail'
  | 'delay-throw'
  | 'backspin'
  | 'drop-mix'
  | 'smooth-blend'
  | 'long-blend'
  | 'quick-mix'
  | 'double-drop';

/** A fully specified transition decided by the AI. */
export interface TransitionPlan {
  type: TransitionType;
  /** Crossfade length in beats (of the outgoing track). */
  beats: number;
  /** Seconds before the end of the outgoing track at which the mix starts. */
  startBeforeEnd: number;
  /** Offset in seconds into the incoming track where playback begins. */
  incomingOffset: number;
  /** Human-readable reasoning, shown in the UI. */
  reason: string;
}

export type EnergyStateId =
  | 'very-chill'
  | 'chill'
  | 'groove'
  | 'hot'
  | 'festival'
  | 'peak'
  | 'cooldown'
  | 'rising'
  | 'epic-finale';

export type DJPersonalityId =
  | 'commercial'
  | 'underground'
  | 'festival'
  | 'techno'
  | 'house'
  | 'radio'
  | 'lounge'
  | 'experimental';

export type SessionModeId =
  | 'party'
  | 'bar'
  | 'club'
  | 'relax'
  | 'work'
  | 'gym'
  | 'travel'
  | 'after'
  | 'sunset'
  | 'sunrise';

/** One entry in the set history. */
export interface PlayedTrack {
  trackId: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  key: CamelotKey;
  startedAt: number;
  transition: TransitionType | null;
  energyState: EnergyStateId;
}

/** Persisted DJ session. */
export interface DJSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  genres: string[];
  mode: SessionModeId;
  personality: DJPersonalityId;
  /** Planned set length in minutes; 0 = endless. */
  setDurationMin: number;
  /** Manual energy bias -1..1 applied on top of the narrative. */
  energyBias: number;
  history: PlayedTrack[];
}

/** Candidate scoring detail — surfaced so the UI can explain AI decisions. */
export interface SelectionScore {
  trackId: string;
  total: number;
  harmonic: number;
  tempo: number;
  energyFit: number;
  genreFit: number;
  freshness: number;
  popularity: number;
  moodFit: number;
  /** 0..1 — how much the artist being regionally trending lifted this pick. */
  trend: number;
}

/** Request/response contracts for the AI planning endpoint. */
export interface PlanNextRequest {
  current: Track | null;
  candidates: Track[];
  targetEnergy: number;
  energyState: EnergyStateId;
  personality: DJPersonalityId;
  mode: SessionModeId;
  recentArtists: string[];
  recentTrackIds: string[];
  /** Optional regional chart snapshot (fetched via /api/trends/:region) to bias selection. */
  trendProfile?: TrendProfile | null;
}

export interface PlanNextResponse {
  trackId: string;
  transition: TransitionPlan;
  scores: SelectionScore[];
  /** Which engine produced the decision. "claude" = direct Anthropic API, "openrouter" = same agent via OpenRouter. */
  engine: 'heuristic' | 'claude' | 'openrouter';
}
