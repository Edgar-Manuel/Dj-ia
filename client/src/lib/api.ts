import type { DJSession, PlanNextRequest, PlanNextResponse, Track, TrendProfile } from '@ai-dj/shared';

/**
 * Thin client for the AI DJ backend. Every call is failure-tolerant: the app
 * is fully functional offline with the local brain and demo library.
 */

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  aiStatus: () => request<{ engine: string }>('/ai/status'),

  getTrends: (region: string) => request<TrendProfile>(`/trends/${encodeURIComponent(region)}`),

  planNext: (body: PlanNextRequest) =>
    request<PlanNextResponse>('/ai/plan-next', { method: 'POST', body: JSON.stringify(body) }),

  listLibrary: () => request<Track[]>('/library'),

  uploadTrack: async (file: File): Promise<Track | null> => {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/library/upload', { method: 'POST', body: form });
      return res.ok ? ((await res.json()) as Track) : null;
    } catch {
      return null;
    }
  },

  patchTrack: (id: string, patch: Partial<Track>) =>
    request<Track>(`/library/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  listSessions: () => request<DJSession[]>('/sessions'),

  saveSession: (session: Omit<DJSession, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) =>
    request<DJSession>('/sessions', { method: 'POST', body: JSON.stringify(session) }),

  deleteSession: (id: string) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),
};
