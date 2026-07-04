import { PERSONALITIES, SESSION_MODES } from '@ai-dj/shared';
import { djBrain } from '@/dj/DJBrain';
import { useDJStore } from '@/state/store';

export function ModeSelector() {
  const mode = useDJStore((s) => s.mode);
  const personality = useDJStore((s) => s.personality);
  const set = useDJStore((s) => s.set);

  const activePersonality = PERSONALITIES.find((p) => p.id === personality);
  const activeMode = SESSION_MODES.find((m) => m.id === mode);

  return (
    <section className="panel p-4 flex flex-col gap-4">
      <div>
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Modo de sesión</h3>
        <div className="grid grid-cols-5 gap-1.5">
          {SESSION_MODES.map((m) => (
            <button
              key={m.id}
              title={m.description}
              onClick={() => {
                set({ mode: m.id });
                djBrain.onModeChanged();
              }}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 border text-[9px] transition-all ${
                mode === m.id
                  ? 'border-neon-amber/70 bg-neon-amber/10 text-neon-amber shadow-[0_0_10px_rgba(251,191,36,0.25)]'
                  : 'border-line bg-panel-2/50 text-slate-500 hover:border-slate-600'
              }`}
            >
              <span className="text-base leading-none">{m.icon}</span>
              {m.label.replace('Modo ', '')}
            </button>
          ))}
        </div>
        {activeMode && <p className="text-[11px] text-slate-500 mt-2 italic">{activeMode.description}</p>}
      </div>

      <div>
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Personalidad del DJ</h3>
        <div className="flex flex-wrap gap-1.5">
          {PERSONALITIES.map((p) => (
            <button
              key={p.id}
              title={p.description}
              onClick={() => {
                set({ personality: p.id });
                djBrain.replan();
              }}
              className="chip"
              style={
                personality === p.id
                  ? { color: p.color, borderColor: `${p.color}88`, background: `${p.color}16`, boxShadow: `0 0 10px ${p.color}33` }
                  : { color: '#64748b', borderColor: '#1e2030' }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        {activePersonality && (
          <p className="text-[11px] text-slate-500 mt-2 italic">{activePersonality.description}</p>
        )}
      </div>
    </section>
  );
}
