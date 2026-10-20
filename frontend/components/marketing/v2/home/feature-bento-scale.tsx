'use client';

/**
 * Scales a fixed-width product scene down to its panel. The scene keeps its design pixels and fills
 * the panel absolutely; below `width` it shrinks with `transform: scale()` (its height is stretched by
 * 1/scale so it still covers the panel). Above `width` a fixed scene centers in the extra room, and a
 * `grow` scene widens instead (its right-anchored parts follow the edge).
 *
 * Only the scale needs JavaScript; centering and growing are CSS, so the server render is already
 * laid out correctly at full size.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function ScaleToFit({
  width,
  grow = false,
  className,
  children,
}: {
  /** Design width of the scene in px. */
  width: number;
  /** Widen past `width` instead of centering. */
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      // Hidden (display: none at this breakpoint): keep the last scale.
      if (w <= 0) return;
      const next = Math.min(1, Math.round((w / width) * 1000) / 1000);
      setScale((s) => (s === next ? s : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const scaled = scale < 1;
  return (
    <div ref={ref} className={className} style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: grow ? 0 : `max(0px, calc((100% - ${width}px) / 2))`,
          width: grow ? `max(100%, ${width}px)` : width,
          height: scaled ? `${100 / scale}%` : '100%',
          transform: scaled ? `scale(${scale})` : undefined,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
}
