'use client';

/**
 * The marketing card motion kit (after Stripe's bento), on GPU layers only.
 *
 * - `useInViewOnce`: an element's first scroll-in, as a timestamp, so a scene can play its story once.
 * - `useStoryClock`: elapsed ms since that moment, re-rendering only while a story is still playing.
 * - `MkCard`: hover rim and spotlight that chase the cursor (pre-rendered blobs moved by transform),
 *   the touch press, and `data-revealed` for CSS reveals.
 * - `Odometer`: a fixed-height window over a stack of values, so a state change is a roll.
 *
 * With reduced motion every scene reports "finished" at once and shows its final state.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

/** Timestamp (performance.now) of the element's first scroll-in, or null before it. */
export function useInViewOnce<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || at !== null) return;
    if (typeof IntersectionObserver === 'undefined') {
      setAt(performance.now());
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setAt(performance.now());
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [at, threshold]);
  return [ref, at] as const;
}

/** True while the element is on screen (for pausing loops off-screen). */
export function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on] as const;
}

export const STORY_DONE = 1e9;

/**
 * Milliseconds since `startedAt`: -1 before it, STORY_DONE with reduced motion.
 * Ticks every `step` ms until `until`, then (unless `loop`) stops re-rendering.
 */
export function useStoryClock(startedAt: number | null, until: number, { step = 100, loop = false, paused = false } = {}) {
  const reduce = usePrefersReducedMotion();
  const [, force] = useState(0);
  useEffect(() => {
    if (reduce || startedAt === null || paused) return;
    let id = 0;
    const tick = () => {
      force((n) => n + 1);
      if (loop || performance.now() - startedAt < until) id = window.setTimeout(tick, step);
    };
    id = window.setTimeout(tick, step);
    return () => window.clearTimeout(id);
  }, [reduce, startedAt, until, step, loop, paused]);
  if (reduce) return STORY_DONE;
  if (startedAt === null) return -1;
  return performance.now() - startedAt;
}

/** Moves the card's pre-rendered glow blobs under the pointer; the CSS transition eases them after it. */
function placeGlow(card: HTMLElement, clientX: number, clientY: number, jump: boolean) {
  const r = card.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  card.querySelectorAll<HTMLElement>('.mk-card-blob').forEach((b) => {
    const h = b.offsetWidth / 2;
    if (jump) b.style.transition = 'none';
    b.style.transform = `translate3d(${x - h}px, ${y - h}px, 0)`;
    if (jump) {
      b.getBoundingClientRect();
      b.style.transition = '';
    }
  });
}

const RevealContext = createContext<{ at: number | null }>({ at: null });
/** The enclosing MkCard's first scroll-in time, for scenes inside it. */
export const useCardReveal = () => useContext(RevealContext).at;

export function MkCard({
  as: Tag = 'div',
  className = '',
  style,
  children,
  glow = true,
  spotSize,
  rimSize,
  threshold = 0.3,
  ...rest
}: {
  as?: 'div' | 'a' | 'article' | 'li';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  glow?: boolean;
  spotSize?: number;
  rimSize?: number;
  threshold?: number;
  href?: string;
  'aria-label'?: string;
}) {
  const [ref, at] = useInViewOnce<HTMLElement>(threshold);
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => placeGlow(e.currentTarget, e.clientX, e.clientY, false), []);
  const onMouseEnter = useCallback((e: React.MouseEvent<HTMLElement>) => placeGlow(e.currentTarget, e.clientX, e.clientY, true), []);
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return;
    placeGlow(e.currentTarget, e.clientX, e.clientY, true);
    e.currentTarget.setAttribute('data-touch', '');
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' && e.currentTarget.hasAttribute('data-touch')) placeGlow(e.currentTarget, e.clientX, e.clientY, false);
  }, []);
  // A scroll that starts on the card cancels the press (pointercancel).
  const release = useCallback((e: React.PointerEvent<HTMLElement>) => e.currentTarget.removeAttribute('data-touch'), []);
  const Comp = Tag as 'div';
  return (
    <RevealContext.Provider value={{ at }}>
      <Comp
        ref={ref as React.Ref<HTMLDivElement>}
        className={`mk-card ${className}`}
        style={style}
        data-revealed={at !== null ? '' : undefined}
        onMouseMove={glow ? onMouseMove : undefined}
        onMouseEnter={glow ? onMouseEnter : undefined}
        onPointerDown={glow ? onPointerDown : undefined}
        onPointerMove={glow ? onPointerMove : undefined}
        onPointerUp={glow ? release : undefined}
        onPointerCancel={glow ? release : undefined}
        onPointerLeave={glow ? release : undefined}
        {...rest}
      >
        {glow && (
          <span aria-hidden="true" className="mk-card-glow mk-card-glow--spot">
            <span className="mk-card-blob" style={spotSize ? { width: spotSize, height: spotSize } : undefined} />
          </span>
        )}
        {children}
        {glow && (
          <span aria-hidden="true" className="mk-card-glow mk-card-glow--rim">
            <span className="mk-card-blob" style={rimSize ? { width: rimSize, height: rimSize } : undefined} />
          </span>
        )}
      </Comp>
    </RevealContext.Provider>
  );
}

/**
 * Odometer slot. `values` are rolled through by `index`; the first value is repeated at the end so a
 * loop can wrap without a visible jump (roll to `values.length`, then snap to 0 with `animate={false}`).
 * `looks` gives each value its own style (e.g. a chip's color), so a state change is a roll.
 */
export function Odometer({
  values,
  index,
  lineHeight,
  animate = true,
  delay = 0,
  duration = 900,
  className,
  style,
  looks,
}: {
  values: ReactNode[];
  index: number;
  lineHeight: number;
  animate?: boolean;
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
  looks?: CSSProperties[];
}) {
  const stack = [...values, values[0]];
  const styles = looks ? [...looks, looks[0]] : undefined;
  return (
    <span className={`mk-odo ${className ?? ''}`} style={{ height: lineHeight, ...style }}>
      <span
        style={{
          transform: `translate3d(0, ${-index * lineHeight}px, 0)`,
          transition: animate ? `transform ${duration}ms var(--mk-roll) ${delay}ms` : 'none',
        }}
      >
        {stack.map((v, i) => (
          <span key={i} style={{ height: lineHeight, lineHeight: `${lineHeight}px`, ...(styles?.[i] ?? {}) }} aria-hidden={i !== index || undefined}>
            {v}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Re-exported for client scenes; server components import it from `primitives` directly. */
export { revealDelay } from './primitives';
