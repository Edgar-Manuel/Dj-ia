/** One entry of a regional trend chart. */
export interface TrendTrack {
  /** 1-based position in the chart. */
  rank: number;
  title: string;
  artist: string;
  /** 30s preview URL when the provider exposes one (Deezer does). */
  previewUrl: string | null;
}

/**
 * A snapshot of what is trending in a region. Deezer gives no BPM/key, so
 * this feeds scoring as a lightweight "artist is hot right now" boost and,
 * later, the vocabulary for generation prompts (brainstorm §4/§6) — not a
 * substitute for the real musical analysis in shared/audio.
 */
export interface TrendProfile {
  /** Region code as requested (e.g. "es", "us", "global"). */
  region: string;
  /** Human label of the resolved region (e.g. "España"). */
  regionLabel: string;
  tracks: TrendTrack[];
  /** Epoch ms when this snapshot was fetched. */
  fetchedAt: number;
  /** "deezer" for a live fetch, "fallback" when the provider was unreachable. */
  source: 'deezer' | 'fallback';
}
