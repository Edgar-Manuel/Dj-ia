import { useMemo, useRef, useState } from 'react';
import { GENRE_MAP, genreLabel, type Track } from '@ai-dj/shared';
import { analyzeBuffer } from '@/audio/analysis';
import { djBrain } from '@/dj/DJBrain';
import { api } from '@/lib/api';
import { useDJStore } from '@/state/store';

/** Library browser + drag&drop uploads with in-browser BPM/key analysis. */
export function LibraryPanel() {
  const library = useDJStore((s) => s.library);
  const genres = useDJStore((s) => s.genres);
  const analyzing = useDJStore((s) => s.uploadsAnalyzing);
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return library
      .filter((t) => !q || `${t.title} ${t.artist} ${genreLabel(t.genre)}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const aSel = genres.includes(a.genre) ? 0 : 1;
        const bSel = genres.includes(b.genre) ? 0 : 1;
        return aSel - bSel || (b.source === 'upload' ? 1 : 0) - (a.source === 'upload' ? 1 : 0);
      })
      .slice(0, 80);
  }, [library, query, genres]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) continue;
      useDJStore.setState((s) => ({ uploadsAnalyzing: s.uploadsAnalyzing + 1 }));
      try {
        // 1. Register on the server (metadata), tolerate offline mode.
        const serverTrack = await api.uploadTrack(file);

        // 2. Decode + real analysis in the browser.
        const engine = djBrain.ensureEngine();
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await engine.ctx.decodeAudioData(arrayBuf);
        const analysis = await analyzeBuffer(audioBuf);

        const base: Track = serverTrack ?? {
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: file.name.replace(/\.[^.]+$/, ''),
          artist: 'Local',
          genre: 'house',
          bpm: 120,
          key: '8A',
          energy: 0.5,
          duration: audioBuf.duration,
          popularity: 0.5,
          mood: 'groovy',
          year: new Date().getFullYear(),
          source: 'upload',
          sections: [],
          seed: 0,
        };

        const track: Track = {
          ...base,
          bpm: analysis.bpm,
          key: analysis.key,
          energy: analysis.energy,
          loudness: analysis.loudness,
          duration: audioBuf.duration,
          sections: base.sections.length > 0 ? base.sections : defaultSections(audioBuf.duration),
        };

        if (serverTrack) {
          void api.patchTrack(serverTrack.id, {
            bpm: track.bpm, key: track.key, energy: track.energy,
            loudness: track.loudness, duration: track.duration,
          });
        }

        djBrain.registerUpload(track, audioBuf);
        useDJStore.setState((s) => ({
          library: [track, ...s.library.filter((t) => t.id !== track.id)],
        }));
      } catch (err) {
        console.warn('No se pudo analizar el archivo', file.name, err);
      } finally {
        useDJStore.setState((s) => ({ uploadsAnalyzing: s.uploadsAnalyzing - 1 }));
      }
    }
  }

  return (
    <section
      className={`panel p-4 flex flex-col gap-3 max-h-96 transition-colors ${dragOver ? 'border-neon-lime/70' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Biblioteca</h3>
        <div className="flex items-center gap-2">
          {analyzing > 0 && (
            <span className="text-[10px] text-neon-amber animate-pulse font-mono">
              analizando {analyzing}…
            </span>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            className="chip border-neon-lime/50 text-neon-lime bg-neon-lime/10"
          >
            + Subir audio
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      </header>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Buscar entre ${library.length} temas…`}
        className="bg-panel-2 border border-line rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-neon-cyan/50"
      />

      <div className="overflow-y-auto flex flex-col gap-1 pr-1">
        {filtered.map((t) => {
          const color = GENRE_MAP.get(t.genre)?.color ?? '#64748b';
          return (
            <div
              key={t.id}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 bg-panel-2/40 border border-line/40 hover:border-line"
            >
              <span className="w-1 h-6 rounded-full shrink-0" style={{ background: color }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-200 truncate">
                  {t.title} <span className="text-slate-500">· {t.artist}</span>
                  {t.source === 'upload' && <span className="text-neon-lime ml-1">↑</span>}
                </p>
                <p className="text-[9px] font-mono text-slate-500">
                  {t.bpm} BPM · {t.key} · E{Math.round(t.energy * 10)} · {genreLabel(t.genre)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function defaultSections(duration: number) {
  const intro = Math.min(20, duration * 0.1);
  return [
    { kind: 'intro' as const, start: 0, duration: intro, intensity: 0.3 },
    { kind: 'drop' as const, start: intro, duration: duration - intro * 2, intensity: 0.9 },
    { kind: 'outro' as const, start: duration - intro, duration: intro, intensity: 0.3 },
  ];
}
