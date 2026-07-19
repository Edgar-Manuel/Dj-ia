import type { Track } from '../types.js';
import type { TrendProfile } from './types.js';

/** Case/accent/punctuation-insensitive comparison key for artist names. */
function normalizeArtist(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * 0..1 boost for a track whose artist is currently trending in `profile`'s
 * region. Higher when the artist charts near #1; 0 with no profile or no
 * match. Matches are substring-tolerant so "Bad Bunny" matches a chart entry
 * like "Bad Bunny feat. X".
 */
export function trendBoost(track: Track, profile: TrendProfile | null | undefined): number {
  if (!profile || profile.tracks.length === 0) return 0;
  const artist = normalizeArtist(track.artist);
  if (!artist) return 0;

  let best = 0;
  for (const t of profile.tracks) {
    const trendArtist = normalizeArtist(t.artist);
    if (!trendArtist) continue;
    if (trendArtist === artist || trendArtist.includes(artist) || artist.includes(trendArtist)) {
      const positional = 1 - (t.rank - 1) / Math.max(1, profile.tracks.length);
      if (positional > best) best = positional;
    }
  }
  return best;
}
