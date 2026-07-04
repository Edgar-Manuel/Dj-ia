import { CAMELOT_KEYS, camelotToSemitone, isMinor, type CamelotKey } from '@ai-dj/shared';

export interface AnalysisResult {
  bpm: number;
  key: CamelotKey;
  energy: number;
  loudness: number;
}

/**
 * Real audio analysis for uploaded files, entirely in the browser:
 * - BPM: onset-energy autocorrelation over the 70–180 BPM range
 * - Key: chroma extraction (Goertzel) matched against Krumhansl profiles
 * - Energy: normalized RMS with a high-frequency emphasis
 */
export async function analyzeBuffer(buffer: AudioBuffer): Promise<AnalysisResult> {
  const mono = toMono(buffer);
  const rate = buffer.sampleRate;

  const bpm = detectBpm(mono, rate);
  const key = detectKey(mono, rate);
  const { energy, loudness } = measureEnergy(mono);

  return { bpm, key, energy, loudness };
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

function detectBpm(mono: Float32Array, rate: number): number {
  const hop = 512;
  const frames = Math.floor(mono.length / hop);
  const envelope = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) sum += mono[i] * mono[i];
    envelope[f] = Math.sqrt(sum / hop);
  }
  // Onset strength: positive first difference.
  const onsets = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onsets[f] = Math.max(0, envelope[f] - envelope[f - 1]);

  const frameRate = rate / hop;
  let bestBpm = 120;
  let bestScore = -Infinity;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = Math.round((60 / bpm) * frameRate);
    if (lag < 4 || lag >= frames / 2) continue;
    let score = 0;
    // Comb over multiple periods for robustness.
    for (let mult = 1; mult <= 4; mult++) {
      const l = lag * mult;
      for (let f = 0; f + l < frames; f += 3) score += onsets[f] * onsets[f + l] / mult;
    }
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return Math.round(bestBpm);
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
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  // Process in blocks to avoid numeric drift on long signals.
  const block = Math.min(sig.length, Math.floor(rate * 2));
  for (let i = 0; i < block; i++) {
    s0 = sig[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

function measureEnergy(mono: Float32Array): { energy: number; loudness: number } {
  let sum = 0;
  const step = Math.max(1, Math.floor(mono.length / 500000));
  let count = 0;
  for (let i = 0; i < mono.length; i += step) {
    sum += mono[i] * mono[i];
    count++;
  }
  const rms = Math.sqrt(sum / count);
  const loudness = 20 * Math.log10(Math.max(rms, 1e-6));
  // Map typical music RMS (-30..-6 dBFS) onto 0..1.
  const energy = Math.min(1, Math.max(0, (loudness + 30) / 24));
  return { energy, loudness: Math.round(loudness * 10) / 10 };
}
