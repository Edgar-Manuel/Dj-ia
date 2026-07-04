import { motion } from 'framer-motion';
import { ENERGY_STATE_MAP, ENERGY_STATES } from '@ai-dj/shared';
import { useDJStore } from '@/state/store';

/** Current narrative state + live target energy of the set. */
export function EnergyMeter() {
  const energyState = useDJStore((s) => s.energyState);
  const targetEnergy = useDJStore((s) => s.targetEnergy);
  const def = ENERGY_STATE_MAP.get(energyState)!;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Nivel de energía</span>
        <motion.span
          key={energyState}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs font-semibold px-2.5 py-1 rounded-full border"
          style={{ color: def.color, borderColor: `${def.color}66`, background: `${def.color}14` }}
        >
          {def.label}
        </motion.span>
      </div>

      <div className="relative h-3 rounded-full bg-panel-2 border border-line overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          animate={{ width: `${targetEnergy * 100}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 20 }}
          style={{
            background: `linear-gradient(90deg, #22d3ee, ${def.color})`,
            boxShadow: `0 0 12px ${def.color}88`,
          }}
        />
      </div>

      <div className="flex gap-1">
        {ENERGY_STATES.filter((s) => s.id !== 'cooldown' && s.id !== 'rising').map((s) => (
          <div
            key={s.id}
            title={s.label}
            className="flex-1 h-1 rounded-full transition-all duration-500"
            style={{
              background: s.id === energyState ? s.color : '#1e2030',
              boxShadow: s.id === energyState ? `0 0 8px ${s.color}` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}
