import type { TrendProfile } from '@ai-dj/shared';

/**
 * A source of regional trend charts. Deezer is the only implementation
 * today (no auth, previews included) but the interface stays provider-
 * agnostic so Billboard/Spotify Charts/Last.fm (brainstorm §4) can be added
 * without touching TrendsService or the route.
 */
export interface TrendsProvider {
  readonly name: string;
  /** Resolve a region code (e.g. "es", "global") into a fresh snapshot. */
  fetchRegion(region: string): Promise<TrendProfile>;
}
