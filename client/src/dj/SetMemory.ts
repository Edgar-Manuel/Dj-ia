import type { PlayedTrack, Track } from '@ai-dj/shared';

/**
 * The DJ's memory of the running set: what was played, which artists are
 * "hot" (too recent to repeat) and which genres have been leaned on lately.
 */
export class SetMemory {
  private played: PlayedTrack[] = [];

  get history(): PlayedTrack[] {
    return this.played;
  }

  restore(history: PlayedTrack[]): void {
    this.played = [...history];
  }

  record(entry: PlayedTrack): void {
    this.played.push(entry);
  }

  /** Track IDs that must not repeat (whole session by default). */
  recentTrackIds(window = 200): string[] {
    return this.played.slice(-window).map((p) => p.trackId);
  }

  /** Artists played within the last N tracks — softly penalized. */
  recentArtists(window = 6): string[] {
    return this.played.slice(-window).map((p) => p.artist);
  }

  /** Genres of the last few tracks, used to combat monotony. */
  recentGenres(window = 4): string[] {
    return this.played.slice(-window).map((p) => p.genre);
  }

  /** Seconds elapsed since the set started. */
  elapsedSec(): number {
    if (this.played.length === 0) return 0;
    return (Date.now() - this.played[0].startedAt) / 1000;
  }

  /**
   * Filter the crate for viable candidates. Guarantees the pool is never
   * empty: constraints are relaxed in order if the library is small.
   */
  candidates(library: Track[], genres: string[]): Track[] {
    const playedIds = new Set(this.recentTrackIds());
    const genreSet = new Set(genres);

    const filters: ((t: Track) => boolean)[] = [
      (t) => !playedIds.has(t.id) && (genreSet.size === 0 || genreSet.has(t.genre)),
      (t) => !playedIds.has(t.id),
      () => true,
    ];
    for (const filter of filters) {
      const pool = library.filter(filter);
      if (pool.length > 0) return pool;
    }
    return library;
  }
}
