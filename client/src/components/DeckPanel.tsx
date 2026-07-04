import { useState } from 'react';
import { motion } from 'framer-motion';
import { GENRE_MAP, keyName } from '@ai-dj/shared';
import type { DeckId } from '@/audio/Deck';
import { djBrain } from '@/dj/DJBrain';
import { useDJStore } from '@/state/store';
import { useAnimationFrame, formatTime } from '@/lib/hooks';
import { Waveform } from './Waveform';

const COLORS: Record<DeckId, string> = { A: '#22d3ee', B: '#e879f9' };

export function DeckPanel({ deckId }: { deckId: DeckId }) {
  const track = useDJStore((s) => s.deckTracks[deckId]);
  const activeDeck = useDJStore((s) => s.activeDeck);
  const status = useDJStore((s) => s.status);
  const [time, setTime] = useState({ pos: 0, remain: 0, level: 0, beat: 0 });

  const isActive = activeDeck === deckId && status !== 'idle';
  const color = COLORS[deckId];

  useAnimationFrame(() => {
    const deck = djBrain.engine?.deck(deckId);
    if (!deck) return;
    setTime({
      pos: deck.position(),
      remain: deck.remaining(),
      level: deck.playing ? deck.level() : 0,
      beat: deck.beatPhase(),
    });
  });

  const genre = track ? GENRE_MAP.get(track.genre) : null;
  const beatPulse = isActive && time.beat < 0.18;

  return (
    <motion.section
      layout
      className="panel p-4 flex flex-col gap-3 relative overflow-hidden"
      style={{
        borderColor: isActive ? color : undefined,
        boxShadow: isActive ? `0 0 24px ${color}22, inset 0 0 40px ${color}08` : undefined,
      }}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-lg grid place-items-center font-bold font-mono text-sm transition-all"
            style={{
              background: `${color}18`,
              color,
              boxShadow: beatPulse ? `0 0 14px ${color}` : 'none',
            }}
          >
            {deckId}
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            {isActive ? 'En directo' : track ? 'Preparado' : 'Vacío'}
          </span>
        </div>
        {isActive && (
          <motion.span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: color }}
            animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
            transition={{ duration: 60 / (track?.bpm ?? 120), repeat: Infinity }}
          />
        )}
      </header>

      <div className="min-h-[3.2rem]">
        <h3 className="font-display font-semibold text-lg leading-tight truncate text-slate-100">
          {track?.title ?? '—'}
        </h3>
        <p className="text-sm text-slate-400 truncate">{track?.artist ?? 'Sin pista cargada'}</p>
      </div>

      <Waveform deckId={deckId} color={color} />

      <div className="grid grid-cols-4 gap-2 text-center font-mono">
        <Stat label="BPM" value={track ? String(track.bpm) : '--'} color={color} />
        <Stat label="KEY" value={track ? `${track.key}` : '--'} sub={track ? keyName(track.key) : ''} color={color} />
        <Stat label="POS" value={formatTime(time.pos)} color={color} />
        <Stat label="REST" value={`-${formatTime(time.remain)}`} color={color} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 w-10">
          {genre?.label ?? ''}
        </span>
        <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{ width: `${time.level * 100}%`, background: `linear-gradient(90deg, ${color}, #fff)` }}
          />
        </div>
      </div>
    </motion.section>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-panel-2 rounded-xl py-2 px-1 border border-line/60">
      <div className="text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-sm font-semibold" style={{ color }}>{value}</div>
      {sub ? <div className="text-[9px] text-slate-500 truncate">{sub}</div> : null}
    </div>
  );
}
