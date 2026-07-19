import { useEffect, useState } from 'react';
import type { Track } from '@ai-dj/shared';
import { djBrain } from '@/dj/DJBrain';
import { api } from '@/lib/api';
import { useDJStore } from '@/state/store';

/**
 * Trending tracks for the current region, with a path from "real song" to
 * "usable in the mix": import the Deezer preview (legal 30s stream), split
 * it into rough vocal/instrumental stems (ffmpeg phase-cancellation — see
 * server/src/services/stemService.ts), then loop the acapella over
 * whatever is already playing — the classic "vocal over another beat" edit.
 */
export function TrendsPanel() {
  const trendProfile = useDJStore((s) => s.trendProfile);
  const trendRegion = useDJStore((s) => s.trendRegion);
  const library = useDJStore((s) => s.library);
  const [loading, setLoading] = useState<string | null>(null);
  const [acapellaId, setAcapellaId] = useState<string | null>(null);

  useEffect(() => {
    if (trendProfile?.region === trendRegion) return;
    void api.getTrends(trendRegion).then((profile) => {
      if (profile) useDJStore.setState({ trendProfile: profile });
    });
  }, [trendRegion, trendProfile]);

  function importedTrack(artist: string, title: string): Track | undefined {
    return library.find((t) => t.source === 'deezer' && t.artist === artist && t.title === title);
  }

  async function handleImport(artist: string, title: string, previewUrl: string) {
    setLoading(`${artist}:${title}`);
    try {
      const track = await api.importTrend({ rank: 0, artist, title, previewUrl });
      if (track) useDJStore.setState((s) => ({ library: [track, ...s.library.filter((t) => t.id !== track.id)] }));
    } finally {
      setLoading(null);
    }
  }

  async function handleSeparate(id: string) {
    setLoading(id);
    try {
      const track = await api.separateTrack(id);
      if (track) useDJStore.setState((s) => ({ library: s.library.map((t) => (t.id === id ? track : t)) }));
    } finally {
      setLoading(null);
    }
  }

  async function toggleAcapella(track: Track) {
    if (!track.stems) return;
    const engine = djBrain.ensureEngine();
    await engine.resume();
    if (acapellaId === track.id) {
      engine.stopVocalLayer();
      setAcapellaId(null);
      return;
    }
    await engine.loadVocalLayer(track.stems.vocals);
    engine.playVocalLayer();
    setAcapellaId(track.id);
  }

  return (
    <section className="panel p-4 flex flex-col gap-3 max-h-96">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Tendencias {trendProfile ? `· ${trendProfile.regionLabel}` : ''}
        </h3>
        {trendProfile?.source === 'fallback' && (
          <span className="text-[9px] text-neon-amber font-mono">sin datos en vivo</span>
        )}
      </header>

      <div className="overflow-y-auto flex flex-col gap-1 pr-1">
        {(trendProfile?.tracks ?? []).slice(0, 15).map((trend) => {
          const track = importedTrack(trend.artist, trend.title);
          const key = `${trend.artist}:${trend.title}`;
          const busy = loading === key || loading === track?.id;
          return (
            <div
              key={key}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 bg-panel-2/40 border border-line/40 hover:border-line"
            >
              <span className="w-5 shrink-0 text-[9px] font-mono text-slate-500 text-right">{trend.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-200 truncate">
                  {trend.title} <span className="text-slate-500">· {trend.artist}</span>
                </p>
              </div>
              {!track && (
                <button
                  disabled={busy}
                  onClick={() => void handleImport(trend.artist, trend.title, trend.previewUrl ?? '')}
                  className="chip border-neon-cyan/50 text-neon-cyan bg-neon-cyan/10 disabled:opacity-40"
                >
                  {busy ? '…' : 'Importar'}
                </button>
              )}
              {track && !track.stems && (
                <button
                  disabled={busy}
                  onClick={() => void handleSeparate(track.id)}
                  className="chip border-neon-amber/50 text-neon-amber bg-neon-amber/10 disabled:opacity-40"
                >
                  {busy ? '…' : 'Separar'}
                </button>
              )}
              {track?.stems && (
                <button
                  onClick={() => void toggleAcapella(track)}
                  className={`chip ${
                    acapellaId === track.id
                      ? 'border-neon-lime/70 text-neon-lime bg-neon-lime/20'
                      : 'border-neon-lime/50 text-neon-lime bg-neon-lime/10'
                  }`}
                >
                  {acapellaId === track.id ? '■ Acapella' : '▶ Acapella'}
                </button>
              )}
            </div>
          );
        })}
        {trendProfile && trendProfile.tracks.length === 0 && (
          <p className="text-[10px] text-slate-600 py-4 text-center">Sin datos de tendencias ahora mismo.</p>
        )}
      </div>
    </section>
  );
}
