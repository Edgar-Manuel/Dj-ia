import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DJSession } from '@ai-dj/shared';
import { djBrain } from '@/dj/DJBrain';
import { api } from '@/lib/api';
import { useDJStore } from '@/state/store';

export function Header() {
  const sessionName = useDJStore((s) => s.sessionName);
  const serverEngine = useDJStore((s) => s.serverEngine);
  const useServerAI = useDJStore((s) => s.useServerAI);
  const set = useDJStore((s) => s.set);
  const [sessions, setSessions] = useState<DJSession[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (menuOpen) void api.listSessions().then((list) => setSessions(list ?? []));
  }, [menuOpen]);

  async function handleSave() {
    const result = await api.saveSession(djBrain.sessionSnapshot());
    if (result) {
      set({ sessionId: result.id });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } else {
      // Offline fallback: persist in the browser.
      localStorage.setItem('ai-dj-session', JSON.stringify(djBrain.sessionSnapshot()));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  }

  return (
    <header className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan via-sky-500 to-neon-magenta grid place-items-center text-xl shadow-neon-cyan">
          🎧
        </div>
        <div>
          <h1 className="font-display font-bold text-xl tracking-tight leading-none">
            AI<span className="text-neon-cyan neon-text-cyan">DJ</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
            Autonomous Mixing Intelligence
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={sessionName}
          onChange={(e) => set({ sessionName: e.target.value })}
          className="bg-panel-2 border border-line rounded-lg px-3 py-1.5 text-xs text-slate-300 w-44 outline-none focus:border-neon-cyan/50"
          aria-label="Nombre de la sesión"
        />

        <button onClick={() => void handleSave()} className="chip border-line text-slate-300 bg-panel-2 hover:border-neon-cyan/50">
          {saved ? '✓ Guardada' : 'Guardar sesión'}
        </button>

        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="chip border-line text-slate-300 bg-panel-2 hover:border-neon-cyan/50">
            Cargar ▾
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute right-0 top-full mt-2 w-64 panel p-2 z-50 flex flex-col gap-1 max-h-72 overflow-y-auto"
              >
                {sessions.length === 0 && (
                  <p className="text-xs text-slate-500 p-2 text-center">Sin sesiones guardadas.</p>
                )}
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      djBrain.loadSession(s);
                      setMenuOpen(false);
                    }}
                    className="text-left rounded-lg px-3 py-2 hover:bg-panel-2 text-xs text-slate-300"
                  >
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="text-[10px] text-slate-500">
                      {s.history.length} temas · {new Date(s.updatedAt).toLocaleDateString('es-ES')}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={() => set({ useServerAI: !useServerAI })}
          title="Alternar entre el cerebro local y el motor de IA del servidor (Claude si hay API key)"
          className={`chip ${
            useServerAI && serverEngine
              ? 'border-neon-magenta/60 text-neon-magenta bg-neon-magenta/10 shadow-neon-magenta'
              : 'border-line text-slate-400 bg-panel-2'
          }`}
        >
          {useServerAI && serverEngine ? `IA: ${serverEngine}` : 'IA: local'}
        </button>
      </div>
    </header>
  );
}
