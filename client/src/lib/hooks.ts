import { useEffect, useRef } from 'react';

/** Run a callback on every animation frame (60 FPS UI updates). */
export function useAnimationFrame(callback: (time: number) => void): void {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      ref.current(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
