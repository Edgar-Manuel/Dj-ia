import { useRef } from 'react';
import { djBrain } from '@/dj/DJBrain';
import { useDJStore } from '@/state/store';
import { useAnimationFrame } from '@/lib/hooks';
import { ENERGY_STATE_MAP } from '@ai-dj/shared';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: number;
  size: number;
}

/**
 * Real-time master visualizer: log-spaced spectrum bars, mirrored waveform
 * glow, and beat-synced particles. Runs on a single canvas at 60 FPS.
 */
export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const lastBeat = useRef(1);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const engine = djBrain.engine;
    const state = useDJStore.getState();
    const stateColor = ENERGY_STATE_MAP.get(state.energyState)?.color ?? '#22d3ee';

    if (!engine || state.status === 'idle') {
      drawIdle(ctx, w, h);
      return;
    }

    const spectrum = engine.spectrum(96);
    const activeDeck = engine.deck(state.activeDeck);
    const beat = activeDeck.beatPhase();
    const bass = (spectrum[1] + spectrum[2] + spectrum[3]) / 3;

    // ── Spectrum bars ──
    const bins = spectrum.length;
    const barW = w / bins;
    for (let i = 0; i < bins; i++) {
      const v = spectrum[i];
      const bh = v * h * 0.85;
      const hue = 190 + (i / bins) * 120; // cyan → magenta
      ctx.fillStyle = `hsla(${hue}, 90%, ${45 + v * 25}%, ${0.25 + v * 0.75})`;
      ctx.fillRect(i * barW, h - bh, Math.max(1, barW * 0.65), bh);
      // mirror glow
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${v * 0.12})`;
      ctx.fillRect(i * barW, h - bh - 6, Math.max(1, barW * 0.65), 3);
    }

    // ── Beat flash + particle burst ──
    if (beat < lastBeat.current && activeDeck.playing) {
      const count = 6 + Math.floor(bass * 20);
      for (let i = 0; i < count; i++) {
        particles.current.push({
          x: w / 2 + (Math.random() - 0.5) * w * 0.5,
          y: h * 0.55,
          vx: (Math.random() - 0.5) * 3,
          vy: -1.5 - Math.random() * 3 * (0.5 + bass),
          life: 1,
          hue: 190 + Math.random() * 120,
          size: 1 + Math.random() * 2.5,
        });
      }
      ctx.fillStyle = `${stateColor}14`;
      ctx.fillRect(0, 0, w, h);
    }
    lastBeat.current = beat;

    // ── Particles ──
    particles.current = particles.current.filter((p) => p.life > 0);
    if (particles.current.length > 400) particles.current.splice(0, particles.current.length - 400);
    for (const p of particles.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.02;
      p.life -= 0.012;
      if (p.life <= 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.01, p.size * p.life), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${p.life * 0.8})`;
      ctx.shadowColor = `hsla(${p.hue}, 95%, 65%, ${p.life})`;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ── Bass halo ──
    const grad = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.4 * (0.4 + bass));
    grad.addColorStop(0, `${stateColor}1f`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  return (
    <div className="panel overflow-hidden relative h-28 md:h-36">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-2 left-3 text-[9px] uppercase tracking-[0.3em] text-slate-600 font-mono">
        Master Spectrum
      </div>
    </div>
  );
}

function drawIdle(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const t = performance.now() / 1000;
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const y = h / 2 + Math.sin(x * 0.02 + t * 1.4) * 8 * Math.sin(t * 0.7 + x * 0.005);
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}
