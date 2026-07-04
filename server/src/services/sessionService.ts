import { nanoid } from 'nanoid';
import type { DJSession } from '@ai-dj/shared';
import { JsonStore } from '../store/jsonStore.js';

const store = new JsonStore<DJSession[]>(
  new URL('../../data/sessions.json', import.meta.url).pathname,
  [],
);

export async function listSessions(): Promise<DJSession[]> {
  const sessions = await store.read();
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSession(id: string): Promise<DJSession | null> {
  return (await store.read()).find((s) => s.id === id) ?? null;
}

export async function saveSession(
  data: Omit<DJSession, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<DJSession> {
  const now = Date.now();
  let saved: DJSession;
  await store.update((sessions) => {
    const existing = data.id ? sessions.find((s) => s.id === data.id) : undefined;
    if (existing) {
      saved = { ...existing, ...data, id: existing.id, updatedAt: now };
      return sessions.map((s) => (s.id === saved.id ? saved : s));
    }
    saved = { ...data, id: `ses_${nanoid(10)}`, createdAt: now, updatedAt: now };
    return [...sessions, saved];
  });
  return saved!;
}

export async function deleteSession(id: string): Promise<void> {
  await store.update((sessions) => sessions.filter((s) => s.id !== id));
}
