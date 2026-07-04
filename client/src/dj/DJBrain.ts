import {
  planTransition,
  scoreCandidate,
  type DJSession,
  type PlanNextRequest,
  type PlayedTrack,
  type Track,
  type TransitionPlan,
} from '@ai-dj/shared';
import { AudioEngine } from '@/audio/AudioEngine';
import type { DeckId } from '@/audio/Deck';
import { api } from '@/lib/api';
import { useDJStore } from '@/state/store';
import { EnergyNarrative } from './EnergyNarrative';
import { SetMemory } from './SetMemory';

const TICK_MS = 250;

/**
 * The autonomous DJ. Owns the audio engine, the set memory and the energy
 * narrative; continuously decides what to play next, when to mix and which
 * transition to use — exactly like a human DJ planning two songs ahead.
 */
class DJBrain {
  engine: AudioEngine | null = null;
  readonly memory = new SetMemory();
  private narrative = new EnergyNarrative('club', 120);
  private uploadBuffers = new Map<string, AudioBuffer>();
  private tickTimer: number | null = null;
  private deciding = false;
  private transitionUntil = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  ensureEngine(): AudioEngine {
    if (!this.engine) this.engine = new AudioEngine();
    return this.engine;
  }

  async start(): Promise<void> {
    const store = useDJStore.getState();
    const engine = this.ensureEngine();
    await engine.resume();

    if (store.status === 'paused') {
      engine.deck(store.activeDeck).resume();
      useDJStore.setState({ status: 'playing' });
      this.startTicking();
      return;
    }
    if (store.status === 'playing') return;

    this.narrative = new EnergyNarrative(store.mode, store.setDurationMin);

    const opener = await this.decide(null);
    if (!opener) return;

    const deckId = store.activeDeck;
    await this.loadIntoDeck(deckId, opener.track);
    engine.setCrossfade(deckId === 'A' ? 0 : 1);
    engine.deck(deckId).play(0);

    this.recordPlay(opener.track, null);
    useDJStore.setState({
      status: 'playing',
      deckTracks: { ...useDJStore.getState().deckTracks, [deckId]: opener.track },
      lastTransitionReason: 'Set iniciado. La IA está construyendo la narrativa…',
    });

    this.startTicking();
    void this.planNext();
  }

  pause(): void {
    const store = useDJStore.getState();
    if (store.status !== 'playing' || !this.engine) return;
    this.engine.deck(store.activeDeck).pause();
    this.engine.deck(this.idleDeck()).pause();
    useDJStore.setState({ status: 'paused' });
    this.stopTicking();
  }

  stop(): void {
    this.engine?.deckA.stop();
    this.engine?.deckB.stop();
    this.stopTicking();
    this.memory.restore([]);
    useDJStore.setState({
      status: 'idle',
      deckTracks: { A: null, B: null },
      nextUp: null,
      history: [],
      transitioning: false,
      lastTransitionReason: null,
    });
  }

  async skip(): Promise<void> {
    const store = useDJStore.getState();
    if (store.status !== 'playing' || store.transitioning) return;
    if (!store.nextUp?.ready) {
      await this.planNext();
    }
    const next = useDJStore.getState().nextUp;
    if (!next?.ready) return;
    // Skips are urgent: shorten whatever was planned.
    this.fireTransition({ ...next.transition, beats: Math.min(next.transition.beats, 8) });
  }

  // ── Config changes mid-set ────────────────────────────────────────────

  onModeChanged(): void {
    const store = useDJStore.getState();
    this.narrative.setMode(store.mode);
    this.narrative.setDuration(store.setDurationMin);
    this.replan();
  }

  replan(): void {
    if (useDJStore.getState().status === 'playing') {
      useDJStore.setState({ nextUp: null });
      void this.planNext();
    }
  }

  // ── Uploads & sessions ────────────────────────────────────────────────

  registerUpload(track: Track, buffer: AudioBuffer): void {
    this.uploadBuffers.set(track.id, buffer);
  }

  loadSession(session: DJSession): void {
    this.stop();
    this.memory.restore(session.history);
    this.narrative = new EnergyNarrative(session.mode, session.setDurationMin);
    useDJStore.setState({
      sessionId: session.id,
      sessionName: session.name,
      genres: session.genres,
      mode: session.mode,
      personality: session.personality,
      setDurationMin: session.setDurationMin,
      energyBias: session.energyBias,
      history: session.history,
    });
  }

  sessionSnapshot() {
    const s = useDJStore.getState();
    return {
      id: s.sessionId ?? undefined,
      name: s.sessionName,
      genres: s.genres,
      mode: s.mode,
      personality: s.personality,
      setDurationMin: s.setDurationMin,
      energyBias: s.energyBias,
      history: s.history,
    };
  }

  // ── Decision making ───────────────────────────────────────────────────

  private async decide(
    current: Track | null,
  ): Promise<{ track: Track; transition: TransitionPlan; engine: 'heuristic' | 'claude' | 'local' } | null> {
    const store = useDJStore.getState();
    const candidates = this.memory.candidates(store.library, store.genres);
    if (candidates.length === 0) return null;

    const elapsed = this.memory.elapsedSec();
    const targetEnergy = this.narrative.targetEnergy(elapsed, store.energyBias);
    useDJStore.setState({ targetEnergy, energyState: this.narrative.currentState });

    const req: PlanNextRequest = {
      current,
      candidates: candidates.slice(0, 60),
      targetEnergy,
      energyState: this.narrative.currentState,
      personality: store.personality,
      mode: store.mode,
      recentArtists: this.memory.recentArtists(),
      recentTrackIds: this.memory.recentTrackIds(),
    };

    if (store.useServerAI) {
      const remote = await api.planNext(req);
      if (remote) {
        const track = candidates.find((t) => t.id === remote.trackId);
        if (track) return { track, transition: remote.transition, engine: remote.engine };
      }
    }

    // Local brain: same scoring model, zero latency, works offline.
    const scored = req.candidates
      .map((t) => ({ t, s: scoreCandidate(t, req) }))
      .sort((a, b) => b.s.total - a.s.total);
    const track = scored[0].t;
    return { track, transition: planTransition(current, track, req), engine: 'local' };
  }

  private async planNext(): Promise<void> {
    if (this.deciding) return;
    this.deciding = true;
    try {
      const store = useDJStore.getState();
      const current = store.deckTracks[store.activeDeck];
      const decision = await this.decide(current);
      if (!decision) return;

      useDJStore.setState({
        nextUp: { track: decision.track, transition: decision.transition, engine: decision.engine, ready: false },
      });
      await this.loadIntoDeck(this.idleDeck(), decision.track);

      const nextUp = useDJStore.getState().nextUp;
      if (nextUp?.track.id === decision.track.id) {
        useDJStore.setState({ nextUp: { ...nextUp, ready: true } });
      }
    } finally {
      this.deciding = false;
    }
  }

  private async loadIntoDeck(deckId: DeckId, track: Track): Promise<void> {
    const engine = this.ensureEngine();
    await engine.loadTrack(deckId, track, this.uploadBuffers.get(track.id));
    useDJStore.setState({
      deckTracks: { ...useDJStore.getState().deckTracks, [deckId]: track },
    });
  }

  // ── The autonomous loop ───────────────────────────────────────────────

  private startTicking(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private stopTicking(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private tick(): void {
    const store = useDJStore.getState();
    if (store.status !== 'playing' || !this.engine) return;

    if (store.transitioning && this.engine.ctx.currentTime >= this.transitionUntil) {
      useDJStore.setState({ transitioning: false });
    }
    if (store.transitioning || !store.autoMode) return;

    const active = this.engine.deck(store.activeDeck);
    if (!active.track) return;

    const next = store.nextUp;
    if (!next?.ready) {
      if (!this.deciding && !next) void this.planNext();
      return;
    }

    const remaining = active.remaining();
    // Mix when the planned window arrives (or safety net at 6s from the end).
    if (remaining <= Math.max(next.transition.startBeforeEnd, 6)) {
      this.fireTransition(next.transition);
    }
  }

  private fireTransition(plan: TransitionPlan): void {
    const store = useDJStore.getState();
    const next = store.nextUp;
    if (!next?.ready || !this.engine) return;

    const from = store.activeDeck;
    const to = this.idleDeck();

    const endsAt = this.engine.executeTransition(from, to, plan);
    this.transitionUntil = endsAt;

    this.recordPlay(next.track, plan);
    const newState = this.narrative.advance(this.memory.elapsedSec(), store.energyBias);

    useDJStore.setState({
      activeDeck: to,
      nextUp: null,
      transitioning: true,
      energyState: newState,
      lastTransitionReason: plan.reason,
    });

    // Think about the following track once the blend settles.
    window.setTimeout(() => void this.planNext(), 1200);
  }

  private recordPlay(track: Track, plan: TransitionPlan | null): void {
    const entry: PlayedTrack = {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      genre: track.genre,
      bpm: track.bpm,
      key: track.key,
      startedAt: Date.now(),
      transition: plan?.type ?? null,
      energyState: this.narrative.currentState,
    };
    this.memory.record(entry);
    useDJStore.setState({ history: [...this.memory.history] });
  }

  private idleDeck(): DeckId {
    return useDJStore.getState().activeDeck === 'A' ? 'B' : 'A';
  }
}

export const djBrain = new DJBrain();
