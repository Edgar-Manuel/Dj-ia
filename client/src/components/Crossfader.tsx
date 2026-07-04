import { useState } from 'react';
import { djBrain } from '@/dj/DJBrain';
import { useDJStore } from '@/state/store';
import { useAnimationFrame } from '@/lib/hooks';

/**
 * Animated crossfader. In auto mode it mirrors the engine's automation in
 * real time; in manual mode it becomes a draggable control.
 */
export function Crossfader() {
  const autoMode = useDJStore((s) => s.autoMode);
  const [pos, setPos] = useState(0);

  useAnimationFrame(() => {
    if (djBrain.engine) setPos(djBrain.engine.crossfade);
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[10px] font-mono text-slate-500">
        <span className="text-neon-cyan">DECK A</span>
        <span className="uppercase tracking-widest">Crossfader {autoMode ? '· auto' : '· manual'}</span>
        <span className="text-neon-magenta">DECK B</span>
      </div>
      <div className="relative h-9 bg-panel-2 border border-line rounded-xl px-2 flex items-center">
        <div className="relative flex-1 h-1.5 rounded-full bg-gradient-to-r from-neon-cyan/60 via-slate-700 to-neon-magenta/60">
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-6 rounded-md bg-slate-200 border border-white/70 transition-none"
            style={{
              left: `${pos * 100}%`,
              boxShadow: `0 0 14px ${pos < 0.5 ? 'rgba(34,211,238,0.8)' : 'rgba(232,121,249,0.8)'}`,
            }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={pos}
          disabled={autoMode}
          onChange={(e) => djBrain.engine?.setCrossfade(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-default"
          aria-label="Crossfader"
        />
      </div>
    </div>
  );
}
