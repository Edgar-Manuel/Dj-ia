import {
  CAMELOT_KEYS,
  camelotToSemitone,
  detectBeatgrid,
  energyFromLufs,
  integratedLoudness,
  isMinor,
  type Beatgrid,
  type CamelotKey,
} from '@ai-dj/shared';

export interface AnalysisResult {
  bpm: number;
  key: CamelotKey;
  energy: number;
  loudness: number;
  /** Integrated loudness per EBU R128. */
  lufs: number;
  /** Full tempo map: fractional BPM + beat/downbeat phase. */
  beatgrid: Beatgrid;
}

/**
 * Real audio analysis for uploaded files, entirely in the browser:
 * - Beatgrid: spectral-flux onsets + harmonic-comb tempo (octave-safe) +
 *   kick-band beat phase and downbeat (shared DSP, also usable server-side).
 * - Loudness: integrated LUFS per EBU R128 — drives per-deck gain matching.
 * - Key: chroma extraction (Goertzel) matched against Krumhansl profiles.
 */
export async function analyzeBuffer(buffer: AudioBuffer): Promise<AnalysisResult> {
  const mono = toMono(buffer);
  const rate = buffer.sampleRate;

  const beatgrid = detectBeatgrid(mono, rate);
  const key = detectKey(mono, rate);

  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    channels.push(buffer.getChannelData(c) as Float32Array);
  }
  const lufs = integratedLoudness(channels, rate);
  const energy = energyFromLufs(lufs);

  return {
    bpm: Math.round(beatgrid.bpm),
    key,
    energy,
    loudness: lufs, // kept for backwards compat with older sessions
    lufs,
    beatgrid,
  };
}

function toMono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / chs;
  }
  return out;
}

/** Krumhansl-Schmuckler key profiles. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function detectKey(mono: Float32Array, rate: number): CamelotKey {
  // Analyze up to 60s from the middle of the track.
  const span = Math.min(mono.length, rate * 60);
  const start = Math.max(0, Math.floor((mono.length - span) / 2));
  const decim = 4;
  const sig = new Float32Array(Math.floor(span / decim));
  for (let i = 0; i < sig.length; i++) sig[i] = mono[start + i * decim];
  const sigRate = rate / decim;

  const chroma = new Float32Array(12);
  // Goertzel per pitch class across octaves 2..6 (relative to A).
  for (let pc = 0; pc < 12; pc++) {
    for (let oct = -2; oct <= 2; oct++) {
      const freq = 110 * 2 ** (pc / 12 + oct);
      if (freq > sigRate / 2 - 100) continue;
      chroma[pc] += goertzelPower(sig, sigRate, freq);
    }
  }
  const max = Math.max(...chroma, 1e-9);
  for (let i = 0; i < 12; i++) chroma[i] /= max;

  let best: CamelotKey = '8A';
  let bestCorr = -Infinity;
  for (const key of CAMELOT_KEYS) {
    const rootPc = camelotToSemitone(key); // semitones from A
    const profile = isMinor(key) ? MINOR_PROFILE : MAJOR_PROFILE;
    let corr = 0;
    for (let i = 0; i < 12; i++) corr += chroma[(rootPc + i) % 12] * profile[i];
    if (corr > bestCorr) {
      bestCorr = corr;
      best = key;
    }
  }
  return best;
}

function goertzelPower(sig: Float32Array, rate: number, freq: number): number {
  const w = (2 * Math.PI * freq) / rate;
  const coeff = 2 * Math.cos(w);
  // Accumulate power over consecutive 2s blocks (resetting the resonator
  // avoids numeric drift) so the WHOLE window contributes, not just the
  // first block.
  const block = Math.min(sig.length, Math.floor(rate * 2));
  if (block === 0) return 0;
  let power = 0;
  for (let base = 0; base + block <= sig.length; base += block) {
    let s1 = 0;
    let s2 = 0;
    for (let i = base; i < base + block; i++) {
      const s0 = sig[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    power += s1 * s1 + s2 * s2 - coeff * s1 * s2;
  }
  return power;
}
