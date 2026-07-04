/**
 * Genre registry. Adding a new style = adding one entry here.
 * Every numeric range is [min, max].
 */
export interface GenreDef {
  id: string;
  label: string;
  bpmRange: [number, number];
  energyRange: [number, number];
  /** Dominant moods used when generating/selecting tracks. */
  moods: readonly string[];
  /** Neon accent color used across the UI. */
  color: string;
  /** Synth flavor hints for the procedural audio generator. */
  synth: {
    kickPattern: 'four-on-floor' | 'breakbeat' | 'halftime' | 'boom-bap' | 'sparse';
    bassStyle: 'rolling' | 'sub' | 'stab' | 'melodic' | 'reese' | 'funk';
    brightness: number; // 0..1
    swing: number; // 0..1
  };
}

export const GENRES: readonly GenreDef[] = [
  { id: 'house', label: 'House', bpmRange: [120, 128], energyRange: [0.5, 0.8], moods: ['groovy', 'uplifting'], color: '#ff6b35', synth: { kickPattern: 'four-on-floor', bassStyle: 'funk', brightness: 0.7, swing: 0.15 } },
  { id: 'deep-house', label: 'Deep House', bpmRange: [118, 124], energyRange: [0.35, 0.65], moods: ['dreamy', 'groovy'], color: '#1fb6ff', synth: { kickPattern: 'four-on-floor', bassStyle: 'sub', brightness: 0.45, swing: 0.2 } },
  { id: 'tech-house', label: 'Tech House', bpmRange: [124, 130], energyRange: [0.55, 0.85], moods: ['groovy', 'dark'], color: '#00e5a0', synth: { kickPattern: 'four-on-floor', bassStyle: 'rolling', brightness: 0.6, swing: 0.1 } },
  { id: 'techno', label: 'Techno', bpmRange: [128, 140], energyRange: [0.6, 0.95], moods: ['dark', 'aggressive'], color: '#ff2965', synth: { kickPattern: 'four-on-floor', bassStyle: 'stab', brightness: 0.5, swing: 0 } },
  { id: 'melodic-techno', label: 'Melodic Techno', bpmRange: [120, 126], energyRange: [0.45, 0.75], moods: ['melancholic', 'dreamy'], color: '#a78bfa', synth: { kickPattern: 'four-on-floor', bassStyle: 'melodic', brightness: 0.55, swing: 0 } },
  { id: 'progressive-house', label: 'Progressive House', bpmRange: [122, 128], energyRange: [0.5, 0.8], moods: ['uplifting', 'euphoric'], color: '#38bdf8', synth: { kickPattern: 'four-on-floor', bassStyle: 'melodic', brightness: 0.65, swing: 0 } },
  { id: 'trance', label: 'Trance', bpmRange: [132, 140], energyRange: [0.6, 0.95], moods: ['euphoric', 'uplifting'], color: '#22d3ee', synth: { kickPattern: 'four-on-floor', bassStyle: 'rolling', brightness: 0.8, swing: 0 } },
  { id: 'dnb', label: 'Drum & Bass', bpmRange: [170, 176], energyRange: [0.7, 1], moods: ['aggressive', 'dark'], color: '#f97316', synth: { kickPattern: 'breakbeat', bassStyle: 'reese', brightness: 0.7, swing: 0 } },
  { id: 'dubstep', label: 'Dubstep', bpmRange: [138, 142], energyRange: [0.7, 1], moods: ['aggressive', 'dark'], color: '#84cc16', synth: { kickPattern: 'halftime', bassStyle: 'reese', brightness: 0.6, swing: 0 } },
  { id: 'lofi', label: 'LoFi', bpmRange: [70, 90], energyRange: [0.1, 0.35], moods: ['chill', 'dreamy'], color: '#fbbf24', synth: { kickPattern: 'boom-bap', bassStyle: 'sub', brightness: 0.3, swing: 0.3 } },
  { id: 'hip-hop', label: 'Hip Hop', bpmRange: [85, 100], energyRange: [0.4, 0.7], moods: ['groovy', 'dark'], color: '#f43f5e', synth: { kickPattern: 'boom-bap', bassStyle: 'sub', brightness: 0.5, swing: 0.25 } },
  { id: 'rap', label: 'Rap', bpmRange: [80, 105], energyRange: [0.45, 0.75], moods: ['aggressive', 'groovy'], color: '#e11d48', synth: { kickPattern: 'boom-bap', bassStyle: 'sub', brightness: 0.5, swing: 0.2 } },
  { id: 'pop', label: 'Pop', bpmRange: [100, 125], energyRange: [0.5, 0.8], moods: ['uplifting', 'euphoric'], color: '#ec4899', synth: { kickPattern: 'four-on-floor', bassStyle: 'funk', brightness: 0.75, swing: 0.1 } },
  { id: 'rock', label: 'Rock', bpmRange: [110, 140], energyRange: [0.55, 0.9], moods: ['aggressive', 'uplifting'], color: '#b91c1c', synth: { kickPattern: 'breakbeat', bassStyle: 'stab', brightness: 0.65, swing: 0 } },
  { id: 'indie', label: 'Indie', bpmRange: [100, 130], energyRange: [0.4, 0.7], moods: ['melancholic', 'dreamy'], color: '#94a3b8', synth: { kickPattern: 'breakbeat', bassStyle: 'melodic', brightness: 0.55, swing: 0.1 } },
  { id: 'reggaeton', label: 'Reggaeton', bpmRange: [88, 98], energyRange: [0.55, 0.85], moods: ['groovy', 'uplifting'], color: '#facc15', synth: { kickPattern: 'boom-bap', bassStyle: 'sub', brightness: 0.6, swing: 0.35 } },
  { id: 'dance', label: 'Dance', bpmRange: [120, 130], energyRange: [0.6, 0.9], moods: ['euphoric', 'uplifting'], color: '#fb7185', synth: { kickPattern: 'four-on-floor', bassStyle: 'funk', brightness: 0.8, swing: 0.05 } },
  { id: 'edm', label: 'EDM', bpmRange: [126, 132], energyRange: [0.65, 1], moods: ['euphoric', 'aggressive'], color: '#60a5fa', synth: { kickPattern: 'four-on-floor', bassStyle: 'stab', brightness: 0.85, swing: 0 } },
  { id: 'tropical-house', label: 'Tropical House', bpmRange: [100, 115], energyRange: [0.35, 0.6], moods: ['chill', 'uplifting'], color: '#34d399', synth: { kickPattern: 'four-on-floor', bassStyle: 'melodic', brightness: 0.6, swing: 0.15 } },
  { id: 'afro-house', label: 'Afro House', bpmRange: [118, 125], energyRange: [0.5, 0.8], moods: ['groovy', 'dark'], color: '#d97706', synth: { kickPattern: 'four-on-floor', bassStyle: 'rolling', brightness: 0.55, swing: 0.3 } },
  { id: 'disco', label: 'Disco', bpmRange: [110, 125], energyRange: [0.5, 0.8], moods: ['groovy', 'uplifting'], color: '#c084fc', synth: { kickPattern: 'four-on-floor', bassStyle: 'funk', brightness: 0.75, swing: 0.2 } },
  { id: 'funk', label: 'Funk', bpmRange: [95, 115], energyRange: [0.5, 0.8], moods: ['groovy'], color: '#fb923c', synth: { kickPattern: 'breakbeat', bassStyle: 'funk', brightness: 0.7, swing: 0.35 } },
  { id: 'jazz', label: 'Jazz', bpmRange: [80, 140], energyRange: [0.2, 0.5], moods: ['chill', 'dreamy'], color: '#818cf8', synth: { kickPattern: 'sparse', bassStyle: 'melodic', brightness: 0.5, swing: 0.5 } },
  { id: 'soul', label: 'Soul', bpmRange: [85, 110], energyRange: [0.3, 0.6], moods: ['dreamy', 'groovy'], color: '#f472b6', synth: { kickPattern: 'boom-bap', bassStyle: 'funk', brightness: 0.55, swing: 0.3 } },
  { id: 'ambient', label: 'Ambient', bpmRange: [60, 90], energyRange: [0.05, 0.25], moods: ['dreamy', 'chill'], color: '#5eead4', synth: { kickPattern: 'sparse', bassStyle: 'sub', brightness: 0.35, swing: 0 } },
  { id: 'chillout', label: 'Chillout', bpmRange: [90, 110], energyRange: [0.15, 0.4], moods: ['chill', 'dreamy'], color: '#7dd3fc', synth: { kickPattern: 'sparse', bassStyle: 'sub', brightness: 0.4, swing: 0.15 } },
  { id: 'synthwave', label: 'Synthwave', bpmRange: [100, 118], energyRange: [0.4, 0.7], moods: ['dreamy', 'melancholic'], color: '#f0abfc', synth: { kickPattern: 'four-on-floor', bassStyle: 'melodic', brightness: 0.6, swing: 0 } },
  { id: 'hardstyle', label: 'Hardstyle', bpmRange: [148, 155], energyRange: [0.8, 1], moods: ['aggressive', 'euphoric'], color: '#ef4444', synth: { kickPattern: 'four-on-floor', bassStyle: 'stab', brightness: 0.9, swing: 0 } },
] as const;

export const GENRE_MAP: ReadonlyMap<string, GenreDef> = new Map(GENRES.map((g) => [g.id, g]));

export function genreLabel(id: string): string {
  return GENRE_MAP.get(id)?.label ?? id;
}
