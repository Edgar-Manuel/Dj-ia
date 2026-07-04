import type { Track, TransitionPlan } from '@ai-dj/shared';
import { Deck, type DeckId, type LoadedAudio } from './Deck';
import { computeBufferPeaks, computePeaks, renderTrack } from './synth';

const WAVEFORM_BINS = 600;

/**
 * The mixing console: two decks, an equal-power crossfader, a shared reverb
 * bus and a master chain with limiter + analyser. Executes the transition
 * plans decided by the AI as sample-accurate parameter automation.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly deckA: Deck;
  readonly deckB: Deck;
  readonly masterAnalyser: AnalyserNode;

  /** Crossfader position: 0 = full A, 1 = full B. */
  private xfadePos = 0;
  private xfadeAnim: { from: number; to: number; start: number; dur: number } | null = null;

  constructor() {
    this.ctx = new AudioContext();

    const reverb = this.ctx.createConvolver();
    reverb.buffer = makeImpulse(this.ctx, 2.8, 2.2);
    const reverbReturn = this.ctx.createGain();
    reverbReturn.gain.value = 0.8;

    const master = this.ctx.createGain();
    master.gain.value = 0.95;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.masterAnalyser.smoothingTimeConstant = 0.82;

    reverb.connect(reverbReturn).connect(master);
    master.connect(limiter).connect(this.masterAnalyser).connect(this.ctx.destination);

    this.deckA = new Deck('A', this.ctx, reverb, master);
    this.deckB = new Deck('B', this.ctx, reverb, master);
    this.applyCrossfade(0, 0);
  }

  deck(id: DeckId): Deck {
    return id === 'A' ? this.deckA : this.deckB;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Render (or reuse) audio for a track and load it into a deck. */
  async loadTrack(deckId: DeckId, track: Track, uploadBuffer?: AudioBuffer): Promise<void> {
    const deck = this.deck(deckId);
    let audio: LoadedAudio;
    let peaks: Float32Array;
    if (uploadBuffer) {
      audio = { kind: 'buffer', buffer: uploadBuffer };
      peaks = computeBufferPeaks(uploadBuffer, WAVEFORM_BINS);
    } else {
      const rendered = await renderTrack(track);
      audio = { kind: 'synth', rendered };
      peaks = computePeaks(rendered, WAVEFORM_BINS);
    }
    deck.load(track, audio, peaks);
  }

  get crossfade(): number {
    this.tickXfade();
    return this.xfadePos;
  }

  setCrossfade(pos: number, rampSec = 0.05): void {
    this.xfadeAnim = null;
    this.applyCrossfade(pos, rampSec);
  }

  /** Animate the crossfader — the UI reads `crossfade` every frame. */
  animateCrossfade(to: number, seconds: number): void {
    this.tickXfade();
    this.xfadeAnim = { from: this.xfadePos, to, start: this.ctx.currentTime, dur: seconds };
    const now = this.ctx.currentTime;
    const gA = this.deckA.xfade.gain;
    const gB = this.deckB.xfade.gain;
    gA.cancelScheduledValues(now);
    gB.cancelScheduledValues(now);
    gA.setValueAtTime(Math.cos(this.xfadePos * Math.PI * 0.5), now);
    gB.setValueAtTime(Math.sin(this.xfadePos * Math.PI * 0.5), now);
    // Approximate the equal-power curve with segments (AudioParam is linear).
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const p = this.xfadePos + (to - this.xfadePos) * (i / steps);
      const t = now + seconds * (i / steps);
      gA.linearRampToValueAtTime(Math.cos(p * Math.PI * 0.5), t);
      gB.linearRampToValueAtTime(Math.sin(p * Math.PI * 0.5), t);
    }
  }

  /**
   * Execute a transition: `from` keeps playing while `to` (already loaded)
   * starts, with type-specific EQ/filter/FX automation. Returns the moment
   * (ctx time) at which the outgoing deck stops.
   */
  executeTransition(from: DeckId, to: DeckId, plan: TransitionPlan): number {
    const out = this.deck(from);
    const inc = this.deck(to);
    if (!inc.track) return this.ctx.currentTime;

    const now = this.ctx.currentTime;
    const outBpm = out.track?.bpm ?? inc.track.bpm;
    const secPerBeat = 60 / outBpm;
    let blend = plan.beats * secPerBeat;
    const toB = to === 'B';

    switch (plan.type) {
      case 'backspin': {
        out.rampRate(0.02, 0.45);
        out.volume.gain.setValueAtTime(1, now);
        out.volume.gain.linearRampToValueAtTime(0, now + 0.5);
        out.stop(now + 0.55);
        inc.play(plan.incomingOffset, now + 0.45);
        this.animateCrossfade(toB ? 1 : 0, 0.45);
        this.resetChannel(out, now + 1);
        return now + 0.55;
      }
      case 'echo-out': {
        const d = out.delaySend.gain;
        out.delay.delayTime.setValueAtTime(secPerBeat * 0.75, now);
        d.setValueAtTime(0, now);
        d.linearRampToValueAtTime(0.9, now + 0.1);
        out.delayFeedback.gain.setValueAtTime(0.72, now);
        out.volume.gain.setValueAtTime(1, now);
        out.volume.gain.linearRampToValueAtTime(0, now + blend * 0.6);
        inc.play(plan.incomingOffset, now + blend * 0.25);
        this.animateCrossfade(toB ? 1 : 0, blend * 0.7);
        out.stop(now + blend + 2.5); // let the echo tail ring
        this.resetChannel(out, now + blend + 2.5);
        return now + blend;
      }
      case 'reverb-tail': {
        out.reverbSend.gain.setValueAtTime(0, now);
        out.reverbSend.gain.linearRampToValueAtTime(1.1, now + blend * 0.4);
        out.volume.gain.setValueAtTime(1, now);
        out.volume.gain.linearRampToValueAtTime(0, now + blend * 0.8);
        inc.play(plan.incomingOffset, now + blend * 0.3);
        this.animateCrossfade(toB ? 1 : 0, blend * 0.8);
        out.stop(now + blend + 3);
        this.resetChannel(out, now + blend + 3);
        return now + blend;
      }
      case 'delay-throw': {
        out.delay.delayTime.setValueAtTime(secPerBeat * 0.5, now);
        out.delaySend.gain.setValueAtTime(0.85, now);
        out.delayFeedback.gain.setValueAtTime(0.6, now);
        inc.play(plan.incomingOffset, now + secPerBeat * 2);
        out.volume.gain.setValueAtTime(1, now + secPerBeat * 2);
        out.volume.gain.linearRampToValueAtTime(0, now + blend);
        this.animateCrossfade(toB ? 1 : 0, blend);
        out.stop(now + blend + 2);
        this.resetChannel(out, now + blend + 2);
        return now + blend;
      }
      case 'filter-sweep': {
        out.filter.type = 'highpass';
        out.filter.frequency.setValueAtTime(20, now);
        out.filter.frequency.exponentialRampToValueAtTime(2400, now + blend);
        inc.filter.type = 'lowpass';
        inc.filter.frequency.setValueAtTime(300, now);
        inc.filter.frequency.exponentialRampToValueAtTime(22050, now + blend);
        inc.play(plan.incomingOffset, now);
        this.animateCrossfade(toB ? 1 : 0, blend);
        out.stop(now + blend + 0.2);
        this.resetChannel(out, now + blend + 0.5);
        return now + blend;
      }
      case 'eq-mix':
      case 'long-blend':
      case 'loop-transition': {
        // Bass swap at the midpoint — the signature club technique.
        const mid = now + blend * 0.5;
        out.eqLow.gain.setValueAtTime(0, mid - secPerBeat);
        out.eqLow.gain.linearRampToValueAtTime(-26, mid + secPerBeat);
        inc.eqLow.gain.setValueAtTime(-26, now);
        inc.eqLow.gain.setValueAtTime(-26, mid - secPerBeat);
        inc.eqLow.gain.linearRampToValueAtTime(0, mid + secPerBeat);
        out.eqHigh.gain.setValueAtTime(0, now + blend * 0.6);
        out.eqHigh.gain.linearRampToValueAtTime(-12, now + blend);
        inc.play(plan.incomingOffset, now);
        this.animateCrossfade(toB ? 1 : 0, blend);
        out.stop(now + blend + 0.2);
        this.resetChannel(out, now + blend + 0.5);
        return now + blend;
      }
      case 'drop-mix':
      case 'double-drop': {
        const lead = plan.type === 'double-drop' ? secPerBeat * 8 : secPerBeat * 4;
        blend = Math.max(blend, lead + secPerBeat * 2);
        inc.play(plan.incomingOffset, now);
        this.animateCrossfade(toB ? 1 : 0, plan.type === 'double-drop' ? blend : lead);
        if (plan.type === 'drop-mix') {
          out.volume.gain.setValueAtTime(1, now + lead - 0.05);
          out.volume.gain.linearRampToValueAtTime(0, now + lead + 0.1);
        }
        out.stop(now + blend);
        this.resetChannel(out, now + blend + 0.3);
        return now + blend;
      }
      case 'quick-mix': {
        inc.play(plan.incomingOffset, now);
        this.animateCrossfade(toB ? 1 : 0, blend);
        out.stop(now + blend + 0.1);
        this.resetChannel(out, now + blend + 0.3);
        return now + blend;
      }
      case 'beatmatch':
      case 'smooth-blend':
      default: {
        inc.volume.gain.setValueAtTime(0.85, now);
        inc.volume.gain.linearRampToValueAtTime(1, now + blend);
        inc.play(plan.incomingOffset, now);
        this.animateCrossfade(toB ? 1 : 0, blend);
        out.stop(now + blend + 0.2);
        this.resetChannel(out, now + blend + 0.5);
        return now + blend;
      }
    }
  }

  /** Spectrum snapshot (0..1 per bin) for the visualizer. */
  spectrum(bins = 96): Float32Array {
    const raw = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(raw);
    const result = new Float32Array(bins);
    // Log-ish distribution so bass doesn't dominate the whole strip.
    for (let i = 0; i < bins; i++) {
      const start = Math.floor((i / bins) ** 1.6 * raw.length * 0.72);
      const end = Math.max(start + 1, Math.floor(((i + 1) / bins) ** 1.6 * raw.length * 0.72));
      let sum = 0;
      for (let j = start; j < end; j++) sum += raw[j];
      result[i] = sum / (end - start) / 255;
    }
    return result;
  }

  private tickXfade(): void {
    if (!this.xfadeAnim) return;
    const { from, to, start, dur } = this.xfadeAnim;
    const t = Math.min(1, (this.ctx.currentTime - start) / dur);
    this.xfadePos = from + (to - from) * t;
    if (t >= 1) this.xfadeAnim = null;
  }

  private applyCrossfade(pos: number, rampSec: number): void {
    this.xfadePos = Math.min(1, Math.max(0, pos));
    const now = this.ctx.currentTime;
    const gA = Math.cos(this.xfadePos * Math.PI * 0.5);
    const gB = Math.sin(this.xfadePos * Math.PI * 0.5);
    this.deckA.xfade.gain.cancelScheduledValues(now);
    this.deckB.xfade.gain.cancelScheduledValues(now);
    this.deckA.xfade.gain.setTargetAtTime(gA, now, Math.max(0.01, rampSec / 3));
    this.deckB.xfade.gain.setTargetAtTime(gB, now, Math.max(0.01, rampSec / 3));
  }

  /** Restore a channel strip to neutral after its transition finishes. */
  private resetChannel(deck: Deck, atCtxTime: number): void {
    const delayMs = Math.max(0, (atCtxTime - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      const now = this.ctx.currentTime;
      for (const param of [deck.eqLow.gain, deck.eqMid.gain, deck.eqHigh.gain]) {
        param.cancelScheduledValues(now);
        param.setTargetAtTime(0, now, 0.05);
      }
      deck.filter.type = 'lowpass';
      deck.filter.frequency.cancelScheduledValues(now);
      deck.filter.frequency.setTargetAtTime(22050, now, 0.05);
      deck.volume.gain.cancelScheduledValues(now);
      deck.volume.gain.setTargetAtTime(1, now, 0.05);
      deck.delaySend.gain.cancelScheduledValues(now);
      deck.delaySend.gain.setTargetAtTime(0, now, 0.1);
      deck.reverbSend.gain.cancelScheduledValues(now);
      deck.reverbSend.gain.setTargetAtTime(0, now, 0.1);
    }, delayMs);
  }
}

/** Synthetic stereo impulse response for the shared reverb. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return impulse;
}
