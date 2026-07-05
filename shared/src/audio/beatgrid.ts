import type { Beatgrid, Track } from '../types.js';

/** Default phrase length: 4 bars of 4 beats — the unit DJs mix in. */
export const PHRASE_BEATS = 16;

/**
 * Beatgrid for any track. Uploads carry a measured grid; demo tracks are
 * synthesized from beat 0 at exactly `track.bpm`, so their grid is exact.
 */
export function beatgridOf(track: Track): Beatgrid {
  return (
    track.beatgrid ?? {
      bpm: track.bpm,
      firstBeatOffset: 0,
      firstDownbeatOffset: 0,
      beatsPerBar: 4,
    }
  );
}

export function secondsPerBeat(grid: Beatgrid): number {
  return 60 / grid.bpm;
}

/** Continuous beat index (can be negative/fractional) at `time` seconds. */
export function beatIndexAt(grid: Beatgrid, time: number): number {
  return (time - grid.firstBeatOffset) / secondsPerBeat(grid);
}

export function timeOfBeat(grid: Beatgrid, index: number): number {
  return grid.firstBeatOffset + index * secondsPerBeat(grid);
}

/** First beat boundary at or after `time` (tolerates float noise). */
export function nextBeatTime(grid: Beatgrid, time: number): number {
  const idx = Math.ceil(beatIndexAt(grid, time) - 1e-6);
  return timeOfBeat(grid, idx);
}

/** First downbeat (bar start) at or after `time`. */
export function nextDownbeatTime(grid: Beatgrid, time: number): number {
  const spb = secondsPerBeat(grid);
  const bar = grid.beatsPerBar * spb;
  const rel = (time - grid.firstDownbeatOffset) / bar;
  return grid.firstDownbeatOffset + Math.ceil(rel - 1e-6) * bar;
}

/** First phrase boundary at or after `time`; phrases anchor on the first downbeat. */
export function nextPhraseTime(grid: Beatgrid, time: number, phraseBeats = PHRASE_BEATS): number {
  const phrase = phraseBeats * secondsPerBeat(grid);
  const rel = (time - grid.firstDownbeatOffset) / phrase;
  return grid.firstDownbeatOffset + Math.ceil(rel - 1e-6) * phrase;
}

/** Largest phrase boundary at or before `time`; clamps at the first downbeat. */
export function phraseFloorTime(grid: Beatgrid, time: number, phraseBeats = PHRASE_BEATS): number {
  const phrase = phraseBeats * secondsPerBeat(grid);
  const rel = (time - grid.firstDownbeatOffset) / phrase;
  return grid.firstDownbeatOffset + Math.max(0, Math.floor(rel + 1e-6)) * phrase;
}

/** Downbeat closest to `time` (never negative). */
export function nearestDownbeatTime(grid: Beatgrid, time: number): number {
  const bar = grid.beatsPerBar * secondsPerBeat(grid);
  const rel = (time - grid.firstDownbeatOffset) / bar;
  return Math.max(0, grid.firstDownbeatOffset + Math.round(rel) * bar);
}
