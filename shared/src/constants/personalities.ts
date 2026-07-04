import type { DJPersonalityId, TransitionType } from '../types.js';

export interface DJPersonalityDef {
  id: DJPersonalityId;
  label: string;
  description: string;
  /** 0..1 — willingness to take harmonic/tempo risks. */
  risk: number;
  /** Preferred blend length in beats [min, max]. */
  blendBeats: [number, number];
  /** How much popularity weighs in track selection, 0..1. */
  popularityWeight: number;
  /** How strictly BPM must match, 0..1 (1 = very strict). */
  tempoStrictness: number;
  /** Average fraction of a track played before mixing out, 0..1. */
  trackPlayRatio: number;
  /** Transitions this personality favors. */
  favoredTransitions: TransitionType[];
  color: string;
}

export const PERSONALITIES: readonly DJPersonalityDef[] = [
  {
    id: 'commercial', label: 'DJ Comercial',
    description: 'Hits reconocibles, mezclas seguras y rápidas, energía siempre arriba.',
    risk: 0.25, blendBeats: [16, 32], popularityWeight: 0.9, tempoStrictness: 0.7,
    trackPlayRatio: 0.55, favoredTransitions: ['quick-mix', 'eq-mix', 'drop-mix'], color: '#ec4899',
  },
  {
    id: 'underground', label: 'DJ Underground',
    description: 'Joyas desconocidas, blends largos e hipnóticos, cero prisa.',
    risk: 0.6, blendBeats: [32, 64], popularityWeight: 0.15, tempoStrictness: 0.85,
    trackPlayRatio: 0.8, favoredTransitions: ['long-blend', 'filter-sweep', 'loop-transition'], color: '#a78bfa',
  },
  {
    id: 'festival', label: 'DJ Festival',
    description: 'Drops gigantes, dobles drops y máxima intensidad.',
    risk: 0.5, blendBeats: [8, 16], popularityWeight: 0.7, tempoStrictness: 0.6,
    trackPlayRatio: 0.45, favoredTransitions: ['drop-mix', 'double-drop', 'backspin'], color: '#f97316',
  },
  {
    id: 'techno', label: 'DJ Techno',
    description: 'Precisión quirúrgica, transiciones largas por EQ, tensión constante.',
    risk: 0.45, blendBeats: [32, 64], popularityWeight: 0.2, tempoStrictness: 0.95,
    trackPlayRatio: 0.75, favoredTransitions: ['eq-mix', 'long-blend', 'filter-sweep'], color: '#ff2965',
  },
  {
    id: 'house', label: 'DJ House',
    description: 'Groove continuo, blends suaves y musicales, sonrisa garantizada.',
    risk: 0.35, blendBeats: [16, 32], popularityWeight: 0.5, tempoStrictness: 0.8,
    trackPlayRatio: 0.65, favoredTransitions: ['smooth-blend', 'eq-mix', 'echo-out'], color: '#ff6b35',
  },
  {
    id: 'radio', label: 'DJ Radio',
    description: 'Cortes limpios y cortos, variedad máxima, siempre lo mejor de cada tema.',
    risk: 0.2, blendBeats: [4, 16], popularityWeight: 0.8, tempoStrictness: 0.3,
    trackPlayRatio: 0.4, favoredTransitions: ['quick-mix', 'echo-out', 'reverb-tail'], color: '#38bdf8',
  },
  {
    id: 'lounge', label: 'DJ Lounge',
    description: 'Atmósferas suaves, transiciones con cola de reverb, elegancia total.',
    risk: 0.3, blendBeats: [16, 48], popularityWeight: 0.4, tempoStrictness: 0.5,
    trackPlayRatio: 0.7, favoredTransitions: ['reverb-tail', 'smooth-blend', 'delay-throw'], color: '#5eead4',
  },
  {
    id: 'experimental', label: 'DJ Experimental',
    description: 'Riesgo máximo: backspins, saltos de género y sorpresas constantes.',
    risk: 0.9, blendBeats: [4, 64], popularityWeight: 0.25, tempoStrictness: 0.35,
    trackPlayRatio: 0.5, favoredTransitions: ['backspin', 'delay-throw', 'double-drop', 'loop-transition'], color: '#e879f9',
  },
] as const;

export const PERSONALITY_MAP: ReadonlyMap<DJPersonalityId, DJPersonalityDef> = new Map(
  PERSONALITIES.map((p) => [p.id, p]),
);
