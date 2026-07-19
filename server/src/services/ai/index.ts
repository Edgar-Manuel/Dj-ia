import type { PlanNextRequest, PlanNextResponse } from '@ai-dj/shared';
import { HeuristicPlanner } from './heuristicPlanner.js';
import { ClaudePlanner } from './claudePlanner.js';
import { OpenRouterPlanner } from './openRouterPlanner.js';
import type { DJPlanner } from './types.js';

const heuristic = new HeuristicPlanner();
const claude = new ClaudePlanner();
const openRouter = new OpenRouterPlanner();

/**
 * Registry ordered by preference; first available planner wins. OpenRouter
 * comes first so a deployment with OPENROUTER_API_KEY (no direct Anthropic
 * key required) still gets the full tool-using agent, not just heuristics.
 */
const planners: DJPlanner[] = [openRouter, claude, heuristic];

export function activePlanner(): DJPlanner {
  return planners.find((p) => p.isAvailable()) ?? heuristic;
}

/** Plan with the best available engine, degrading gracefully to heuristics. */
export async function planNext(req: PlanNextRequest): Promise<PlanNextResponse> {
  const planner = activePlanner();
  if (planner === heuristic) return heuristic.planNext(req);
  try {
    return await planner.planNext(req);
  } catch (err) {
    console.warn(`[ai] ${planner.name} planner failed, falling back to heuristic:`, err);
    return heuristic.planNext(req);
  }
}

export { HeuristicPlanner, ClaudePlanner, OpenRouterPlanner };
