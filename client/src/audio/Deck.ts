import { beatgridOf, loudnessTrimGain, type Track } from '@ai-dj/shared';
import type { RenderedTrack } from './synth';

export type DeckId = 'A' | 'B';

export type LoadedAudio =
  | { kind: 'synth'; rendered: RenderedTrack }
  | { kind: 'buffer'; buffer: AudioBuffer };

/**
 * One virtual turntable: source scheduling + a pro-DJ channel strip
 * (3-band EQ → sweep filter → volume) with delay/reverb sends.
 */
export class Deck {
  readonly id: DeckId;

  track: Track | null = null;
  audio: LoadedAudio | null = null;
  peaks: Float32Array | null = null;

  readonly trim: GainNode;
  readonly eqLow: BiquadFilterNode;
  readonly eqMid: BiquadFilterNode;
  readonly eqHigh: BiquadFilterNode;
  readonly filter: BiquadFilterNode;
  readonly volume: GainNode;
  readonly xfade: GainNode;
  readonly delay: DelayNode;
  readonly delayFeedback: GainNode;
  readonly delaySend: GainNode;
  readonly reverbSend: GainNode;
  readonly analyser: AnalyserNode;

  private readonly input: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private startCtxTime = 0;
  private startOffset = 0;
  private _playing = false;
  /** Playback rate at play() time plus every ramp since — position() integrates this. */
  private baseRate = 1;
  private rateRamps: { start: number; end: number; from: number; to: number }[] = [];
  private reanchorTimer: number | null = null;

  constructor(
    id: DeckId,
    private readonly ctx: AudioContext,
    reverbBus: AudioNode,
    destination: AudioNode,
  ) {
    this.id = id;
    this.input = ctx.createGain();
    this.trim = ctx.createGain();

    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 220;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1200;
    this.eqMid.Q.value = 0.8;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 5000;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 22050;
    this.filter.Q.value = 0.9;

    this.volume = ctx.createGain();
    this.xfade = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.delay = ctx.createDelay(2);
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.45;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;

    this.input
      .connect(this.trim)
      .connect(this.eqLow)
      .connect(this.eqMid)
      .connect(this.eqHigh)
      .connect(this.filter)
      .connect(this.volume);

    this.volume.connect(this.xfade);
    this.volume.connect(this.analyser);
    this.xfade.connect(destination);

    // Feedback delay loop, post-volume so echo-out tails survive the fade.
    this.volume.connect(this.delaySend);
    this.delaySend.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.xfade);

    this.volume.connect(this.reverbSend);
    this.reverbSend.connect(reverbBus);
  }

  get playing(): boolean {
    return this._playing;
  }

  load(track: Track, audio: LoadedAudio, peaks: Float32Array): void {
    this.stop();
    this.track = track;
    this.audio = audio;
    this.peaks = peaks;
    this.startOffset = 0;
    // Loudness matching: bring every track towards the same perceived level.
    this.trim.gain.value = loudnessTrimGain(track.lufs);
  }

  /**
   * Start playback at `offset` seconds into the track, optionally at a
   * non-natural `rate` (tempo sync while beatmatching).
   */
  play(offset = 0, when = this.ctx.currentTime, rate = 1): void {
    if (!this.track || !this.audio) return;
    this.clearSources();
    this.startCtxTime = when;
    this.startOffset = offset;
    this.baseRate = rate;
    this.rateRamps = [];
    this._playing = true;

    if (this.audio.kind === 'buffer') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.audio.buffer;
      src.playbackRate.value = rate;
      src.connect(this.input);
      src.start(when, Math.min(offset, this.audio.buffer.duration - 0.05));
      this.sources.push(src);
      return;
    }

    // Synth tracks: schedule each section's loop on the shared timeline.
    // Media time maps to context time through the playback rate.
    for (const section of this.audio.rendered.sections) {
      const sectionEnd = section.start + section.duration;
      if (sectionEnd <= offset) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = section.buffer;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = section.buffer.duration;
      src.playbackRate.value = rate;
      src.connect(this.input);
      const startsNow = section.start <= offset;
      const startAt = startsNow ? when : when + (section.start - offset) / rate;
      const loopOffset = startsNow ? (offset - section.start) % section.buffer.duration : 0;
      src.start(startAt, loopOffset);
      src.stop(when + (sectionEnd - offset) / rate);
      this.sources.push(src);
    }
  }

  pause(): void {
    if (!this._playing) return;
    this.startOffset = this.position();
    this.clearSources();
    this._playing = false;
  }

  resume(): void {
    if (this._playing || !this.track) return;
    this.play(this.startOffset);
  }

  stop(when?: number): void {
    if (this.reanchorTimer !== null) {
      clearTimeout(this.reanchorTimer);
      this.reanchorTimer = null;
    }
    if (when && when > this.ctx.currentTime) {
      for (const src of this.sources) {
        try {
          src.stop(when);
        } catch {
          /* already stopped */
        }
      }
      const delayMs = (when - this.ctx.currentTime) * 1000;
      setTimeout(() => {
        this._playing = false;
        this.sources = [];
      }, delayMs + 50);
      return;
    }
    this.clearSources();
    this._playing = false;
    this.startOffset = 0;
  }

  /** Current position in seconds within the loaded track. */
  position(): number {
    if (!this.track) return 0;
    if (!this._playing) return this.startOffset;
    return Math.min(
      this.track.duration,
      this.startOffset + this.mediaElapsed(this.ctx.currentTime),
    );
  }

  /** Media seconds elapsed since play(), integrating every rate ramp. */
  private mediaElapsed(at: number): number {
    let elapsed = 0;
    let cursor = this.startCtxTime;
    let rate = this.baseRate;
    for (const ramp of this.rateRamps) {
      if (at <= ramp.start) break;
      if (ramp.start > cursor) {
        elapsed += (Math.min(at, ramp.start) - cursor) * rate;
        cursor = ramp.start;
      }
      const upto = Math.min(at, ramp.end);
      if (upto > cursor) {
        const dur = ramp.end - ramp.start;
        const rEnd = dur <= 0 ? ramp.to : ramp.from + ((ramp.to - ramp.from) * (upto - ramp.start)) / dur;
        const rStart = dur <= 0 ? ramp.to : ramp.from + ((ramp.to - ramp.from) * (cursor - ramp.start)) / dur;
        elapsed += ((upto - cursor) * (rStart + rEnd)) / 2;
        cursor = upto;
      }
      rate = ramp.to;
    }
    if (at > cursor) elapsed += (at - cursor) * rate;
    return Math.max(0, elapsed);
  }

  /** Instantaneous playback rate at context time `at`. */
  rateAt(at = this.ctx.currentTime): number {
    let rate = this.baseRate;
    for (const ramp of this.rateRamps) {
      if (at <= ramp.start) break;
      if (at >= ramp.end || ramp.end <= ramp.start) rate = ramp.to;
      else rate = ramp.from + ((ramp.to - ramp.from) * (at - ramp.start)) / (ramp.end - ramp.start);
    }
    return rate;
  }

  /**
   * Ramp towards `target` rate keeping position bookkeeping exact. Synth
   * decks re-anchor their pre-scheduled section loops once the ramp settles,
   * so section boundaries stay on the (shifted) timeline.
   */
  syncRate(target: number, rampSec: number): void {
    if (!this._playing) return;
    const now = this.ctx.currentTime;
    const from = this.rateAt(now);
    this.rateRamps.push({ start: now, end: now + rampSec, from, to: target });
    for (const src of this.sources) {
      src.playbackRate.cancelScheduledValues(now);
      src.playbackRate.setValueAtTime(from, now);
      src.playbackRate.linearRampToValueAtTime(target, now + rampSec);
    }
    if (this.reanchorTimer !== null) clearTimeout(this.reanchorTimer);
    if (this.audio?.kind === 'synth') {
      this.reanchorTimer = window.setTimeout(() => {
        this.reanchorTimer = null;
        if (this._playing && this.audio?.kind === 'synth') {
          this.play(this.position(), this.ctx.currentTime, target);
        }
      }, rampSec * 1000 + 40);
    }
  }

  remaining(): number {
    if (!this.track) return 0;
    return Math.max(0, this.track.duration - this.position());
  }

  /** RMS level 0..1 for VU meters. */
  level(): number {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.min(1, Math.sqrt(sum / data.length) * 3);
  }

  /** Ramp playback rate on all live sources (backspin, nudges). */
  rampRate(target: number, seconds: number): void {
    const now = this.ctx.currentTime;
    const from = this.rateAt(now);
    this.rateRamps.push({ start: now, end: now + seconds, from, to: target });
    for (const src of this.sources) {
      src.playbackRate.cancelScheduledValues(now);
      src.playbackRate.setValueAtTime(from, now);
      src.playbackRate.linearRampToValueAtTime(target, now + seconds);
    }
  }

  /** Beat phase 0..1 from the beatgrid (drives synced visuals). */
  beatPhase(): number {
    if (!this.track || !this._playing) return 0;
    const grid = beatgridOf(this.track);
    const secPerBeat = 60 / grid.bpm;
    const rel = (this.position() - grid.firstBeatOffset) / secPerBeat;
    return rel - Math.floor(rel);
  }

  private clearSources(): void {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        /* not started or already stopped */
      }
      src.disconnect();
    }
    this.sources = [];
  }
}
