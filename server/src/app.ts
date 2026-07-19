import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { libraryRouter } from './routes/library.js';
import { sessionsRouter } from './routes/sessions.js';
import { aiRouter } from './routes/ai.js';
import { trendsRouter } from './routes/trends.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'ai-dj', time: Date.now() });
  });

  app.use('/api/library', libraryRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/trends', trendsRouter);

  // Serve the built client in production (single-process deployment).
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDist = join(here, '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  return app;
}
