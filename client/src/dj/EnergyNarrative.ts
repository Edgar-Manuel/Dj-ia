import {
  ENERGY_STATE_MAP,
  ENERGY_STATES,
  MODE_MAP,
  type EnergyStateId,
  type SessionModeId,
} from '@ai-dj/shared';

/**
 * The story arc of the set. Combines the mode's energy curve, the elapsed
 * fraction of the planned duration and the user's manual bias to decide the
 * current narrative state and the concrete target energy for selection.
 */
export class EnergyNarrative {
  private state: EnergyStateId = 'groove';
  private tracksInState = 0;

  constructor(
    private mode: SessionModeId,
    /** Planned set length in minutes; 0 = endless (arc loops every hour). */
    private setDurationMin: number,
  ) {
    this.state = this.stateForTarget(this.targetAt(0));
  }

  setMode(mode: SessionModeId): void {
    this.mode = mode;
    this.tracksInState = 99; // force re-evaluation on next advance
  }

  setDuration(minutes: number): void {
    this.setDurationMin = minutes;
  }

  get currentState(): EnergyStateId {
    return this.state;
  }

  /** Target energy 0..1 for the next selection. */
  targetEnergy(elapsedSec: number, bias: number): number {
    const arc = this.targetAt(elapsedSec);
    const band = ENERGY_STATE_MAP.get(this.state)!.band;
    const bandCenter = (band[0] + band[1]) / 2;
    // Blend the mode arc with the state band, then apply the manual bias.
    return clamp(arc * 0.6 + bandCenter * 0.4 + bias * 0.25, 0.02, 1);
  }

  /**
   * Advance the narrative after each track. States persist for 2-4 tracks
   * before the DJ considers moving on, and only transition to musically
   * coherent neighbors (never chill → peak in one jump).
   */
  advance(elapsedSec: number, bias: number): EnergyStateId {
    this.tracksInState++;
    const minStay = this.state === 'peak' || this.state === 'epic-finale' ? 2 : 2 + Math.floor(Math.random() * 2);
    const nearingEnd = this.setProgress(elapsedSec) > 0.88 && this.setDurationMin > 0;

    if (nearingEnd && this.allowed('epic-finale') && this.state !== 'epic-finale') {
      this.state = 'epic-finale';
      this.tracksInState = 0;
      return this.state;
    }
    if (this.tracksInState < minStay) return this.state;

    const target = this.targetAt(elapsedSec) + bias * 0.25;
    const def = ENERGY_STATE_MAP.get(this.state)!;
    const options = def.next.filter((id) => this.allowed(id));
    if (options.length === 0) return this.state;

    // Pick the allowed neighbor whose band best matches the arc target.
    const best = options
      .map((id) => {
        const band = ENERGY_STATE_MAP.get(id)!.band;
        const center = (band[0] + band[1]) / 2;
        return { id, dist: Math.abs(center - target) };
      })
      .sort((a, b) => a.dist - b.dist)[0];

    const currentCenter = (def.band[0] + def.band[1]) / 2;
    // Only move if the neighbor is meaningfully closer to the story target.
    if (best.dist < Math.abs(currentCenter - target) - 0.03 || Math.random() < 0.25) {
      this.state = best.id;
      this.tracksInState = 0;
    }
    return this.state;
  }

  private allowed(id: EnergyStateId): boolean {
    return !MODE_MAP.get(this.mode)!.forbidden.includes(id);
  }

  private setProgress(elapsedSec: number): number {
    const totalSec = (this.setDurationMin || 60) * 60;
    return this.setDurationMin > 0 ? Math.min(1, elapsedSec / totalSec) : (elapsedSec % totalSec) / totalSec;
  }

  private targetAt(elapsedSec: number): number {
    return clamp(MODE_MAP.get(this.mode)!.arc(this.setProgress(elapsedSec)), 0, 1);
  }

  private stateForTarget(target: number): EnergyStateId {
    const candidates = ENERGY_STATES.filter(
      (s) => this.allowed(s.id) && s.id !== 'epic-finale' && s.id !== 'cooldown',
    );
    return candidates
      .map((s) => ({ id: s.id, dist: Math.abs((s.band[0] + s.band[1]) / 2 - target) }))
      .sort((a, b) => a.dist - b.dist)[0].id;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
