import type { Beatgrid } from '../types.js';

/**
 * Beatgrid detection: tempo, beat phase and downbeat from raw samples.
 *
 * Pipeline (classic MIR, dependency-free so it runs in browser and Node):
 *  1. Spectral-flux onset envelope (Hann + FFT, log-compressed magnitudes).
 *  2. Autocorrelation of the envelope scored with a harmonic comb, which
 *     resolves the half/double-tempo octave ambiguity that plain
 *     autocorrelation suffers from.
 *  3. Beat phase: the comb offset that best aligns with the onsets.
 *  4. Downbeat: the beat (0..3) whose low-frequency onsets are strongest.
 */

const FFT_SIZE = 2048;
const HOP = 512;
const MIN_BPM = 60;
const MAX_BPM = 200;
/** Analyze at most this many seconds, taken from the middle of the track. */
const MAX_ANALYSIS_SEC = 90;

export interface BeatgridResult extends Beatgrid {
  /** Peak comb score relative to the mean — >2 means a confident grid. */
  confidence: number;
}

export function detectBeatgrid(mono: Float32Array, rate: number): BeatgridResult {
  const span = Math.min(mono.length, Math.floor(rate * MAX_ANALYSIS_SEC));
  const windowStart = Math.max(0, Math.floor((mono.length - span) / 2));
  const segment = mono.subarray(windowStart, windowStart + span);

  const { envelope, lowBand } = onsetEnvelope(segment, rate);
  const frameRate = rate / HOP;

  const { bpm, confidence } = detectTempo(envelope, frameRate);
  const spbFrames = (60 / bpm) * frameRate;

  // Phase locks onto the kick band: hats/snares spread across hundreds of
  // spectral bins and would otherwise drag the comb onto the offbeat. The
  // full-band envelope only breaks ties (e.g. kickless passages).
  let maxLow = 0;
  let maxEnv = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (lowBand[i] > maxLow) maxLow = lowBand[i];
    if (envelope[i] > maxEnv) maxEnv = envelope[i];
  }
  const phaseEnv = new Float32Array(envelope.length);
  for (let i = 0; i < envelope.length; i++) {
    phaseEnv[i] = (maxLow > 0 ? lowBand[i] / maxLow : 0) + 0.25 * (maxEnv > 0 ? envelope[i] / maxEnv : 0);
  }

  const phaseFrames = detectPhase(phaseEnv, spbFrames);
  const downbeat = detectDownbeat(envelope, lowBand, spbFrames, phaseFrames);

  const spbSec = 60 / bpm;
  // Map the phase back to file time, then reduce to the first beat >= 0.
  // Flux at frame f fires when the onset enters the END of the analysis
  // window, so the actual onset sits (FFT_SIZE - HOP) samples later.
  const phaseTime = windowStart / rate + (phaseFrames * HOP + FFT_SIZE - HOP) / rate;
  const firstBeatOffset = positiveMod(phaseTime, spbSec);
  const firstDownbeatOffset = positiveMod(phaseTime + downbeat * spbSec, 4 * spbSec);

  return { bpm, firstBeatOffset, firstDownbeatOffset, beatsPerBar: 4, confidence };
}

// ── Onset envelope ─────────────────────────────────────────────────────────

interface OnsetData {
  /** Half-wave-rectified, mean-removed spectral flux per frame. */
  envelope: Float32Array;
  /** Flux restricted to the kick band (~20–160 Hz) per frame. */
  lowBand: Float32Array;
}

function onsetEnvelope(samples: Float32Array, rate: number): OnsetData {
  const frames = Math.max(1, Math.floor((samples.length - FFT_SIZE) / HOP));
  const bins = FFT_SIZE / 2;
  const lowBinEnd = Math.max(2, Math.round((160 / rate) * FFT_SIZE));

  const hann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const prev = new Float32Array(bins);
  const prevPow = new Float32Array(bins);
  const envelope = new Float32Array(frames);
  const lowBand = new Float32Array(frames);

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[off + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    let lowFlux = 0;
    for (let k = 1; k < bins; k++) {
      const pow = re[k] * re[k] + im[k] * im[k];
      // Log compression keeps loud passages from dominating the tempo flux…
      const mag = Math.log1p(80 * Math.sqrt(pow));
      const d = mag - prev[k];
      if (d > 0) flux += d;
      prev[k] = mag;
      // …but the kick band stays LINEAR in power: compressing it would put
      // basslines on par with the kick and drag the beat phase offbeat.
      if (k < lowBinEnd) {
        const dp = pow - prevPow[k];
        if (dp > 0) lowFlux += dp;
        prevPow[k] = pow;
      }
    }
    envelope[f] = f === 0 ? 0 : flux;
    lowBand[f] = f === 0 ? 0 : lowFlux;
  }

  removeLocalMean(envelope, Math.round(rate / HOP)); // ~1 s window
  removeLocalMean(lowBand, Math.round(rate / HOP));
  return { envelope, lowBand };
}

/** Subtract a moving average and half-wave rectify, in place. */
function removeLocalMean(x: Float32Array, halfWindow: number): void {
  const n = x.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + x[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - halfWindow);
    const b = Math.min(n, i + halfWindow + 1);
    const mean = (prefix[b] - prefix[a]) / (b - a);
    x[i] = Math.max(0, x[i] - mean);
  }
}

// ── Tempo ──────────────────────────────────────────────────────────────────

function detectTempo(envelope: Float32Array, frameRate: number): { bpm: number; confidence: number } {
  const n = envelope.length;
  const maxLag = Math.min(n - 1, Math.ceil((60 / MIN_BPM) * frameRate * 4));
  const acf = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += envelope[i] * envelope[i + lag];
    acf[lag] = sum / (n - lag);
  }
  const norm = acf[0] || 1;
  for (let lag = 0; lag <= maxLag; lag++) acf[lag] /= norm;

  const acfAt = (lag: number): number => {
    if (lag >= maxLag) return 0;
    const i = Math.floor(lag);
    const frac = lag - i;
    return acf[i] * (1 - frac) + acf[i + 1] * frac;
  };

  // Harmonic comb: the true tempo scores on ALL multiples of its period,
  // while the half-tempo candidate misses the odd ones — that asymmetry is
  // what disambiguates 87 vs 174 BPM.
  const weights = [1, 0.8, 0.5, 0.35];
  let bestBpm = 120;
  let bestScore = -Infinity;
  let total = 0;
  let count = 0;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.25) {
    const lag = (60 / bpm) * frameRate;
    let score = 0;
    for (let k = 1; k <= weights.length; k++) score += weights[k - 1] * acfAt(k * lag);
    // Mild log-normal prior centered on club tempos; too weak to override data.
    const prior = Math.exp(-0.5 * ((Math.log2(bpm / 125) / 0.9) ** 2));
    score *= 0.8 + 0.2 * prior;
    total += score;
    count++;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  const confidence = bestScore / Math.max(1e-9, total / count);
  return { bpm: refineBpm(bestBpm, acfAt, frameRate), confidence };
}

/** Parabolic refinement of the ACF peak around the winning tempo. */
function refineBpm(bpm: number, acfAt: (lag: number) => number, frameRate: number): number {
  const lag = (60 / bpm) * frameRate;
  const d = 0.25;
  const y0 = acfAt(lag - d);
  const y1 = acfAt(lag);
  const y2 = acfAt(lag + d);
  const denom = y0 - 2 * y1 + y2;
  const shift = Math.abs(denom) < 1e-12 ? 0 : (0.5 * (y0 - y2)) / denom;
  const refined = (60 * frameRate) / (lag + Math.max(-d, Math.min(d, shift)) );
  return Math.round(refined * 10) / 10;
}

// ── Phase & downbeat ───────────────────────────────────────────────────────

const envAt = (envelope: Float32Array, pos: number): number => {
  if (pos < 0 || pos >= envelope.length - 1) return 0;
  const i = Math.floor(pos);
  const frac = pos - i;
  return envelope[i] * (1 - frac) + envelope[i + 1] * frac;
};

/** Comb offset (in frames, within one beat) that best aligns with the onsets. */
function detectPhase(envelope: Float32Array, spbFrames: number): number {
  const steps = 128;
  let best = 0;
  let bestSum = -Infinity;
  const score = (offset: number): number => {
    let sum = 0;
    for (let t = offset; t < envelope.length; t += spbFrames) sum += envAt(envelope, t);
    return sum;
  };
  for (let s = 0; s < steps; s++) {
    const offset = (s / steps) * spbFrames;
    const sum = score(offset);
    if (sum > bestSum) {
      bestSum = sum;
      best = offset;
    }
  }
  // Parabolic refinement between neighbouring comb offsets.
  const d = spbFrames / steps;
  const y0 = score(positiveMod(best - d, spbFrames));
  const y2 = score(positiveMod(best + d, spbFrames));
  const denom = y0 - 2 * bestSum + y2;
  const shift = Math.abs(denom) < 1e-12 ? 0 : (0.5 * (y0 - y2)) / denom;
  return positiveMod(best + Math.max(-1, Math.min(1, shift)) * d, spbFrames);
}

/**
 * Which of the 4 beats carries the bar accent. Kick-band onsets dominate the
 * vote; ties fall back to beat 0. Heuristic — exact for tracks whose bars
 * accent beat 1, approximate otherwise.
 */
function detectDownbeat(
  envelope: Float32Array,
  lowBand: Float32Array,
  spbFrames: number,
  phaseFrames: number,
): number {
  let best = 0;
  let bestSum = -Infinity;
  for (let m = 0; m < 4; m++) {
    let sum = 0;
    for (let t = phaseFrames + m * spbFrames; t < envelope.length; t += 4 * spbFrames) {
      sum += envAt(lowBand, t) + 0.25 * envAt(envelope, t);
    }
    if (sum > bestSum + 1e-9) {
      bestSum = sum;
      best = m;
    }
  }
  return best;
}

// ── Utilities ──────────────────────────────────────────────────────────────

function positiveMod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
}
