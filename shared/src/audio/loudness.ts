/**
 * Integrated loudness per ITU-R BS.1770-4 / EBU R128, dependency-free.
 *
 * K-weighting (high shelf + high pass, redesigned for the actual sample
 * rate), 400 ms blocks with 75% overlap, then absolute (-70 LUFS) and
 * relative (-10 LU) gating. Matching decks by LUFS instead of peak/RMS is
 * what keeps perceived volume stable across a set.
 */

/** Loudness decks are trimmed towards, in LUFS (streaming-platform standard). */
export const TARGET_LUFS = -14;

const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;
const BLOCK_SEC = 0.4;
const HOP_SEC = 0.1;

export function integratedLoudness(channels: Float32Array[], rate: number): number {
  if (channels.length === 0 || channels[0].length === 0) return -Infinity;

  const blockLen = Math.round(BLOCK_SEC * rate);
  const hopLen = Math.round(HOP_SEC * rate);
  const n = channels[0].length;
  if (n < blockLen) return -Infinity;

  // Per-block weighted mean square, summed over channels (weight 1 for L/R).
  const blocks = Math.floor((n - blockLen) / hopLen) + 1;
  const power = new Float64Array(blocks);

  for (const channel of channels) {
    const weighted = kWeight(channel, rate);
    // Prefix sum of squares → O(1) energy per block.
    const prefix = new Float64Array(weighted.length + 1);
    for (let i = 0; i < weighted.length; i++) prefix[i + 1] = prefix[i] + weighted[i] * weighted[i];
    for (let b = 0; b < blocks; b++) {
      const start = b * hopLen;
      power[b] += (prefix[start + blockLen] - prefix[start]) / blockLen;
    }
  }

  const loudnessOf = (p: number): number => -0.691 + 10 * Math.log10(Math.max(p, 1e-12));

  // Absolute gate.
  let sum = 0;
  let count = 0;
  for (let b = 0; b < blocks; b++) {
    if (loudnessOf(power[b]) > ABSOLUTE_GATE) {
      sum += power[b];
      count++;
    }
  }
  if (count === 0) return -Infinity;

  // Relative gate, 10 LU under the ungated mean.
  const threshold = loudnessOf(sum / count) + RELATIVE_GATE;
  sum = 0;
  count = 0;
  for (let b = 0; b < blocks; b++) {
    if (loudnessOf(power[b]) > threshold) {
      sum += power[b];
      count++;
    }
  }
  if (count === 0) return -Infinity;
  return Math.round(loudnessOf(sum / count) * 10) / 10;
}

/** Gain (linear) that brings a track at `lufs` to the target, limited to ±9 dB. */
export function loudnessTrimGain(lufs: number | undefined, target = TARGET_LUFS): number {
  if (lufs === undefined || !Number.isFinite(lufs)) return 1;
  const db = Math.max(-9, Math.min(9, target - lufs));
  return 10 ** (db / 20);
}

/** Map integrated loudness onto the 0..1 energy scale used across the app. */
export function energyFromLufs(lufs: number): number {
  return Math.min(1, Math.max(0, (lufs + 30) / 22));
}

// ── K-weighting ────────────────────────────────────────────────────────────

/** BS.1770 stage-1 shelf and stage-2 high-pass, parameterized for any rate. */
function kWeight(x: Float32Array, rate: number): Float32Array {
  const shelf = highShelf(1681.974450955533, 3.999843853973347, 0.7071752369554196, rate);
  const hp = highPass(38.13547087602444, 0.5003270373238773, rate);
  return applyBiquad(applyBiquad(x, shelf), hp);
}

interface Biquad {
  b0: number; b1: number; b2: number; a1: number; a2: number;
}

function highShelf(f0: number, gainDb: number, q: number, rate: number): Biquad {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * f0) / rate;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const twoRootAAlpha = 2 * Math.sqrt(A) * alpha;
  const a0 = A + 1 - (A - 1) * cw + twoRootAAlpha;
  return {
    b0: (A * (A + 1 + (A - 1) * cw + twoRootAAlpha)) / a0,
    b1: (-2 * A * (A - 1 + (A + 1) * cw)) / a0,
    b2: (A * (A + 1 + (A - 1) * cw - twoRootAAlpha)) / a0,
    a1: (2 * (A - 1 - (A + 1) * cw)) / a0,
    a2: (A + 1 - (A - 1) * cw - twoRootAAlpha) / a0,
  };
}

function highPass(f0: number, q: number, rate: number): Biquad {
  const w0 = (2 * Math.PI * f0) / rate;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cw) / 2 / a0,
    b1: -(1 + cw) / a0,
    b2: (1 + cw) / 2 / a0,
    a1: (-2 * cw) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(x: Float32Array, c: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = v;
    x2 = x1; x1 = x[i];
    y2 = y1; y1 = v;
  }
  return y;
}
