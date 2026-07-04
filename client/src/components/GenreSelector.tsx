import { GENRES } from '@ai-dj/shared';
import { djBrain } from '@/dj/DJBrain';
import { useDJStore } from '@/state/store';

export function GenreSelector() {
  const genres = useDJStore((s) => s.genres);
  const toggleGenre = useDJStore((s) => s.toggleGenre);

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Estilos musicales</h3>
        <span className="text-xs font-mono text-slate-500">{genres.length} activos</span>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {GENRES.map((g) => {
          const active = genres.includes(g.id);
          return (
            <button
              key={g.id}
              onClick={() => {
                toggleGenre(g.id);
                djBrain.replan();
              }}
              className="chip"
              style={
                active
                  ? { color: g.color, borderColor: `${g.color}88`, background: `${g.color}16`, boxShadow: `0 0 10px ${g.color}33` }
                  : { color: '#64748b', borderColor: '#1e2030', background: 'transparent' }
              }
            >
              {g.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
