import { Router } from 'express';
import {
  deleteSession,
  getSession,
  listSessions,
  saveSession,
} from '../services/sessionService.js';

export const sessionsRouter = Router();

sessionsRouter.get('/', async (_req, res) => {
  res.json(await listSessions());
});

sessionsRouter.get('/:id', async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'session not found' });
    return;
  }
  res.json(session);
});

sessionsRouter.post('/', async (req, res) => {
  const { name, genres, mode, personality, setDurationMin, energyBias, history, id } = req.body ?? {};
  if (!name || !Array.isArray(genres) || !mode || !personality) {
    res.status(400).json({ error: 'name, genres, mode and personality are required' });
    return;
  }
  const session = await saveSession({
    id,
    name,
    genres,
    mode,
    personality,
    setDurationMin: Number(setDurationMin) || 0,
    energyBias: Number(energyBias) || 0,
    history: Array.isArray(history) ? history : [],
  });
  res.status(201).json(session);
});

sessionsRouter.delete('/:id', async (req, res) => {
  await deleteSession(req.params.id);
  res.status(204).end();
});
