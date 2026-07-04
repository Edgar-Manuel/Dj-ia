import type { EnergyStateId, SessionModeId } from '../types.js';

export interface SessionModeDef {
  id: SessionModeId;
  label: string;
  icon: string;
  description: string;
  /**
   * Energy arc over the normalized set time (0..1).
   * Sampled by the narrative engine to pick the next energy state.
   */
  arc: (t: number) => number;
  /** States this mode never enters. */
  forbidden: EnergyStateId[];
  /** Global BPM bias in percent (-10..10). */
  bpmBias: number;
}

const wave = (t: number, base: number, amp: number, cycles: number) =>
  base + amp * Math.sin(t * Math.PI * 2 * cycles);

export const SESSION_MODES: readonly SessionModeDef[] = [
  {
    id: 'party', label: 'Modo Fiesta', icon: '🎉',
    description: 'Subida constante hasta el pico con micro-descansos.',
    arc: (t) => Math.min(0.95, 0.45 + t * 0.55 + 0.06 * Math.sin(t * Math.PI * 5)),
    forbidden: ['very-chill'], bpmBias: 2,
  },
  {
    id: 'bar', label: 'Modo Bar', icon: '🍸',
    description: 'Groove medio, conversación posible, sin picos agresivos.',
    arc: (t) => wave(t, 0.45, 0.1, 2),
    forbidden: ['peak', 'epic-finale'], bpmBias: -2,
  },
  {
    id: 'club', label: 'Modo Discoteca', icon: '🪩',
    description: 'Viaje clásico de club: calentamiento, pico y aterrizaje.',
    arc: (t) => (t < 0.15 ? 0.4 + t * 2 : t < 0.75 ? 0.7 + 0.25 * Math.sin((t - 0.15) * Math.PI / 0.6) : 0.95 - (t - 0.75) * 1.2),
    forbidden: [], bpmBias: 0,
  },
  {
    id: 'relax', label: 'Modo Relax', icon: '🌊',
    description: 'Energía mínima, texturas suaves, cero sobresaltos.',
    arc: (t) => wave(t, 0.18, 0.08, 1.5),
    forbidden: ['hot', 'festival', 'peak', 'epic-finale'], bpmBias: -5,
  },
  {
    id: 'work', label: 'Modo Trabajo', icon: '💻',
    description: 'Flujo constante y no intrusivo para concentrarse.',
    arc: (t) => wave(t, 0.3, 0.06, 3),
    forbidden: ['festival', 'peak', 'epic-finale'], bpmBias: -3,
  },
  {
    id: 'gym', label: 'Modo Gym', icon: '🏋️',
    description: 'Intensidad alta sostenida con intervalos.',
    arc: (t) => 0.75 + 0.2 * Math.sin(t * Math.PI * 6),
    forbidden: ['very-chill', 'chill'], bpmBias: 5,
  },
  {
    id: 'travel', label: 'Modo Viaje', icon: '🚗',
    description: 'Paisajes sonoros variados que acompañan la carretera.',
    arc: (t) => wave(t, 0.5, 0.18, 2.5),
    forbidden: ['peak'], bpmBias: 0,
  },
  {
    id: 'after', label: 'Modo After', icon: '🌙',
    description: 'Hipnótico, oscuro y profundo hasta el amanecer.',
    arc: (t) => wave(t, 0.6, 0.12, 1.2),
    forbidden: ['epic-finale'], bpmBias: -1,
  },
  {
    id: 'sunset', label: 'Modo Sunset', icon: '🌅',
    description: 'Descenso dorado: de la euforia suave a la calma.',
    arc: (t) => 0.65 - t * 0.4,
    forbidden: ['peak', 'epic-finale'], bpmBias: -3,
  },
  {
    id: 'sunrise', label: 'Modo Amanecer', icon: '🌄',
    description: 'Renacimiento progresivo: de lo etéreo a lo luminoso.',
    arc: (t) => 0.2 + t * 0.55,
    forbidden: ['peak'], bpmBias: 0,
  },
] as const;

export const MODE_MAP: ReadonlyMap<SessionModeId, SessionModeDef> = new Map(
  SESSION_MODES.map((m) => [m.id, m]),
);
