import type { TransitionType } from '../types.js';

export interface TransitionDef {
  id: TransitionType;
  label: string;
  description: string;
  /** Typical length in beats [min, max]. */
  beats: [number, number];
  /** How aggressive the transition feels, 0..1 — matched against energy delta. */
  aggression: number;
  /** Minimum harmonic compatibility required to sound musical. */
  minHarmonic: number;
}

export const TRANSITIONS: readonly TransitionDef[] = [
  { id: 'beatmatch', label: 'Beatmatch', description: 'Sincronización de tempo clásica con fundido progresivo.', beats: [16, 32], aggression: 0.3, minHarmonic: 0.4 },
  { id: 'eq-mix', label: 'EQ Mixing', description: 'Intercambio de graves y agudos entre decks.', beats: [16, 32], aggression: 0.3, minHarmonic: 0.5 },
  { id: 'echo-out', label: 'Echo Out', description: 'El tema saliente se disuelve en ecos.', beats: [4, 8], aggression: 0.5, minHarmonic: 0.1 },
  { id: 'filter-sweep', label: 'Filter Sweep', description: 'Barrido de filtro que abre paso al siguiente tema.', beats: [16, 32], aggression: 0.4, minHarmonic: 0.4 },
  { id: 'loop-transition', label: 'Loop Transition', description: 'Un loop del final se mantiene mientras entra el siguiente.', beats: [16, 32], aggression: 0.35, minHarmonic: 0.5 },
  { id: 'reverb-tail', label: 'Reverb', description: 'Cola de reverb espacial como puente.', beats: [4, 8], aggression: 0.25, minHarmonic: 0.1 },
  { id: 'delay-throw', label: 'Delay', description: 'Lanzamiento de delay sobre la última frase.', beats: [4, 8], aggression: 0.45, minHarmonic: 0.2 },
  { id: 'backspin', label: 'Backspin', description: 'Rebobinado dramático y entrada directa.', beats: [1, 2], aggression: 0.9, minHarmonic: 0 },
  { id: 'drop-mix', label: 'Drop Mix', description: 'Cambio exacto en el drop del tema entrante.', beats: [4, 8], aggression: 0.8, minHarmonic: 0.4 },
  { id: 'smooth-blend', label: 'Smooth Blend', description: 'Fundido suave y musical sin artificios.', beats: [16, 32], aggression: 0.15, minHarmonic: 0.6 },
  { id: 'long-blend', label: 'Long Blend', description: 'Blend hipnótico de más de un minuto.', beats: [48, 64], aggression: 0.1, minHarmonic: 0.7 },
  { id: 'quick-mix', label: 'Quick Mix', description: 'Corte rápido y enérgico entre frases.', beats: [4, 8], aggression: 0.6, minHarmonic: 0.2 },
  { id: 'double-drop', label: 'Double Drop', description: 'Dos drops alineados sonando a la vez.', beats: [8, 16], aggression: 1, minHarmonic: 0.6 },
] as const;

export const TRANSITION_MAP: ReadonlyMap<TransitionType, TransitionDef> = new Map(
  TRANSITIONS.map((t) => [t.id, t]),
);
