import type { EnergyStateId } from '../types.js';

export interface EnergyStateDef {
  id: EnergyStateId;
  label: string;
  /** Target energy band [min, max] for track selection. */
  band: [number, number];
  /** States the narrative may move to next, in order of preference. */
  next: EnergyStateId[];
  color: string;
}

export const ENERGY_STATES: readonly EnergyStateDef[] = [
  { id: 'very-chill', label: 'Muy relajado', band: [0.0, 0.25], next: ['chill', 'very-chill'], color: '#5eead4' },
  { id: 'chill', label: 'Relajado', band: [0.2, 0.4], next: ['groove', 'rising', 'very-chill'], color: '#7dd3fc' },
  { id: 'groove', label: 'Groove', band: [0.35, 0.6], next: ['hot', 'rising', 'chill'], color: '#a78bfa' },
  { id: 'rising', label: 'Subida', band: [0.5, 0.7], next: ['hot', 'festival', 'groove'], color: '#fbbf24' },
  { id: 'hot', label: 'Caliente', band: [0.6, 0.8], next: ['festival', 'peak', 'cooldown'], color: '#fb7185' },
  { id: 'festival', label: 'Festival', band: [0.7, 0.9], next: ['peak', 'hot', 'cooldown'], color: '#f97316' },
  { id: 'peak', label: 'Pico máximo', band: [0.85, 1.0], next: ['cooldown', 'festival', 'epic-finale'], color: '#ff2965' },
  { id: 'cooldown', label: 'Descanso', band: [0.4, 0.6], next: ['rising', 'groove', 'hot'], color: '#38bdf8' },
  { id: 'epic-finale', label: 'Final épico', band: [0.8, 1.0], next: ['epic-finale'], color: '#e879f9' },
] as const;

export const ENERGY_STATE_MAP: ReadonlyMap<EnergyStateId, EnergyStateDef> = new Map(
  ENERGY_STATES.map((s) => [s.id, s]),
);

export function energyStateLabel(id: EnergyStateId): string {
  return ENERGY_STATE_MAP.get(id)?.label ?? id;
}
