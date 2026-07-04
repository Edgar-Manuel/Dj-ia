import { AnimatePresence, motion } from 'framer-motion';
import { ENERGY_STATE_MAP, TRANSITION_MAP, genreLabel } from '@ai-dj/shared';
import { useDJStore } from '@/state/store';

export function HistoryList() {
  const history = useDJStore((s) => s.history);
  const items = [...history].reverse();

  return (
    <section className="panel p-4 flex flex-col gap-3 max-h-96">
      <header className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Historial del set</h3>
        <span className="text-xs font-mono text-slate-500">{history.length} temas</span>
      </header>
      <div className="overflow-y-auto flex flex-col gap-1.5 pr-1">
        <AnimatePresence initial={false}>
          {items.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-6">Todavía no ha sonado nada.</p>
          )}
          {items.map((entry, i) => {
            const state = ENERGY_STATE_MAP.get(entry.energyState);
            return (
              <motion.div
                key={`${entry.trackId}-${entry.startedAt}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 border ${
                  i === 0 ? 'bg-panel-2 border-neon-cyan/30' : 'bg-panel-2/50 border-line/50'
                }`}
              >
                <span
                  className="w-1.5 h-8 rounded-full shrink-0"
                  style={{ background: state?.color ?? '#334155' }}
                  title={state?.label}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200 truncate">
                    {entry.title} <span className="text-slate-500">· {entry.artist}</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {entry.bpm} BPM · {entry.key} · {genreLabel(entry.genre)}
                    {entry.transition ? ` · ${TRANSITION_MAP.get(entry.transition)?.label}` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-slate-600 shrink-0">
                  {new Date(entry.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
