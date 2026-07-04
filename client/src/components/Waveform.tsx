import { useRef } from 'react';
import { djBrain } from '@/dj/DJBrain';
import { useAnimationFrame } from '@/lib/hooks';
import type { DeckId } from '@/audio/Deck';

/** Canvas waveform with playhead, section shading and neon progress. */
export function Waveform({ deckId, color }: { deckId: DeckId; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    const deck = djBrain.engine?.deck(deckId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const peaks = deck?.peaks;
    const track = deck?.track;
    if (!peaks || !track) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    const progress = deck.position() / track.duration;
    const bins = peaks.length;
    const barW = w / bins;

    for (let i = 0; i < bins; i++) {
      const amp = Math.max(0.02, peaks[i]) * (h / 2) * 0.92;
      const x = i * barW;
      const played = i / bins <= progress;
      ctx.fillStyle = played ? color : 'rgba(148, 163, 184, 0.22)';
      ctx.fillRect(x, h / 2 - amp, Math.max(1, barW * 0.7), amp * 2);
    }

    // Playhead
    const px = progress * w;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(px, 2);
    ctx.lineTo(px, h - 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  return <canvas ref={canvasRef} className="w-full h-16 md:h-20" />;
}
