import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUDIO_ROOT = fileURLToPath(new URL('../../data/audio/', import.meta.url));

/** Public path (mounted at /api/audio in app.ts) for a stored audio file. */
export function audioPublicPath(relativePath: string): string {
  return `/api/audio/${relativePath}`;
}

/** Save a buffer under server/data/audio/<relativePath> and return its public path. */
export async function saveAudio(relativePath: string, data: Buffer): Promise<string> {
  const dest = join(AUDIO_ROOT, relativePath);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, data);
  return audioPublicPath(relativePath);
}
