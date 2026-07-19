import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { Track } from '@ai-dj/shared';
import { listTracks, patchTrack } from './libraryService.js';
import { saveAudio } from './audioStorage.js';

const execFileAsync = promisify(execFile);
const AUDIO_ROOT = fileURLToPath(new URL('../../data/audio/', import.meta.url));

/**
 * Separate a library track's stored audio into rough vocal/instrumental
 * stems via ffmpeg phase-cancellation — not a neural source-separation
 * model (Demucs needs ~500MB+ just to load, which doesn't fit this
 * project's free-tier compute budget; see docs/HANDOFF.md). Works
 * reasonably on mixes with a dead-center lead vocal; instruments panned
 * center (or a non-centered vocal) leak into both stems. Two filters:
 *  - instrumental: L-R / R-L (cancels anything panned dead-center)
 *  - vocals: mono mid channel band-passed to the vocal formant range
 *    (200Hz-4kHz), which also discards most bass/kick and cymbal energy
 */
export async function separateTrack(id: string): Promise<Track> {
  const tracks = await listTracks();
  const track = tracks.find((t) => t.id === id);
  if (!track) throw new Error(`track not found: ${id}`);
  if (!track.audioUrl) throw new Error(`track "${id}" has no stored audio to separate`);

  const sourcePath = join(AUDIO_ROOT, track.audioUrl.replace(/^\/api\/audio\//, ''));
  const workDir = await mkdtemp(join(tmpdir(), 'dj-ia-stems-'));
  const instrumentalPath = join(workDir, 'instrumental.mp3');
  const vocalsPath = join(workDir, 'vocals.mp3');

  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', sourcePath,
      '-af', 'pan=stereo|c0=c0-c1|c1=c1-c0',
      '-q:a', '2', instrumentalPath,
    ]);
    await execFileAsync('ffmpeg', [
      '-y', '-i', sourcePath,
      '-af', 'pan=mono|c0=0.5*c0+0.5*c1,highpass=f=200,lowpass=f=4000',
      '-q:a', '2', vocalsPath,
    ]);

    const [vocals, instrumental] = await Promise.all([
      saveAudio(`${id}/vocals.mp3`, await readFile(vocalsPath)),
      saveAudio(`${id}/instrumental.mp3`, await readFile(instrumentalPath)),
    ]);

    const updated = await patchTrack(id, { stems: { vocals, instrumental } });
    if (!updated) throw new Error(`track disappeared while separating: ${id}`);
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`ffmpeg separation failed: ${message}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
