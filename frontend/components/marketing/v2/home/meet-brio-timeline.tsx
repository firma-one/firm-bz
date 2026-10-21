'use client';

/**
 * "A day with Brio": four moments on a line that draws itself as the page scrolls.
 *
 * - Desktop (>= 1024 px): a row, the line runs across the dots. p = (vh·0.85 − top) / (vh·0.55).
 * - Below 1024 px: the phone board's vertical timeline; the line's tip follows a point 72% down the
 *   screen. p = (vh·0.72 − (top + 9)) / (height − 39).
 *
 * The fill is written straight to the DOM from a rAF-throttled passive scroll handler (no React render
 * per frame). A moment wakes when the line reaches its dot; several reached at once start 600 ms apart.
 * Waking re-renders on a 100 ms story clock only until the last story has finished (about 3.7 s).
 * Reduced motion, or no IntersectionObserver: the full line and every moment in its final state.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { FILES_AGENT_PUBLIC } from '../config';
import { useDemoDates } from '../demo-dates-context';
import { STORY_DONE } from '../motion';

type Mode = 'idle' | 'live' | 'static';
type Chip = 'now' | 'next' | null;

/** Where each dot sits along the horizontal line (fraction of its length). */
const ROW_AT = [0.01, 0.26, 0.51, 0.77];
const WAKE_LAG = 600;
/** The longest story: the footer of an Ask moment fades in at 3.6 s. */
const STORY_MS = 3700;
/** 8:30 AM, 10:15 AM, 2:00 PM, 4:30 PM, in minutes after midnight; the workday ends at 6:30 PM. */
const MOMENT_MINUTES = [510, 615, 840, 990];
const WORKDAY_END = 1110;
/** When each moment's "You · …" footer fades in (ms after it wakes). */
const FOOT_AT = [2900, 3600, 2300, FILES_AGENT_PUBLIC ? 2500 : 3600];

/** The 4:30 answer while the Files agent is unreleased. A file name never breaks at its dash. */
const DRAFTS_ANSWER =
  'Three files are still in Drafts: Media List\u00a0–\u2060\u00a0Q2.xlsx, Landing Page Copy v3.docx and Launch FAQ.docx. None is shared with Horizon FinTech yet.';

const DOT_POP = 'mkDotPop 700ms var(--mk-ease) both';
const PRESS = 'mkPress 500ms var(--mk-ease) both';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The first words of `str` that have "typed" by `e` ms (one every `per` ms from `start`). */
function words(str: string, e: number, start: number, per: number) {
  if (e >= STORY_DONE) return str;
  if (e < 0) return '';
  const w = str.split(' ');
  const n = Math.max(0, Math.min(w.length, Math.floor((e - start) / per)));
  return w.slice(0, n).join(' ');
}

/** Fades and rises 8 px into place once `on`. */
const rise = (on: boolean): CSSProperties => ({ opacity: on ? 1 : 0, transform: on ? 'none' : 'translate3d(0, 8px, 0)' });

/** Brio inside product UI: firmä green. */
function BrioGreen() {
  return (
    <span className="mk-brio-green">
      <Brio fixedColor />
    </span>
  );
}

function CardHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mk-brio-head">
      <BrioGreen />
      <span className="mk-brio-sep">·</span>
      <span className="mk-brio-title">{title}</span>
      <span className="mk-brio-meta">{meta}</span>
    </div>
  );
}

function Moment({
  e,
  live,
  label,
  chip,
  isNew,
  ariaLabel,
  foot,
  footAt,
  momentRef,
  children,
}: {
  /** ms since the moment woke: -1 before, STORY_DONE in the final state. */
  e: number;
  live: boolean;
  label: ReactNode;
  chip: Chip;
  isNew?: boolean;
  ariaLabel: string;
  foot: string;
  footAt: number;
  momentRef: (el: HTMLLIElement | null) => void;
  children: ReactNode;
}) {
  const awake = e >= 0;
  return (
    <li ref={momentRef} className="mk-brio-m">
      <span aria-hidden="true" className="mk-brio-dot">
        <span className="mk-brio-dot-base" />
        <span className="mk-brio-dot-on" style={{ opacity: awake ? 1 : 0, animation: live && awake ? DOT_POP : 'none' }} />
      </span>
      <p className="mk-brio-label">
        <span>{label}</span>
        {isNew && <span className="mk-brio-chip mk-brio-chip--new">NEW</span>}
        {chip === 'now' && (
          <span className="mk-brio-chip mk-brio-chip--now">
            <span aria-hidden="true" className="mk-brio-now-dot" />
            NOW
          </span>
        )}
        {chip === 'next' && <span className="mk-brio-chip mk-brio-chip--next">NEXT</span>}
      </p>
      <div
        className="mk-brio-card"
        style={{ opacity: awake ? 1 : 0.4, transform: awake ? 'none' : 'translate3d(0, 10px, 0)' }}
      >
        <div role="img" aria-label={ariaLabel} className="mk-brio-art">
          {children}
        </div>
        <p className="mk-brio-foot" style={{ opacity: e >= footAt ? 1 : 0 }}>
          {foot}
        </p>
      </div>
    </li>
  );
}

/** A question to Brio and its streamed answer (10:15, and 4:30 while the Files agent is unreleased). */
function AskStory({ question, answer, e, live }: { question: string; answer: string; e: number; live: boolean }) {
  return (
    <>
      <div className="mk-brio-q-row">
        <span className="mk-brio-q" style={rise(e >= 200)}>
          {question}
        </span>
      </div>
      <div className="mk-brio-a" style={{ opacity: e >= 700 ? 1 : 0 }}>
        <div className="mk-brio-a-who">
          <BrioGreen />
        </div>
        <span className="mk-brio-copy">{words(answer, e, 1400, 75)}</span>
        {live && e >= 700 && e < 1400 && (
          <span className="mk-brio-think">
            <span />
            <span />
            <span />
          </span>
        )}
      </div>
    </>
  );
}

/** 4:30 PM with the Files agent released: Brio proposes renames; one is struck through and replaced. */
function TidyFilesStory({ e, live }: { e: number; live: boolean }) {
  return (
    <>
      <CardHead title="Files" meta="naming check" />
      <div className="mk-brio-copy">6 files don’t follow this engagement’s naming pattern. Rename them?</div>
      <div className="mk-brio-rename">
        <span className="mk-brio-old">
          final_v3 (2).pdf
          <span aria-hidden="true" className="mk-brio-strike" style={{ transform: e >= 500 ? 'scaleX(1)' : 'scaleX(0)' }} />
        </span>
        <span className="mk-brio-new" style={rise(e >= 900)}>
          QPL-11 Landing Page – Final.pdf
        </span>
      </div>
      <div className="mk-brio-actions">
        <span className="mk-brio-btn mk-brio-btn--ghost">Preview all 6</span>
        <span className="mk-brio-btn" style={{ animation: live && e >= 1800 ? PRESS : 'none' }}>
          Approve
        </span>
      </div>
    </>
  );
}

export function MeetBrioTimeline({ labelledBy }: { labelledBy?: string }) {
  const D = useDemoDates();
  const tlRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const momentEls = useRef<(HTMLLIElement | null)[]>([]);
  // Stable ref callbacks, so the 100 ms story clock doesn't detach and reattach them.
  const [momentRefs] = useState(() =>
    [0, 1, 2, 3].map((i) => (el: HTMLLIElement | null) => {
      momentEls.current[i] = el;
    }),
  );
  const woken = useRef<(number | null)[]>([null, null, null, null]);
  const [mode, setMode] = useState<Mode>('idle');
  const [wakes, setWakes] = useState<(number | null)[]>([null, null, null, null]);
  const [nowIdx, setNowIdx] = useState<number | null>(null);
  const [, setTick] = useState(0);

  // Motion: live unless the visitor prefers reduced motion or the browser has no IntersectionObserver.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const decide = () => setMode(mq?.matches || typeof IntersectionObserver === 'undefined' ? 'static' : 'live');
    decide();
    mq?.addEventListener?.('change', decide);
    return () => mq?.removeEventListener?.('change', decide);
  }, []);

  // NOW marks the latest moment whose time has passed during the workday (8:30 AM to 6:30 PM);
  // outside it, NEXT marks the morning brief. Local time, so only after mount.
  useEffect(() => {
    const read = () => {
      const d = new Date();
      const mins = d.getHours() * 60 + d.getMinutes();
      let idx = -1;
      if (mins < WORKDAY_END) MOMENT_MINUTES.forEach((m, i) => {
        if (mins >= m) idx = i;
      });
      setNowIdx(idx);
    };
    read();
    const id = window.setInterval(read, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // The line follows the scroll; moments wake as it reaches them.
  useEffect(() => {
    const tl = tlRef.current;
    const fill = fillRef.current;
    if (!tl || !fill) return;
    if (mode === 'static') {
      fill.style.transform = 'none';
      return;
    }
    if (mode !== 'live') return;

    const row = window.matchMedia('(min-width: 1024px)');
    let raf = 0;
    let visible = false;
    /** Vertical thresholds (each moment's offset / line length), measured once per layout. */
    let at: number[] | null = null;

    const update = () => {
      raf = 0;
      const r = tl.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      let p: number;
      let thresholds: number[];
      if (row.matches) {
        p = clamp01((vh * 0.85 - r.top) / (vh * 0.55));
        fill.style.transform = `scaleX(${p.toFixed(4)})`;
        thresholds = ROW_AT;
      } else {
        // The line runs from the first dot (9 px down) to 30 px above the end.
        const len = Math.max(1, r.height - 39);
        p = clamp01((vh * 0.72 - (r.top + 9)) / len);
        fill.style.transform = `scaleY(${p.toFixed(4)})`;
        thresholds = at ??= momentEls.current.map((m) =>
          Math.max(0.003, m ? (m.getBoundingClientRect().top - r.top) / len : 0),
        );
      }
      const now = performance.now();
      let lag = 0;
      let changed = false;
      thresholds.forEach((x, i) => {
        if (p >= x && woken.current[i] === null) {
          woken.current[i] = now + lag;
          lag += WAKE_LAG;
          changed = true;
        }
      });
      if (changed) setWakes(woken.current.slice());
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onScroll = () => {
      if (visible) schedule();
    };
    const onResize = () => {
      at = null;
      schedule();
    };
    // Only track the scroll while the timeline is near the screen; settle the line as it leaves.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        tl.toggleAttribute('data-paused', !visible);
        if (raf) cancelAnimationFrame(raf);
        update();
      },
      { rootMargin: '15% 0px' },
    );
    io.observe(tl);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    update();
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      tl.removeAttribute('data-paused');
    };
  }, [mode]);

  // Story clock: 100 ms ticks from the first wake until the last story has played out.
  useEffect(() => {
    if (mode !== 'live') return;
    const times = wakes.filter((w): w is number => w !== null);
    if (!times.length) return;
    const end = Math.max(...times) + STORY_MS;
    let id = 0;
    const tick = () => {
      setTick((n) => n + 1);
      if (performance.now() < end) id = window.setTimeout(tick, 100);
    };
    id = window.setTimeout(tick, 100);
    return () => window.clearTimeout(id);
  }, [mode, wakes]);

  const live = mode === 'live';
  const now = live ? performance.now() : 0;
  const elapsed = (i: number) => {
    if (mode === 'static') return STORY_DONE;
    const w = wakes[i];
    return live && w !== null && now >= w ? now - w : -1;
  };
  const chipFor = (i: number): Chip => (nowIdx === null ? null : nowIdx === i ? 'now' : nowIdx < 0 && i === 0 ? 'next' : null);

  const brief = `4 live engagements, worth $79K. Two are behind pace. Creative & Landing Page Assets was due ${D.d02Rel} and is still in review.`;
  const atRisk = `Two. Creative & Landing Page Assets is overdue and waiting on the client. PR & Media Outreach Pack is due ${D.d03Rel} and still in progress.`;

  const e0 = elapsed(0);
  const e1 = elapsed(1);
  const e2 = elapsed(2);
  const e3 = elapsed(3);
  const briefTxt = words(brief, e0, 300, 85);

  return (
    <div ref={tlRef} className="mk-brio-tl">
      <div aria-hidden="true" className="mk-brio-track" />
      <div aria-hidden="true" ref={fillRef} className="mk-brio-fill" />
      <ol className="mk-brio-moments" aria-labelledby={labelledBy}>
        <Moment
          e={e0}
          live={live}
          label="8:30 AM · Today’s brief"
          chip={chipFor(0)}
          ariaLabel="Brio’s firm brief: four live engagements worth $79K, two behind pace, one deliverable overdue."
          foot="You · know where things stand in 30 seconds"
          footAt={FOOT_AT[0]}
          momentRef={momentRefs[0]}
        >
          <CardHead title="Today’s brief" meta="Firm Overview" />
          <div className="mk-brio-brief">
            {briefTxt}
            {live && e0 >= 300 && briefTxt.length < brief.length && <span className="mk-brio-caret" />}
          </div>
        </Moment>

        <Moment
          e={e1}
          live={live}
          label={
            <>
              10:15 AM · Ask <Brio iconClassName="text-[#7DFF77]" />
            </>
          }
          chip={chipFor(1)}
          ariaLabel="Ask Brio: which deliverables are at risk? Brio names two and why."
          foot="You · ask in plain words, get the facts"
          footAt={FOOT_AT[1]}
          momentRef={momentRefs[1]}
        >
          <AskStory question="Which deliverables are at risk?" answer={atRisk} e={e1} live={live} />
        </Moment>

        <Moment
          e={e2}
          live={live}
          label="2:00 PM · The client update"
          chip={chipFor(2)}
          ariaLabel="Brio’s draft status update: five sections drafted, Mitigation and Next Steps left for the engagement lead, with a Review and publish button."
          foot="You · edit, then publish to the client"
          footAt={FOOT_AT[2]}
          momentRef={momentRefs[2]}
        >
          <CardHead title="Status update draft" meta="Q2 – Launch" />
          <div className="mk-brio-list">
            <span className="mk-brio-tick" style={{ color: '#2F8F4E', ...rise(e2 >= 300) }}>
              ✓ <span>Summary · Progress · Collaboration</span>
            </span>
            <span className="mk-brio-tick" style={{ color: '#2F8F4E', ...rise(e2 >= 650) }}>
              ✓ <span>Risks · Needs Attention</span>
            </span>
            <span className="mk-brio-tick" style={{ color: '#A86A06', ...rise(e2 >= 1000) }}>
              ○ <span>Mitigation &amp; Next Steps: yours to write</span>
            </span>
          </div>
          <span className="mk-brio-btn mk-brio-btn--start" style={{ animation: live && e2 >= 1600 ? PRESS : 'none' }}>
            Review and publish
          </span>
        </Moment>

        {FILES_AGENT_PUBLIC ? (
          <Moment
            e={e3}
            live={live}
            label="4:30 PM · Tidy the files"
            isNew
            chip={chipFor(3)}
            ariaLabel="Brio’s Files agent proposes renaming six files to the engagement’s naming pattern, with Preview and Approve buttons."
            foot="You · preview, approve, reversible"
            footAt={FOOT_AT[3]}
            momentRef={momentRefs[3]}
          >
            <TidyFilesStory e={e3} live={live} />
          </Moment>
        ) : (
          <Moment
            e={e3}
            live={live}
            label={
              <>
                4:30 PM · Ask <Brio iconClassName="text-[#7DFF77]" /> on Files
              </>
            }
            chip={chipFor(3)}
            ariaLabel="Ask Brio: what’s still in Drafts? Brio names the three draft files, none of them shared with the client yet."
            foot="You · find what’s unfinished, before the client asks"
            footAt={FOOT_AT[3]}
            momentRef={momentRefs[3]}
          >
            <AskStory
              question="What’s still in Drafts?"
              answer={DRAFTS_ANSWER}
              e={e3}
              live={live}
            />
          </Moment>
        )}
      </ol>
    </div>
  );
}
