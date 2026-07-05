import { beatgridOf, nearestDownbeatTime, phraseFloorTime, secondsPerBeat } from '../audio/beatgrid.js';
import { camelotCompatibility } from '../constants/camelot.js';
import { PERSONALITY_MAP } from '../constants/personalities.js';
import { TRANSITION_MAP, TRANSITIONS } from '../constants/transitions.js';
import type {
  PlanNextRequest,
  SelectionScore,
  Track,
  TransitionPlan,
  TransitionType,
} from '../types.js';

/**
 * Core DJ decision-making, shared by the browser brain and the server AI
 * endpoint. Mirrors how a human DJ evaluates the crate: harmonic mixing
 * (Camelot), tempo distance, energy trajectory, crowd bias and set memory.
 */
export function scoreCandidate(track: Track, req: PlanNextRequest): SelectionScore {
  const personality = PERSONALITY_MAP.get(req.personality)!;
  const current = req.current;

  const harmonic = current ? camelotCompatibility(current.key, track.key) : 0.7;

  let tempo = 0.7;
  if (current) {
    const diff = Math.abs(track.bpm - current.bpm) / current.bpm;
    // 6% pitch-bend window is the classic beatmatch comfort zone.
    tempo = Math.max(0, 1 - (diff / 0.06) * personality.tempoStrictness);
    if (diff > 0.25) tempo = 0;
    const halfTime = Math.abs(track.bpm * 2 - current.bpm) / current.bpm;
    const doubleTime = Math.abs(track.bpm / 2 - current.bpm) / current.bpm;
    if (halfTime < 0.04 || doubleTime < 0.04) tempo = Math.max(tempo, 0.75);
  }

  const energyFit = 1 - Math.min(1, Math.abs(track.energy - req.targetEnergy) * 2);
  const genreFit = current && track.genre === current.genre ? 1 : 0.6;

  const recentArtistPenalty = req.recentArtists.includes(track.artist) ? 0.5 : 0;
  const playedPenalty = req.recentTrackIds.includes(track.id) ? 1 : 0;
  const freshness = Math.max(0, 1 - recentArtistPenalty - playedPenalty);

  const popularity = track.popularity;
  const moodFit = current && track.mood === current.mood ? 1 : 0.65;

  const total =
    harmonic * 0.24 +
    tempo * 0.22 +
    energyFit * 0.24 +
    genreFit * 0.06 +
    freshness * 0.12 +
    popularity * personality.popularityWeight * 0.07 +
    moodFit * 0.05 +
    // A pinch of controlled chaos so the set never becomes predictable.
    Math.random() * 0.05 * (0.5 + personality.risk);

  return { trackId: track.id, total, harmonic, tempo, energyFit, genreFit, freshness, popularity, moodFit };
}

export function planTransition(
  current: Track | null,
  next: Track,
  req: Pick<PlanNextRequest, 'personality'>,
): TransitionPlan {
  const personality = PERSONALITY_MAP.get(req.personality)!;

  if (!current) {
    return {
      type: 'smooth-blend',
      beats: 8,
      startBeforeEnd: 0,
      incomingOffset: 0,
      reason: 'Apertura del set: entrada limpia desde la intro.',
    };
  }

  const harmonic = camelotCompatibility(current.key, next.key);
  const energyDelta = next.energy - current.energy;

  const viable = TRANSITIONS.filter((t) => harmonic >= t.minHarmonic);
  const pool = viable.length > 0 ? viable : [TRANSITION_MAP.get('echo-out')!];

  const targetAggression = Math.min(1, Math.abs(energyDelta) * 1.6 + personality.risk * 0.4);
  const ranked = [...pool].sort((a, b) => {
    const fitA = 1 - Math.abs(a.aggression - targetAggression);
    const fitB = 1 - Math.abs(b.aggression - targetAggression);
    const favA = personality.favoredTransitions.includes(a.id) ? 0.3 : 0;
    const favB = personality.favoredTransitions.includes(b.id) ? 0.3 : 0;
    return fitB + favB + Math.random() * 0.15 - (fitA + favA + Math.random() * 0.15);
  });

  const def = ranked[0];
  const [minB, maxB] = def.beats;
  const [pMin, pMax] = personality.blendBeats;
  const beats = Math.round(clamp((minB + maxB) / 2, pMin, pMax));

  // Quantize the mix point to a phrase boundary of the outgoing track —
  // human DJs mix in 4-bar phrases, never at an arbitrary second.
  const grid = beatgridOf(current);
  const spb = secondsPerBeat(grid);
  const rawStart = current.duration - beats * spb;
  const phraseStart = phraseFloorTime(grid, rawStart);
  const mixStart = phraseStart > 0 && phraseStart >= current.duration * 0.4 ? phraseStart : rawStart;

  return {
    type: def.id,
    beats,
    startBeforeEnd: current.duration - mixStart,
    incomingOffset: pickIncomingOffset(def.id, next),
    reason: buildReason(def.id, harmonic, energyDelta, current, next),
  };
}

/** Entry point in the incoming track, snapped to one of its downbeats. */
function pickIncomingOffset(type: TransitionType, next: Track): number {
  const grid = beatgridOf(next);
  if (type === 'drop-mix' || type === 'double-drop') {
    const drop = next.sections.find((s) => s.kind === 'drop');
    if (drop) return nearestDownbeatTime(grid, Math.max(0, drop.start - secondsPerBeat(grid) * 4));
  }
  if (type === 'quick-mix' || type === 'backspin') {
    const afterIntro = next.sections.find((s) => s.kind !== 'intro');
    if (afterIntro) return nearestDownbeatTime(grid, afterIntro.start);
  }
  return nearestDownbeatTime(grid, 0);
}

function buildReason(
  type: TransitionType,
  harmonic: number,
  energyDelta: number,
  current: Track,
  next: Track,
): string {
  const parts: string[] = [];
  if (harmonic >= 0.85) parts.push(`llaves ${current.key}→${next.key} compatibles`);
  else if (harmonic >= 0.5) parts.push(`salto armónico controlado ${current.key}→${next.key}`);
  else parts.push('cambio de tonalidad enmascarado con efectos');
  if (Math.abs(energyDelta) < 0.08) parts.push('energía estable');
  else parts.push(energyDelta > 0 ? 'subiendo la energía' : 'bajando revoluciones');
  parts.push(`BPM ${current.bpm}→${next.bpm}`);
  return `${TRANSITION_MAP.get(type)!.label}: ${parts.join(', ')}.`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
