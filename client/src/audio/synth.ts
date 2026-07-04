import { camelotToSemitone, GENRE_MAP, isMinor, type Track, type TrackSection } from '@ai-dj/shared';

/**
 * Procedural track synthesizer.
 *
 * Demo tracks are rendered as one short loop per musical section (intro,
 * build, drop, break, outro) with an OfflineAudioContext. The deck then
 * schedules those loops back-to-back, which keeps memory flat regardless of
 * track length while still producing structured, mixable music.
 */

export interface RenderedSection extends TrackSection {
  buffer: AudioBuffer;
}

export interface RenderedTrack {
  track: Track;
  sections: RenderedSection[];
  sampleRate: number;
}

const SAMPLE_RATE = 44100;
const LOOP_BARS = 4;

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Deterministic PRNG so a track always sounds identical. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noteHz = (semitoneFromA2: number) => 110 * 2 ** (semitoneFromA2 / 12);

export async function renderTrack(track: Track): Promise<RenderedTrack> {
  const sections: RenderedSection[] = [];
  for (const section of track.sections) {
    const buffer = await renderSectionLoop(track, section);
    sections.push({ ...section, buffer });
  }
  return { track, sections, sampleRate: SAMPLE_RATE };
}

async function renderSectionLoop(track: Track, section: TrackSection): Promise<AudioBuffer> {
  const genre = GENRE_MAP.get(track.genre) ?? [...GENRE_MAP.values()][0];
  const secPerBeat = 60 / track.bpm;
  const loopDur = secPerBeat * 4 * LOOP_BARS;
  const ctx = new OfflineAudioContext(2, Math.ceil(loopDur * SAMPLE_RATE), SAMPLE_RATE);
  const rng = mulberry32(track.seed + section.start * 1000);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

  const root = camelotToSemitone(track.key);
  const scale = isMinor(track.key) ? MINOR : MAJOR;
  const intensity = section.intensity;
  const { kickPattern, bassStyle, brightness, swing } = genre.synth;

  const noise = makeNoiseBuffer(ctx, rng);
  const totalBeats = 4 * LOOP_BARS;

  const swingOf = (step: number) => (step % 2 === 1 ? swing * secPerBeat * 0.16 : 0);

  // ── Kick ────────────────────────────────────────────────────────────────
  if (intensity > 0.35 && kickPattern !== 'sparse') {
    for (let beat = 0; beat < totalBeats; beat++) {
      const hits: number[] = [];
      if (kickPattern === 'four-on-floor') hits.push(0);
      if (kickPattern === 'breakbeat' && (beat % 4 === 0 || (beat % 4 === 2 && rng() > 0.4))) hits.push(0);
      if (kickPattern === 'halftime' && beat % 2 === 0) hits.push(0);
      if (kickPattern === 'boom-bap' && (beat % 4 === 0 || (beat % 4 === 2 && rng() > 0.5))) hits.push(0, ...(rng() > 0.7 ? [0.75] : []));
      for (const sub of hits) {
        playKick(ctx, master, (beat + sub) * secPerBeat, intensity);
      }
    }
  }

  // ── Hats ────────────────────────────────────────────────────────────────
  if (intensity > 0.25) {
    const div = intensity > 0.7 && brightness > 0.5 ? 4 : 2;
    for (let step = 0; step < totalBeats * div; step++) {
      const isOff = step % div !== 0;
      if (!isOff && div === 2) continue; // classic offbeat hat
      if (rng() < 0.08) continue; // human gaps
      const t = (step / div) * secPerBeat + swingOf(step);
      playHat(ctx, master, noise, t, 0.1 + brightness * 0.12, isOff ? 0.9 : 0.5);
    }
  }

  // ── Clap / snare ────────────────────────────────────────────────────────
  if (intensity > 0.5) {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      playClap(ctx, master, noise, (bar * 4 + (kickPattern === 'halftime' ? 3 : 1)) * secPerBeat, 0.5);
      playClap(ctx, master, noise, (bar * 4 + 3) * secPerBeat, 0.5);
    }
  }

  // ── Bass line ───────────────────────────────────────────────────────────
  if (intensity > 0.3) {
    const steps = 16;
    const pattern: number[] = [];
    for (let i = 0; i < steps; i++) {
      const r = rng();
      pattern.push(r < 0.5 ? 0 : r < 0.75 ? scale[Math.floor(rng() * 3)] : scale[Math.floor(rng() * scale.length)]);
    }
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      for (let i = 0; i < steps; i++) {
        if (bassStyle !== 'rolling' && rng() < 0.35) continue;
        const t = bar * 4 * secPerBeat + (i / 4) * secPerBeat + swingOf(i);
        const freq = noteHz(root - 12 + pattern[i]);
        playBass(ctx, master, t, secPerBeat / 4, freq, bassStyle, intensity, brightness);
      }
    }
  }

  // ── Pad / chord bed ─────────────────────────────────────────────────────
  if (intensity < 0.6 || brightness < 0.55 || section.kind === 'break') {
    const chord = [0, scale[2], scale[4], scale[6] ?? scale[4] + 5].map((s) => noteHz(root + s));
    playPad(ctx, master, chord, 0, loopDur, 0.06 + (1 - intensity) * 0.08, brightness);
  }

  // ── Lead / arp for bright, intense sections ─────────────────────────────
  if (intensity > 0.65 && brightness > 0.55) {
    const arpNotes = [0, 2, 4, 2].map((d) => noteHz(root + 12 + scale[d % scale.length]));
    for (let step = 0; step < totalBeats * 2; step++) {
      if (rng() < 0.2) continue;
      const t = (step / 2) * secPerBeat;
      playPluck(ctx, master, t, secPerBeat / 2, arpNotes[step % arpNotes.length], brightness);
    }
  }

  return ctx.startRendering();
}

function makeNoiseBuffer(ctx: OfflineAudioContext, rng: () => number): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  return buf;
}

function playKick(ctx: OfflineAudioContext, out: AudioNode, t: number, intensity: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);
  gain.gain.setValueAtTime(0.9 * (0.6 + intensity * 0.4), t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.35);
}

function playHat(
  ctx: OfflineAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  level: number,
  decay: number,
) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03 + decay * 0.06);
  src.connect(hp).connect(gain).connect(out);
  src.start(t, Math.random() * 0.4, 0.12);
}

function playClap(
  ctx: OfflineAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  level: number,
) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  src.connect(bp).connect(gain).connect(out);
  src.start(t, 0.5, 0.25);
}

function playBass(
  ctx: OfflineAudioContext,
  out: AudioNode,
  t: number,
  dur: number,
  freq: number,
  style: string,
  intensity: number,
  brightness: number,
) {
  const osc = ctx.createOscillator();
  osc.type = style === 'sub' ? 'sine' : style === 'reese' ? 'sawtooth' : style === 'stab' ? 'square' : 'sawtooth';
  osc.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200 + brightness * 900 + intensity * 500;
  lp.Q.value = style === 'stab' ? 6 : 1;
  const gain = ctx.createGain();
  const level = 0.32 * (0.5 + intensity * 0.5);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur * (style === 'rolling' ? 0.9 : 1.6));
  osc.connect(lp).connect(gain).connect(out);
  if (style === 'reese') {
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq * 1.01;
    osc2.connect(lp);
    osc2.start(t);
    osc2.stop(t + dur * 2);
  }
  osc.start(t);
  osc.stop(t + dur * 2);
}

function playPad(
  ctx: OfflineAudioContext,
  out: AudioNode,
  chord: number[],
  t: number,
  dur: number,
  level: number,
  brightness: number,
) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400 + brightness * 2200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + dur * 0.2);
  gain.gain.setValueAtTime(level, t + dur * 0.8);
  gain.gain.linearRampToValueAtTime(level * 0.6, t + dur);
  lp.connect(gain).connect(out);
  for (const freq of chord) {
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + dur);
    }
  }
}

function playPluck(
  ctx: OfflineAudioContext,
  out: AudioNode,
  t: number,
  dur: number,
  freq: number,
  brightness: number,
) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1200 + brightness * 4000, t);
  lp.frequency.exponentialRampToValueAtTime(600, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.4);
  osc.connect(lp).connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + dur * 1.5);
}

/** Peak envelope for waveform rendering: tiles per-section loop peaks. */
export function computePeaks(rendered: RenderedTrack, bins: number): Float32Array {
  const peaks = new Float32Array(bins);
  const total = rendered.track.duration;
  for (let i = 0; i < bins; i++) {
    const time = (i / bins) * total;
    const section = rendered.sections.find(
      (s) => time >= s.start && time < s.start + s.duration,
    ) ?? rendered.sections[rendered.sections.length - 1];
    const loopTime = (time - section.start) % section.buffer.duration;
    const data = section.buffer.getChannelData(0);
    const sliceLen = Math.floor((total / bins) * rendered.sampleRate);
    const startIdx = Math.floor(loopTime * rendered.sampleRate);
    let peak = 0;
    const step = Math.max(1, Math.floor(sliceLen / 50));
    for (let j = 0; j < sliceLen; j += step) {
      const v = Math.abs(data[(startIdx + j) % data.length]);
      if (v > peak) peak = v;
    }
    peaks[i] = peak;
  }
  return peaks;
}

/** Peak envelope for uploaded (single-buffer) tracks. */
export function computeBufferPeaks(buffer: AudioBuffer, bins: number): Float32Array {
  const peaks = new Float32Array(bins);
  const data = buffer.getChannelData(0);
  const sliceLen = Math.floor(data.length / bins);
  for (let i = 0; i < bins; i++) {
    let peak = 0;
    const step = Math.max(1, Math.floor(sliceLen / 60));
    for (let j = i * sliceLen; j < (i + 1) * sliceLen; j += step) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    peaks[i] = peak;
  }
  return peaks;
}
