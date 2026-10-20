'use client';

/**
 * How it works on desktop and tablet: four ARIA tabs over one pastel stage.
 *
 * - The active tab's bar fills over 6 s as a CSS animation (nothing re-renders while it runs); when it
 *   ends, the showcase advances. Clicking a tab jumps to it and restarts its bar.
 * - The bar pauses while the pointer is over the stage, while keyboard focus is inside the showcase,
 *   and while the section is off screen. Under reduced motion nothing advances: tab 01 shows with a
 *   full bar and the reader picks the rest.
 * - All four panels share one grid cell, so the stage keeps the tallest panel's height and switching
 *   never moves the page. The outgoing panel plays mkTabOut (380 ms); after a 120 ms beat the incoming
 *   one plays mkTabIn (750 ms).
 */
import { useCallback, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useOnScreen, usePrefersReducedMotion } from '../motion';

export type StoryStep = { num: string; label: string; title: string };

const TAB_IN = 'mkTabIn 750ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both';
const TAB_OUT = 'mkTabOut 380ms cubic-bezier(0.4, 0, 1, 1) both';

/** Read at the moment of use, so a fill that ends during the first render can never cycle the tabs. */
const reducedNow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const isKeyboardFocus = (el: Element) => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
};

export function StoryTabs({ steps, panels }: { steps: StoryStep[]; panels: ReactNode[] }) {
  const n = steps.length;
  const uid = useId();
  const reduce = usePrefersReducedMotion();
  const [rootRef, onScreen] = useOnScreen<HTMLDivElement>();
  const [view, setView] = useState({ tab: 0, prev: -1, sw: 0 });
  const [hovered, setHovered] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { tab, prev, sw } = view;

  const go = useCallback((i: number) => setView((v) => (v.tab === i ? v : { tab: i, prev: v.tab, sw: v.sw + 1 })), []);
  const advance = useCallback(() => setView((v) => ({ tab: (v.tab + 1) % n, prev: v.tab, sw: v.sw + 1 })), [n]);

  const running = !reduce && onScreen && !hovered && !keyboard;
  const tabId = (i: number) => `${uid}-tab-${i}`;
  const panelId = (i: number) => `${uid}-panel-${i}`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const focused = tabRefs.current.indexOf(e.target as HTMLButtonElement);
    const from = focused >= 0 ? focused : tab;
    let next = -1;
    if (e.key === 'ArrowRight') next = (from + 1) % n;
    else if (e.key === 'ArrowLeft') next = (from - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    go(next);
    tabRefs.current[next]?.focus();
  };

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (isKeyboardFocus(e.target)) setKeyboard(true);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboard(false);
  };
  const onPointerEnter = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovered(true);
  };
  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovered(false);
  };

  return (
    <div ref={rootRef} className="mk-story-desk" onFocus={onFocus} onBlur={onBlur}>
      <div role="tablist" aria-label="How it works" className="mk-story-tabs" onKeyDown={onKeyDown}>
        {steps.map((s, i) => {
          const on = i === tab;
          return (
            <button
              key={s.num}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(i)}
              aria-selected={on}
              aria-controls={panelId(i)}
              aria-label={`${s.num} ${s.label}: ${s.title}`}
              tabIndex={on ? 0 : -1}
              className="mk-story-tab"
              onClick={() => go(i)}
            >
              <span aria-hidden="true" className="mk-story-tab-raise" />
              <span className="mk-story-tab-body">
                <span aria-hidden="true" className="mk-story-tab-track">
                  <span
                    className={`mk-story-tab-fill${on ? (reduce ? ' is-full' : ' is-run') : ''}`}
                    style={on && !reduce ? { animationPlayState: running ? 'running' : 'paused' } : undefined}
                    onAnimationEnd={
                      on && !reduce
                        ? (e) => {
                            if (e.target === e.currentTarget && !reducedNow()) advance();
                          }
                        : undefined
                    }
                  />
                </span>
                <span className="mk-story-tab-head">
                  <span className="mk-story-num">{s.num}</span>
                  <span className="mk-story-tab-label">{s.label}</span>
                </span>
                <span className="mk-story-tab-title">{s.title}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mk-story-stage" onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
        <div className="mk-story-stack">
          {panels.map((panel, i) => {
            const on = i === tab;
            const animation = reduce || sw === 0 ? 'none' : on ? TAB_IN : i === prev ? TAB_OUT : 'none';
            return (
              <div
                key={i}
                role="tabpanel"
                id={panelId(i)}
                aria-labelledby={tabId(i)}
                aria-hidden={on ? undefined : true}
                inert={!on}
                tabIndex={on ? 0 : -1}
                className="mk-story-panel"
                style={{ opacity: on ? 1 : 0, animation, pointerEvents: on ? 'auto' : 'none' }}
              >
                {panel}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
