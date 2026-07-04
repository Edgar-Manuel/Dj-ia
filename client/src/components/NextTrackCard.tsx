import { AnimatePresence, motion } from 'framer-motion';
import { TRANSITION_MAP, keyName } from '@ai-dj/shared';
import { useDJStore } from '@/state/store';

/** The AI's next pick: track, planned transition and its reasoning. */
export function NextTrackCard() {
  const nextUp = useDJStore((s) => s.nextUp);
  const reason = useDJStore((s) => s.lastTransitionReason);

  return (
    <div className="flex flex-col gap-2 min-h-[7rem]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">A continuación · IA</span>
        {nextUp && (
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
            nextUp.ready
              ? 'text-neon-lime border-neon-lime/50 bg-neon-lime/10'
              : 'text-amber-400 border-amber-400/40 bg-amber-400/10 animate-pulse'
          }`}>
            {nextUp.ready ? 'PREPARADO' : 'ANALIZANDO…'}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {nextUp ? (
          <motion.div
            key={nextUp.track.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="bg-panel-2 border border-line rounded-xl p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-display font-semibold text-slate-100 truncate">{nextUp.track.title}</h4>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                {nextUp.track.bpm} BPM · {nextUp.track.key} {keyName(nextUp.track.key)}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">{nextUp.track.artist}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neon-magenta/10 text-neon-magenta border border-neon-magenta/40">
                {TRANSITION_MAP.get(nextUp.transition.type)?.label} · {nextUp.transition.beats} beats
              </span>
              <span className="text-[9px] text-slate-500 uppercase">motor: {nextUp.engine}</span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-panel-2/50 border border-dashed border-line rounded-xl p-3 text-xs text-slate-500 text-center"
          >
            La IA elegirá el siguiente tema cuando arranque el set.
          </motion.div>
        )}
      </AnimatePresence>

      {reason && (
        <p className="text-[11px] leading-relaxed text-slate-500 italic px-1">🎧 {reason}</p>
      )}
    </div>
  );
}
