/** Core domain types shared between client and server. */

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
}

export interface PlanNextResponse {
  trackId: string;
  transition: TransitionPlan;
  scores: SelectionScore[];
  /** Which engine produced the decision. */
  engine: 'heuristic' | 'claude';
}
