'use client';

/**
 * A quiet "you are here" for the long home page: a frosted pill floating at the bottom center that
 * names the section on screen, in the muted body color, with a thin ring for how far through the page
 * you are. It appears once the hero is behind you and steps aside when the final call to action
 * arrives. Clicking it opens the list of sections to jump to, headed by a way back to the top.
 *
 * The section on screen is the last one whose top has passed 40% of the viewport. Names change with a
 * short roll in the direction you scrolled; the pill's width follows the name. Reduced motion makes
 * both instant (the global rule in marketing-v2.css).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowUp, ChevronUp } from 'lucide-react';
import './section-indicator.css';

/** In page order. Each id is the section's own (`Band id`), so the list doubles as anchor links. */
const SECTIONS = [
  { id: 'brio', label: 'Meet Brio' },
  { id: 'product', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'drive', label: 'Built on your Drive' },
  { id: 'who-its-for', label: 'Who it’s for' },
  { id: 'see-it', label: 'See it for yourself' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
] as const;

/** The final call to action: the pill gives way to it. */
const END_ID = 'get-started';
/** The pill hides once the end section's top rises above this share of the viewport. */
const END_LINE = 0.8;
/** A section counts as "on screen" once its top passes this share of the viewport. */
const READ_LINE = 0.4;

const RING_R = 8;
const RING_C = 2 * Math.PI * RING_R;

const pad = (n: number) => String(n).padStart(2, '0');

export function SectionIndicator() {
  const [active, setActive] = useState(-1);
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<'up' | 'down'>('down');
  const [width, setWidth] = useState<number | undefined>(undefined);
  const activeRef = useRef(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id));
    const end = document.getElementById(END_ID);
    let raf = 0;

    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const line = vh * READ_LINE;
      let idx = -1;
      els.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) idx = i;
      });
      const firstTop = els[0]?.getBoundingClientRect().top ?? Infinity;
      const endTop = end?.getBoundingClientRect().top ?? Infinity;

      if (idx !== activeRef.current) {
        setDir(idx > activeRef.current ? 'down' : 'up');
        activeRef.current = idx;
        setActive(idx);
      }
      setShown(idx >= 0 && endTop > vh * END_LINE);

      // 0 when the first section reaches the read line, 1 when the pill gives way to the end. Written
      // straight to the ring so scrolling doesn't re-render the component every frame.
      const span = endTop - firstTop - vh * END_LINE + line;
      const progress = span > 0 ? Math.min(1, Math.max(0, (line - firstTop) / span)) : 0;
      ringRef.current?.setAttribute('stroke-dashoffset', String(RING_C * (1 - progress)));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // The pill's width follows the name, so a short one doesn't sit in a long one's space.
  useLayoutEffect(() => {
    if (labelRef.current) setWidth(labelRef.current.offsetWidth);
  }, [active]);

  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const jump = useCallback((e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Sections carry a scroll margin, so they land just below the fixed header.
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    setOpen(false);
  }, []);

  const toTop = useCallback(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setOpen(false);
  }, []);

  const current = active >= 0 ? SECTIONS[active] : null;

  return (
    <div ref={rootRef} className={`mk-secnav${shown ? ' is-shown' : ''}${open ? ' is-open' : ''}`} inert={!shown}>
      <nav id="mk-secnav-menu" aria-label="Sections on this page" className="mk-secnav-menu" inert={!open}>
        {/* Unnumbered and set apart, so it doesn't read as a section. */}
        <button type="button" className="mk-secnav-item mk-secnav-top" onClick={toTop}>
          <ArrowUp className="mk-secnav-item-num" size={14} strokeWidth={2.4} aria-hidden />
          Back to top
        </button>
        <ol>
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="mk-secnav-item"
                aria-current={i === active ? 'location' : undefined}
                onClick={(e) => jump(e, s.id)}
              >
                <span className="mk-secnav-item-num">{pad(i + 1)}</span>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <button
        type="button"
        className="mk-secnav-pill"
        aria-expanded={open}
        aria-controls="mk-secnav-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="mk-secnav-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r={RING_R} className="mk-secnav-ring-track" />
          <circle
            ref={ringRef}
            cx="10"
            cy="10"
            r={RING_R}
            className="mk-secnav-ring-fill"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C}
          />
        </svg>
        <span className="mk-secnav-num" aria-hidden="true">
          {current ? pad(active + 1) : ''}
        </span>
        <span className="sr-only">Section: </span>
        <span className="mk-secnav-label-box" style={{ width }}>
          <span key={current?.id ?? 'none'} ref={labelRef} className="mk-secnav-label" data-dir={dir}>
            {current?.label ?? ''}
          </span>
        </span>
        <ChevronUp className="mk-secnav-chevron" size={15} strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}
