import type { PlanNextRequest, PlanNextResponse } from '@ai-dj/shared';

/**
 * A planner decides the next track and how to transition into it.
 * Implementations: local heuristic engine (always available) and
 * LLM-backed planners (Claude) enabled via environment configuration.
 */
export interface DJPlanner {
  readonly name: string;
  isAvailable(): boolean;
  planNext(req: PlanNextRequest): Promise<PlanNextResponse>;
}
