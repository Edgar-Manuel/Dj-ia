import { Router } from 'express';
import multer from 'multer';
import {
  ingestUpload,
  importFromDeezerPreview,
  listTracks,
  patchTrack,
  removeTrack,
  smartPlaylist,
} from '../services/libraryService.js';
import { separateTrack } from '../services/stemService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

export const libraryRouter = Router();

libraryRouter.get('/', async (_req, res) => {
  res.json(await listTracks());
});

libraryRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'missing file field "file"' });
    return;
  }
  const track = await ingestUpload(req.file.buffer, req.file.originalname, req.file.mimetype);
  res.status(201).json(track);
});

/** Bring a real trending track in (Deezer preview, 30s, legal to fetch/play). */
libraryRouter.post('/import-trend', async (req, res) => {
  const { title, artist, previewUrl, genre } = req.body ?? {};
  if (typeof title !== 'string' || typeof artist !== 'string' || typeof previewUrl !== 'string') {
    res.status(400).json({ error: 'title, artist and previewUrl are required' });
    return;
  }
  try {
    const track = await importFromDeezerPreview({ title, artist, previewUrl, genre });
    res.status(201).json(track);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'import failed' });
  }
});

/** Separate a real track's audio into vocal/instrumental stems (Demucs sidecar; can take a couple minutes). */
libraryRouter.post('/:id/separate', async (req, res) => {
  try {
    const track = await separateTrack(req.params.id);
    res.json(track);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'separation failed' });
  }
});

libraryRouter.patch('/:id', async (req, res) => {
  const track = await patchTrack(req.params.id, req.body);
  if (!track) {
    res.status(404).json({ error: 'track not found' });
    return;
  }
  res.json(track);
});

libraryRouter.delete('/:id', async (req, res) => {
  await removeTrack(req.params.id);
  res.status(204).end();
});

libraryRouter.get('/:id/smart-playlist', async (req, res) => {
  const size = Number(req.query.size) || 10;
  res.json(await smartPlaylist(req.params.id, size));
});
