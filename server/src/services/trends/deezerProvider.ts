import type { TrendProfile, TrendTrack } from '@ai-dj/shared';
import type { TrendsProvider } from './provider.js';
import { GLOBAL_REGION, REGION_PLAYLISTS, resolveRegionLabel } from './regions.js';

const DEEZER_API = 'https://api.deezer.com';
const TRACK_LIMIT = 50;
const FETCH_TIMEOUT_MS = 8000;

interface DeezerRawTrack {
  title?: string;
  title_short?: string;
  artist?: { name?: string };
  preview?: string;
  /** Present (1-based) on /chart responses; absent on /playlist responses. */
  position?: number;
}

/**
 * Parse a Deezer chart/playlist `data` array into our TrendTrack shape.
 * Pure and dependency-free so it can be unit-tested against fixtures
 * without a network call — see server/tests/trends.test.mjs.
 */
export function parseDeezerTracks(data: unknown): TrendTrack[] {
  if (!Array.isArray(data)) return [];
  const tracks: TrendTrack[] = [];
  data.forEach((raw, index) => {
    const t = raw as DeezerRawTrack;
    const artist = t.artist?.name?.trim();
    const title = (t.title_short || t.title || '').trim();
    if (!artist || !title) return;
    tracks.push({
      rank: typeof t.position === 'number' && t.position > 0 ? t.position : index + 1,
      title,
      artist,
      previewUrl: t.preview || null,
    });
  });
  return tracks;
}

/** Regional charts via Deezer's unauthenticated public API. */
export class DeezerTrendsProvider implements TrendsProvider {
  readonly name = 'deezer';

  async fetchRegion(region: string): Promise<TrendProfile> {
    const key = region.trim().toLowerCase();
    const playlistId = REGION_PLAYLISTS.get(key);
    const url =
      key === GLOBAL_REGION || !playlistId
        ? `${DEEZER_API}/chart/0/tracks?limit=${TRACK_LIMIT}`
        : `${DEEZER_API}/playlist/${playlistId}/tracks?limit=${TRACK_LIMIT}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Deezer respondió ${res.status}`);
    const body = (await res.json()) as { data?: unknown; error?: { message?: string; type?: string } };
    if (body.error) throw new Error(body.error.message ?? `Deezer error: ${body.error.type}`);

    return {
      region: key,
      regionLabel: resolveRegionLabel(key),
      tracks: parseDeezerTracks(body.data),
      fetchedAt: Date.now(),
      source: 'deezer',
    };
  }
}
