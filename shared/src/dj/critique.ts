import { beatgridOf, phraseFloorTime, secondsPerBeat } from '../audio/beatgrid.js';
import { camelotCompatibility } from '../constants/camelot.js';
import { loudnessTrimGain, TARGET_LUFS } from '../audio/loudness.js';
import { PERSONALITY_MAP } from '../constants/personalities.js';
import { TRANSITION_MAP } from '../constants/transitions.js';
import type { DJPersonalityId, Track, TransitionPlan, TransitionType } from '../types.js';

/**
 * Self-critique of a planned mix — the "measure → critique → correct" loop
 * from the brainstorm, applied to mixing decisions with Fase 1 data. It never
 * invents music; it just checks a plan against objective criteria (tempo,
 * harmony, phrase, loudness, energy) and either accepts it, corrects it, or
 * rejects it so the brain re-picks. This is the DJ's judgement, made explicit.
 */

export type MixVerdict = 'accept' | 'adjust' | 'reject';

export type MixIssueCode =
  | 'tempo-far'
  | 'harmonic-clash'
  | 'phrase-misaligned'
  | 'loudness-jump'
  | 'energy-jump';

export interface MixIssue {
  code: MixIssueCode;
  /** `fatal` forces a re-pick; `warn` is tolerated (and may drive an adjust). */
  severity: 'warn' | 'fatal';
  detail: string;
}

export interface MixCritique {
  verdict: MixVerdict;
  issues: MixIssue[];
  /** The plan to actually use — possibly corrected from the input plan. */
  transition: TransitionPlan;
}

export interface CritiqueOptions {
  personality: DJPersonalityId;
  targetEnergy?: number;
}

/** Beatmatch window: our decks tempo-sync incoming tracks within ±8%. */
const SYNC_WINDOW = 0.08;
/** Transitions that expose both tracks' harmonics — a key clash is audible. */
const HARMONIC_EXPOSING: ReadonlySet<TransitionType> = new Set([
  'beatmatch', 'eq-mix', 'smooth-blend', 'long-blend', 'loop-transition', 'drop-mix', 'double-drop',
]);
/** FX-masked transitions we can fall back to when keys clash. */
const MASKING_BY_AGGRESSION: readonly TransitionType[] = ['reverb-tail', 'echo-out', 'filter-sweep', 'delay-throw'];

export function critiqueMix(
  current: Track | null,
  next: Track,
  plan: TransitionPlan,
  opts: CritiqueOptions,
): MixCritique {
  // Opening the set: nothing to mix against.
  if (!current) return { verdict: 'accept', issues: [], transition: plan };

  const personality = PERSONALITY_MAP.get(opts.personality)!;
  const issues: MixIssue[] = [];
  let transition = plan;

  // ── Tempo: must land in the sync window, or be a clean half/double time ──
  const ratio = next.bpm / current.bpm;
  const nearHalfDouble =
    Math.abs(ratio - 0.5) / 0.5 <= 0.04 || Math.abs(ratio - 2) / 2 <= 0.04;
  const tempoDiff = Math.abs(ratio - 1);
  if (tempoDiff > SYNC_WINDOW && !nearHalfDouble) {
    issues.push({
      code: 'tempo-far',
      severity: 'fatal',
      detail: `BPM ${current.bpm}→${next.bpm} fuera de la ventana de sync (${(tempoDiff * 100).toFixed(1)}% > ${SYNC_WINDOW * 100}%).`,
    });
  } else if (nearHalfDouble && tempoDiff > SYNC_WINDOW) {
    issues.push({
      code: 'tempo-far',
      severity: 'warn',
      detail: `Mezcla a ${ratio > 1 ? 'doble' : 'medio'} tiempo ${current.bpm}→${next.bpm}.`,
    });
  }

  // ── Harmony: a clean blend must not expose a key clash ───────────────────
  const harmonic = camelotCompatibility(current.key, next.key);
  const def = TRANSITION_MAP.get(transition.type)!;
  if (harmonic < def.minHarmonic && HARMONIC_EXPOSING.has(transition.type)) {
    if (harmonic <= 0.1 && personality.risk < 0.3) {
      // A hard clash a very cautious DJ would refuse — re-pick a better key.
      issues.push({
        code: 'harmonic-clash',
        severity: 'fatal',
        detail: `Choque tonal duro ${current.key}→${next.key} inaceptable para este estilo.`,
      });
    } else {
      // Otherwise mask it: swap the clean blend for an FX-based transition.
      const mask = pickMask(transition, personality.risk);
      issues.push({
        code: 'harmonic-clash',
        severity: 'warn',
        detail: `Llaves ${current.key}→${next.key} (compat ${harmonic.toFixed(2)}) chocan en «${def.label}»; enmascarado con «${TRANSITION_MAP.get(mask)!.label}».`,
      });
      transition = remapTransition(current, transition, mask);
    }
  }

  // ── Phrase alignment: the mix point should sit on a 4-bar boundary ───────
  const grid = beatgridOf(current);
  const mixStart = current.duration - transition.startBeforeEnd;
  const phrase = phraseFloorTime(grid, mixStart);
  const spb = secondsPerBeat(grid);
  if (Math.abs(mixStart - phrase) > spb * 0.5 && mixStart > phrase) {
    issues.push({
      code: 'phrase-misaligned',
      severity: 'warn',
      detail: `Punto de mezcla a ${mixStart.toFixed(1)}s no cae en frase; el motor lo cuantiza al beat.`,
    });
  }

  // ── Loudness: warn if the trim can't close the perceived-level gap ───────
  if (current.lufs !== undefined && next.lufs !== undefined) {
    const residual = Math.abs(
      trimmedLufs(current.lufs) - trimmedLufs(next.lufs),
    );
    if (residual > 3) {
      issues.push({
        code: 'loudness-jump',
        severity: 'warn',
        detail: `Salto de volumen ~${residual.toFixed(1)} LU tras compensar (una pista es muy ${next.lufs < current.lufs ? 'baja' : 'alta'}).`,
      });
    }
  }

  // ── Energy: flag a jump the narrative did not ask for ────────────────────
  if (opts.targetEnergy !== undefined && Math.abs(next.energy - opts.targetEnergy) > 0.35) {
    issues.push({
      code: 'energy-jump',
      severity: 'warn',
      detail: `Energía ${next.energy.toFixed(2)} lejos del objetivo ${opts.targetEnergy.toFixed(2)}.`,
    });
  }

  const fatal = issues.some((i) => i.severity === 'fatal');
  const adjusted = transition !== plan;
  return {
    verdict: fatal ? 'reject' : adjusted ? 'adjust' : 'accept',
    issues,
    transition,
  };
}

/** Perceived loudness after each deck's ±9 dB trim toward the target. */
function trimmedLufs(lufs: number): number {
  return lufs + 20 * Math.log10(loudnessTrimGain(lufs, TARGET_LUFS));
}

/** Choose an FX-masked transition whose aggression best fits the original. */
function pickMask(plan: TransitionPlan, risk: number): TransitionType {
  const targetAggr = TRANSITION_MAP.get(plan.type)!.aggression + risk * 0.15;
  return [...MASKING_BY_AGGRESSION].sort(
    (a, b) =>
      Math.abs(TRANSITION_MAP.get(a)!.aggression - targetAggr) -
      Math.abs(TRANSITION_MAP.get(b)!.aggression - targetAggr),
  )[0];
}

/** Re-type a plan to a masking transition, keeping timing sane for its length. */
function remapTransition(current: Track, plan: TransitionPlan, type: TransitionType): TransitionPlan {
  const [minB, maxB] = TRANSITION_MAP.get(type)!.beats;
  const beats = Math.min(Math.max(plan.beats, minB), maxB);
  const grid = beatgridOf(current);
  const rawStart = current.duration - beats * secondsPerBeat(grid);
  const phraseStart = phraseFloorTime(grid, rawStart);
  const mixStart = phraseStart >= current.duration * 0.4 ? phraseStart : rawStart;
  return {
    ...plan,
    type,
    beats,
    startBeforeEnd: current.duration - mixStart,
    reason: plan.reason,
  };
}
