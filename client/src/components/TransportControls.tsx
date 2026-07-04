import { motion } from 'framer-motion';
import { djBrain } from '@/dj/DJBrain';
import { useDJStore } from '@/state/store';

export function TransportControls() {
  const status = useDJStore((s) => s.status);
  const autoMode = useDJStore((s) => s.autoMode);
  const energyBias = useDJStore((s) => s.energyBias);
  const setDurationMin = useDJStore((s) => s.setDurationMin);
  const transitioning = useDJStore((s) => s.transitioning);
  const set = useDJStore((s) => s.set);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-3">
        <ControlButton
          label="Stop"
          onClick={() => djBrain.stop()}
          disabled={status === 'idle'}
        >
          <rect x="7" y="7" width="10" height="10" rx="1.5" />
        </ControlButton>

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => (status === 'playing' ? djBrain.pause() : void djBrain.start())}
          className="w-16 h-16 rounded-full grid place-items-center bg-gradient-to-br from-neon-cyan to-sky-500 text-void shadow-neon-cyan"
          aria-label={status === 'playing' ? 'Pausa' : 'Play'}
        >
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current">
            {status === 'playing' ? (
              <>
                <rect x="7" y="6" width="3.5" height="12" rx="1" />
                <rect x="13.5" y="6" width="3.5" height="12" rx="1" />
              </>
            ) : (
              <path d="M8 5.5v13l11-6.5z" />
            )}
          </svg>
        </motion.button>

        <ControlButton
          label="Skip"
          onClick={() => void djBrain.skip()}
          disabled={status !== 'playing' || transitioning}
        >
          <path d="M6 6v12l8-6zM15 6h3v12h-3z" />
        </ControlButton>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500">
          Energía manual {energyBias > 0 ? `+${Math.round(energyBias * 100)}` : Math.round(energyBias * 100)}%
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={energyBias}
            onChange={(e) => set({ energyBias: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500">
          Duración del set
          <select
            value={setDurationMin}
            onChange={(e) => {
              set({ setDurationMin: Number(e.target.value) });
              djBrain.onModeChanged();
            }}
            className="bg-panel-2 border border-line rounded-lg px-2 py-1.5 text-xs text-slate-200"
          >
            <option value={30}>30 min</option>
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
            <option value={240}>4 horas</option>
            <option value={0}>∞ Sin límite</option>
          </select>
        </label>
      </div>

      <button
        onClick={() => set({ autoMode: !autoMode })}
        className={`chip text-center justify-center flex items-center gap-2 py-2 ${
          autoMode
            ? 'bg-neon-cyan/10 border-neon-cyan/60 text-neon-cyan shadow-neon-cyan'
            : 'bg-panel-2 border-line text-slate-400'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${autoMode ? 'bg-neon-cyan animate-pulse' : 'bg-slate-600'}`} />
        {autoMode ? 'PILOTO AUTOMÁTICO IA ACTIVO' : 'MODO MANUAL'}
      </button>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-11 h-11 rounded-full grid place-items-center bg-panel-2 border border-line text-slate-300 disabled:opacity-30 hover:border-slate-500 transition-colors"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">{children}</svg>
    </motion.button>
  );
}
