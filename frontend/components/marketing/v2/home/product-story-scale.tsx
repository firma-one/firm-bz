'use client';

/**
 * Fits a fixed-width product mockup (the How it works Board and Firm Overview, designed at least `min`
 * px wide) to its container. At or above `min` the mockup simply fills the container, as on the 1440 px
 * board; below it the mockup keeps `min` px of layout, is scaled down with a transform, and the wrapper
 * takes the scaled height so the stage never leaves a gap or overflows.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function StoryScale({ min, children }: { min: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ s: 1, h: 0 });

  useIsoLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const w = outer.clientWidth;
      // 0 while hidden (the desktop showcase is display: none on phones).
      if (!w) return;
      const s = Math.min(1, w / min);
      const h = inner.offsetHeight;
      setFit((f) => (Math.abs(f.s - s) < 0.001 && Math.abs(f.h - h) < 0.5 ? f : { s, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [min]);

  const scaled = fit.s < 1;
  return (
    <div ref={outerRef} style={scaled ? { height: Math.ceil(fit.h * fit.s) } : undefined}>
      <div ref={innerRef} style={scaled ? { width: min, transform: `scale(${fit.s})`, transformOrigin: '0 0' } : undefined}>
        {children}
      </div>
    </div>
  );
}
