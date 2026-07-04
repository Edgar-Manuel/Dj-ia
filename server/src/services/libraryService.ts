import { parseBuffer } from 'music-metadata';
import { nanoid } from 'nanoid';
import {
  CAMELOT_KEYS,
  GENRE_MAP,
  compatibleKeys,
  type CamelotKey,
  type Mood,
  type Track,
  type TrackSection,
} from '@ai-dj/shared';
import { JsonStore } from '../store/jsonStore.js';

const store = new JsonStore<Track[]>(
  new URL('../../data/library.json', import.meta.url).pathname,
  [],
);

export async function listTracks(): Promise<Track[]> {
  return store.read();
}

export async function removeTrack(id: string): Promise<void> {
  await store.update((tracks) => tracks.filter((t) => t.id !== id));
}

/**
 * Ingest an uploaded audio file: read tags, estimate missing musical
 * attributes and register the track in the library. Full spectral analysis
 * (precise BPM/key) happens client-side with the Web Audio API; the values
 * here are metadata-driven estimates that the client can overwrite.
 */
export async function ingestUpload(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<Track> {
  let title = filename.replace(/\.[^.]+$/, '');
  let artist = 'Desconocido';
  let duration = 180;
  let year = new Date().getFullYear();
  let genre = 'house';
  let bpmTag: number | undefined;
  let keyTag: string | undefined;

  try {
    const meta = await parseBuffer(buffer, { mimeType: mimetype });
    title = meta.common.title ?? title;
    artist = meta.common.artist ?? artist;
    duration = meta.format.duration ?? duration;
    year = meta.common.year ?? year;
    bpmTag = meta.common.bpm;
    keyTag = meta.common.key;
    const tagGenre = meta.common.genre?.[0]?.toLowerCase().replace(/\s+/g, '-');
    if (tagGenre && GENRE_MAP.has(tagGenre)) genre = tagGenre;
  } catch {
    // Unreadable tags — keep filename-based defaults.
  }

  const def = GENRE_MAP.get(genre)!;
  const bpm = bpmTag && bpmTag > 40 ? Math.round(bpmTag) : Math.round((def.bpmRange[0] + def.bpmRange[1]) / 2);
  const key = normalizeKey(keyTag) ?? CAMELOT_KEYS[Math.floor(Math.random() * CAMELOT_KEYS.length)];

  const track: Track = {
    id: `up_${nanoid(10)}`,
    title,
    artist,
    genre,
    bpm,
    key,
    energy: (def.energyRange[0] + def.energyRange[1]) / 2,
    duration,
    popularity: 0.5,
    mood: def.moods[0] as Mood,
    year,
    source: 'upload',
    sections: defaultSections(duration),
    seed: Math.floor(Math.random() * 2 ** 31),
  };

  await store.update((tracks) => [...tracks, track]);
  return track;
}

/** Update analysis results computed by the client (real BPM/key/energy). */
export async function patchTrack(id: string, patch: Partial<Track>): Promise<Track | null> {
  let updated: Track | null = null;
  await store.update((tracks) =>
    tracks.map((t) => {
      if (t.id !== id) return t;
      updated = { ...t, ...patch, id: t.id, source: t.source };
      return updated;
    }),
  );
  return updated;
}

/** Smart playlist: tracks harmonically and energetically close to a seed. */
export async function smartPlaylist(seedId: string, size = 10): Promise<Track[]> {
  const tracks = await store.read();
  const seed = tracks.find((t) => t.id === seedId);
  if (!seed) return [];
  const goodKeys = new Set<CamelotKey>([seed.key, ...compatibleKeys(seed.key)]);
  return tracks
    .filter((t) => t.id !== seedId)
    .map((t) => ({
      t,
      score:
        (goodKeys.has(t.key) ? 1 : 0) * 0.4 +
        (1 - Math.min(1, Math.abs(t.bpm - seed.bpm) / seed.bpm / 0.08)) * 0.35 +
        (1 - Math.abs(t.energy - seed.energy)) * 0.25,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, size)
    .map(({ t }) => t);
}

function normalizeKey(tag: string | undefined): CamelotKey | null {
  if (!tag) return null;
  const cleaned = tag.trim().toUpperCase();
  if (/^([1-9]|1[0-2])[AB]$/.test(cleaned)) return cleaned as CamelotKey;
  return null;
}

function defaultSections(duration: number): TrackSection[] {
  const intro = Math.min(30, duration * 0.12);
  const outro = Math.min(30, duration * 0.12);
  const body = duration - intro - outro;
  return [
    { kind: 'intro', start: 0, duration: intro, intensity: 0.3 },
    { kind: 'build', start: intro, duration: body * 0.25, intensity: 0.6 },
    { kind: 'drop', start: intro + body * 0.25, duration: body * 0.4, intensity: 1 },
    { kind: 'break', start: intro + body * 0.65, duration: body * 0.35, intensity: 0.5 },
    { kind: 'outro', start: duration - outro, duration: outro, intensity: 0.3 },
  ];
}
