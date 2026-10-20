'use client';

/**
 * Scales a fixed-size product mockup (designed at, say, 1152 px) down to its container, keeping the
 * layout box the scaled size so nothing below jumps. `overhang` lets floating parts of the mockup hang
 * past its left and right edges: the whole composite (mockup plus overhangs) is fitted into the
 * container plus whatever room the viewport leaves beside it, and centered there.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? () => {} : useLayoutEffect;

export function ScaleToFit({
  width,
  height,
  overhang = [0, 0],
  children,
  className,
}: {
  /** Design size of the mockup, in px. */
  width: number;
  height: number;
  /** How far the mockup's floating parts reach past its left and right edges, in design px. */
  overhang?: [number, number];
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ s: 1, x: 0 });
  const [o0, o1] = overhang;

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth;
      // Room between the container and the viewport edge on each side, less an 8 px margin.
      const side = Math.max(0, (document.documentElement.clientWidth - avail) / 2 - 8);
      const total = width + o0 + o1;
      const s = Math.min(1, (avail + 2 * side) / total);
      const x = -side + (avail + 2 * side - total * s) / 2 + o0 * s;
      setFit((f) => (Math.abs(f.s - s) < 0.001 && Math.abs(f.x - x) < 0.5 ? f : { s, x }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [width, o0, o1]);

  return (
    <div ref={ref} className={className} style={{ position: 'relative', height: Math.round(height * fit.s) }}>
      <div
        style={{
          position: 'absolute',
          left: fit.x,
          top: 0,
          width,
          height,
          transform: `scale(${fit.s})`,
          transformOrigin: 'left top',
        }}
      >
        {children}
      </div>
    </div>
  );
}
