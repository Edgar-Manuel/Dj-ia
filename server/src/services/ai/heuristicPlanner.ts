import {
  planTransition,
  scoreCandidate,
  type PlanNextRequest,
  type PlanNextResponse,
} from '@ai-dj/shared';
import type { DJPlanner } from './types.js';

/**
 * Deterministic rule-based DJ brain. The scoring model lives in
 * @ai-dj/shared so the browser brain and this endpoint stay in sync.
 */
export class HeuristicPlanner implements DJPlanner {
  readonly name = 'heuristic';

  isAvailable(): boolean {
    return true;
  }

  async planNext(req: PlanNextRequest): Promise<PlanNextResponse> {
    const scores = req.candidates.map((t) => scoreCandidate(t, req));
    scores.sort((a, b) => b.total - a.total);
    const best = scores[0];
    if (!best) throw new Error('no candidates provided');
    const chosen = req.candidates.find((t) => t.id === best.trackId)!;
    return {
      trackId: best.trackId,
      transition: planTransition(req.current, chosen, req),
      scores: scores.slice(0, 8),
      engine: 'heuristic',
    };
  }
}

export { planTransition, scoreCandidate };
