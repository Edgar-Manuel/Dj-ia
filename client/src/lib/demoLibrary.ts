import {
  CAMELOT_KEYS,
  GENRES,
  type CamelotKey,
  type Mood,
  type Track,
  type TrackSection,
} from '@ai-dj/shared';

/**
 * Built-in demo crate: ~170 procedurally-defined tracks (6 per genre) whose
 * audio is synthesized on demand by the Web Audio engine. Deterministic, so
 * every user gets the same library.
 */

const ADJ = ['Neon', 'Midnight', 'Solar', 'Electric', 'Velvet', 'Crystal', 'Phantom', 'Golden', 'Lunar', 'Wild', 'Silent', 'Infrared', 'Cosmic', 'Broken', 'Eternal', 'Hidden'];
const NOUN = ['Horizon', 'Pulse', 'Mirage', 'Echo', 'Avenue', 'Motion', 'Skyline', 'Fever', 'Drift', 'Signal', 'Gravity', 'Bloom', 'Circuit', 'Empire', 'Tide', 'Prism'];
const ARTIST_A = ['Kaya', 'Nova', 'Rio', 'Mara', 'Dmitri', 'Luz', 'Echoe', 'Sable', 'Iris', 'Kobo', 'Vera', 'Nilo', 'Asha', 'Remy'];
const ARTIST_B = ['Flux', 'Ríos', 'Nakamura', 'Volta', 'Klein', 'Santoro', 'Wave', 'Duarte', 'Mono', 'Aster', 'Blk', 'Kessler'];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSections(duration: number, bpm: number, rng: () => number): TrackSection[] {
  const bar = (60 / bpm) * 4;
  const phrase = bar * 8; // 8-bar phrases
  const phrases = Math.max(4, Math.round(duration / phrase));
  const layout: { kind: TrackSection['kind']; len: number; intensity: number }[] = [];

  layout.push({ kind: 'intro', len: 1, intensity: 0.3 });
  let left = phrases - 2;
  let toggle = true;
  while (left > 0) {
    if (toggle) {
      layout.push({ kind: 'build', len: 1, intensity: 0.6 + rng() * 0.15 });
      const dropLen = left > 3 ? 2 : 1;
      layout.push({ kind: 'drop', len: dropLen, intensity: 0.9 + rng() * 0.1 });
      left -= 1 + dropLen;
    } else {
      layout.push({ kind: 'break', len: 1, intensity: 0.4 + rng() * 0.15 });
      left -= 1;
    }
    toggle = !toggle;
  }
  layout.push({ kind: 'outro', len: 1, intensity: 0.3 });

  const sections: TrackSection[] = [];
  let t = 0;
  for (const item of layout) {
    const len = item.len * phrase;
    sections.push({ kind: item.kind, start: t, duration: len, intensity: item.intensity });
    t += len;
  }
  return sections;
}

export function buildDemoLibrary(): Track[] {
  const tracks: Track[] = [];
  const rng = mulberry32(0xd7a2026);

  for (const genre of GENRES) {
    for (let i = 0; i < 6; i++) {
      const seed = Math.floor(rng() * 2 ** 31);
      const local = mulberry32(seed);
      const bpm = Math.round(genre.bpmRange[0] + local() * (genre.bpmRange[1] - genre.bpmRange[0]));
      const energy = genre.energyRange[0] + local() * (genre.energyRange[1] - genre.energyRange[0]);
      const key = CAMELOT_KEYS[Math.floor(local() * CAMELOT_KEYS.length)] as CamelotKey;
      const bar = (60 / bpm) * 4;
      const phrase = bar * 8;
      const targetDur = 150 + local() * 120;
      const duration = Math.round(targetDur / phrase) * phrase;
      const mood = genre.moods[Math.floor(local() * genre.moods.length)] as Mood;
      const title = `${ADJ[Math.floor(local() * ADJ.length)]} ${NOUN[Math.floor(local() * NOUN.length)]}`;
      const artist = `${ARTIST_A[Math.floor(local() * ARTIST_A.length)]} ${ARTIST_B[Math.floor(local() * ARTIST_B.length)]}`;

      tracks.push({
        id: `demo_${genre.id}_${i}`,
        title,
        artist,
        genre: genre.id,
        bpm,
        key,
        energy: Math.round(energy * 100) / 100,
        duration,
        popularity: Math.round(local() * 100) / 100,
        mood,
        year: 2018 + Math.floor(local() * 8),
        source: 'demo',
        sections: buildSections(duration, bpm, local),
        seed,
      });
    }
  }
  return tracks;
}
