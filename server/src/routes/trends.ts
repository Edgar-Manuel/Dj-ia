import { Router } from 'express';
import { trendsService } from '../services/trends/trendsService.js';

export const trendsRouter = Router();

/** Region codes with a dedicated chart; anything else falls back to global. */
trendsRouter.get('/regions', (_req, res) => {
  res.json({ regions: trendsService.listRegions() });
});

/** Trending tracks for a region (ISO-3166 alpha-2, lowercase) or "global". */
trendsRouter.get('/:region', async (req, res) => {
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
  try {
    const profile = await trendsService.getRegion(req.params.region, { forceRefresh });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'trends fetch failed' });
  }
});
