import { Router } from 'express';
import type { PlanNextRequest } from '@ai-dj/shared';
import { activePlanner, planNext } from '../services/ai/index.js';

export const aiRouter = Router();

/** Which planning engine is currently active (heuristic vs claude). */
aiRouter.get('/status', (_req, res) => {
  res.json({ engine: activePlanner().name });
});

/** Decide the next track + transition for the given musical context. */
aiRouter.post('/plan-next', async (req, res) => {
  const body = req.body as PlanNextRequest;
  if (!Array.isArray(body?.candidates) || body.candidates.length === 0) {
    res.status(400).json({ error: 'candidates array is required' });
    return;
  }
  try {
    res.json(await planNext(body));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'planning failed' });
  }
});
