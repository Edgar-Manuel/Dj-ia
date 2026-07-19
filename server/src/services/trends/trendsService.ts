import type { TrendProfile } from '@ai-dj/shared';
import type { TrendsProvider } from './provider.js';
import { DeezerTrendsProvider } from './deezerProvider.js';
import { GLOBAL_REGION, resolveRegionLabel, supportedRegions } from './regions.js';

/** Charts move slowly enough that a half-hour cache is imperceptible to users. */
const TTL_MS = 30 * 60 * 1000;

/**
 * Regional trend charts with a TTL cache and an honest fallback: on a
 * provider failure we serve stale data if we have it, otherwise an
 * explicitly-empty profile (source: "fallback") rather than pretending
 * nothing is trending. Mirrors JsonStore's single-node pragmatism —
 * in-memory is fine here, values are cheap to refetch.
 */
export class TrendsService {
  private readonly cache = new Map<string, TrendProfile>();

  constructor(private readonly provider: TrendsProvider = new DeezerTrendsProvider()) {}

  listRegions(): string[] {
    return supportedRegions();
  }

  async getRegion(region: string, opts: { forceRefresh?: boolean } = {}): Promise<TrendProfile> {
    const key = (region || GLOBAL_REGION).trim().toLowerCase() || GLOBAL_REGION;
    const cached = this.cache.get(key);
    if (!opts.forceRefresh && cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return cached;
    }
    try {
      const fresh = await this.provider.fetchRegion(key);
      this.cache.set(key, fresh);
      return fresh;
    } catch (err) {
      console.warn(
        `[trends] ${this.provider.name} fetch failed for "${key}":`,
        err instanceof Error ? err.message : err,
      );
      if (cached) return cached;
      return {
        region: key,
        regionLabel: resolveRegionLabel(key),
        tracks: [],
        fetchedAt: Date.now(),
        source: 'fallback',
      };
    }
  }
}

export const trendsService = new TrendsService();
