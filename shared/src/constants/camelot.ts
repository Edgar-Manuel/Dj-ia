import type { CamelotKey, CamelotLetter, CamelotNumber } from '../types.js';

export const CAMELOT_KEYS: readonly CamelotKey[] = Array.from({ length: 12 }, (_, i) => i + 1)
  .flatMap((n) => [`${n}A`, `${n}B`] as CamelotKey[]);

const KEY_NAMES: Record<CamelotKey, string> = {
  '1A': 'Ab min', '1B': 'B maj',
  '2A': 'Eb min', '2B': 'F# maj',
  '3A': 'Bb min', '3B': 'Db maj',
  '4A': 'F min', '4B': 'Ab maj',
  '5A': 'C min', '5B': 'Eb maj',
  '6A': 'G min', '6B': 'Bb maj',
  '7A': 'D min', '7B': 'F maj',
  '8A': 'A min', '8B': 'C maj',
  '9A': 'E min', '9B': 'G maj',
  '10A': 'B min', '10B': 'D maj',
  '11A': 'F# min', '11B': 'A maj',
  '12A': 'Db min', '12B': 'E maj',
};

export function keyName(key: CamelotKey): string {
  return KEY_NAMES[key];
}

export function parseCamelot(key: CamelotKey): { num: CamelotNumber; letter: CamelotLetter } {
  const letter = key.slice(-1) as CamelotLetter;
  const num = Number(key.slice(0, -1)) as CamelotNumber;
  return { num, letter };
}

/** Root pitch (semitones from A) of the tonic for synthesis. */
export function camelotToSemitone(key: CamelotKey): number {
  const { num, letter } = parseCamelot(key);
  // 8A = A minor (root A = 0). Each step on the wheel = +7 semitones (a fifth).
  const stepsFrom8 = num - 8;
  const minorRoot = ((stepsFrom8 * 7) % 12 + 12) % 12;
  if (letter === 'A') return minorRoot;
  // Relative major is 3 semitones above the minor root.
  return (minorRoot + 3) % 12;
}

/** Whether the key is minor (Camelot "A" ring). */
export function isMinor(key: CamelotKey): boolean {
  return parseCamelot(key).letter === 'A';
}

/**
 * Harmonic compatibility between two Camelot keys, 0..1.
 * 1.0 same key · 0.9 ±1 on the wheel · 0.85 relative major/minor
 * 0.6 energy boost (+2) · 0.4 diagonal · 0.1 clash
 */
export function camelotCompatibility(a: CamelotKey, b: CamelotKey): number {
  if (a === b) return 1;
  const pa = parseCamelot(a);
  const pb = parseCamelot(b);
  const dist = Math.min(
    ((pa.num - pb.num) % 12 + 12) % 12,
    ((pb.num - pa.num) % 12 + 12) % 12,
  );
  const sameLetter = pa.letter === pb.letter;
  if (sameLetter && dist === 1) return 0.9;
  if (!sameLetter && dist === 0) return 0.85;
  if (sameLetter && dist === 2) return 0.6;
  if (!sameLetter && dist === 1) return 0.4;
  return 0.1;
}

/** Compatible target keys sorted by preference (for smart playlist hints). */
export function compatibleKeys(key: CamelotKey): CamelotKey[] {
  return [...CAMELOT_KEYS]
    .filter((k) => k !== key)
    .sort((x, y) => camelotCompatibility(key, y) - camelotCompatibility(key, x))
    .slice(0, 5);
}
