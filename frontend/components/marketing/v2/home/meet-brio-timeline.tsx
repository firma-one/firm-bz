'use client';

/**
 * "A day with Brio": eight moments in two rows of four, each row a line that draws itself as the page
 * scrolls. The day follows one engagement (Q2 – Product Launch Campaign, with Dana Whitfield reviewing
 * for Horizon FinTech), so the moments agree with each other.
 *
 * - Desktop (>= 1024 px): each row's line runs across its dots. p = (vh·0.85 − top) / (vh·0.55).
 * - Below 1024 px: the phone board's vertical timeline, the two rows one under the other; each line's
 *   tip follows a point 72% down the screen. p = (vh·0.72 − (top + 9)) / (height − 39).
 *
 * The fill is written straight to the DOM from a rAF-throttled passive scroll handler (no React render
 * per frame). A moment wakes when its row's line reaches its dot; several reached at once start 600 ms
 * apart. Waking re-renders on a 100 ms story clock only until that row's last story has finished
 * (about 3.7 s). Reduced motion, or no IntersectionObserver: full lines and every moment in its final
 * state.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { FILES_AGENT_PUBLIC } from '../config';
import type { DemoDates } from '../demo-dates';
import { useDemoDates } from '../demo-dates-context';
import { STORY_DONE } from '../motion';
import { RaidTerm } from '../raid-tip';

type Mode = 'idle' | 'live' | 'static';
type Chip = 'now' | 'next' | null;

/** Where each dot sits along a row's horizontal line (fraction of its length). */
const ROW_AT = [0.01, 0.26, 0.51, 0.77];
const PER_ROW = 4;
const WAKE_LAG = 600;
/** The longest story: the footer of an Ask moment fades in at 3.6 s. */
const STORY_MS = 3700;
/** The workday ends at 6:30 PM; the evening moment (9:40 PM) is the client's, after hours. */
const WORKDAY_END = 1110;
const EVENING = 1300;

/** Your brief's own pointer to the lists below it (components/home/day-brief.tsx). */
const DAY_ITEMS_LINE = 'The items are below, in Needs you and Agenda.';

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

/** Pressed once, when `on` while live. */
const press = (live: boolean, on: boolean): CSSProperties => ({ animation: live && on ? PRESS : 'none' });

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

/** A typed draft, its [blanks] highlighted as they appear (a blank still typing counts too). */
function Blanks({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]*\]?)/).map((part, i) =>
        part.startsWith('[') ? (
          <span key={i} className="mk-brio-blank">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

type MomentDef = {
  /** When in the day, in minutes after midnight. */
  minutes: number;
  label: ReactNode;
  isNew?: boolean;
  ariaLabel: string;
  foot: string;
  /** When the "You · …" footer fades in (ms after the moment wakes). */
  footAt: number;
  story: (e: number, live: boolean) => ReactNode;
};

function Moment({
  e,
  live,
  def,
  chip,
  momentRef,
}: {
  /** ms since the moment woke: -1 before, STORY_DONE in the final state. */
  e: number;
  live: boolean;
  def: MomentDef;
  chip: Chip;
  momentRef: (el: HTMLLIElement | null) => void;
}) {
  const awake = e >= 0;
  return (
    <li ref={momentRef} className="mk-brio-m">
      <span aria-hidden="true" className="mk-brio-dot">
        <span className="mk-brio-dot-base" />
        <span className="mk-brio-dot-on" style={{ opacity: awake ? 1 : 0, animation: live && awake ? DOT_POP : 'none' }} />
      </span>
      <p className="mk-brio-label">
        <span>{def.label}</span>
        {def.isNew && <span className="mk-brio-chip mk-brio-chip--new">NEW</span>}
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
        <div role="img" aria-label={def.ariaLabel} className="mk-brio-art">
          {def.story(e, live)}
        </div>
        <p className="mk-brio-foot" style={{ opacity: e >= def.footAt ? 1 : 0 }}>
          {def.foot}
        </p>
      </div>
    </li>
  );
}

/** A question to Brio and its streamed answer (10:15, and Dana's at 9:40). */
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

/** 8:30 AM: Your brief on Home, written as the visitor watches. */
function YourDayStory({ text, e, live }: { text: string; e: number; live: boolean }) {
  const typed = words(text, e, 300, 85);
  return (
    <>
      <CardHead title="Your brief" meta="Home" />
      <div className="mk-brio-brief">
        {typed}
        {live && e >= 300 && typed.length < text.length && <span className="mk-brio-caret" />}
      </div>
      <span className="mk-brio-muted" style={rise(e >= 2500)}>
        {DAY_ITEMS_LINE}
      </span>
    </>
  );
}

/** 11:30 AM: Dana's question, and Brio's reply draft with two blanks for the lead to fill. */
function ReplyStory({ e }: { e: number }) {
  const reply =
    'Hi Dana, good question. The pricing comes from [pricing sheet date]. I’ll confirm by [day] and update the page if anything has changed.';
  return (
    <>
      <CardHead title="Reply draft" meta="Discussions" />
      <div className="mk-brio-cmt" style={rise(e >= 200)}>
        <span aria-hidden="true" className="mk-brio-avatar">
          DW
        </span>
        <span>
          <span className="mk-brio-cmt-who">
            Dana Whitfield <span className="mk-brio-tag">Reviewer</span>
          </span>
          <span className="mk-brio-copy">Is the pricing on the landing page final?</span>
        </span>
      </div>
      <div className="mk-brio-draft" style={{ opacity: e >= 700 ? 1 : 0 }}>
        <span className="mk-brio-draft-who">Brio draft</span>
        <span className="mk-brio-copy">
          <Blanks text={words(reply, e, 1000, 60)} />
        </span>
      </div>
      <div className="mk-brio-actions mk-brio-actions--center" style={rise(e >= 2500)}>
        <span className="mk-brio-btn">Send</span>
        <span className="mk-brio-muted">2 blanks to fill first</span>
      </div>
    </>
  );
}

/** 1:00 PM: Identify action items in an internal memo's call notes; two are kept, one is skipped. */
function ActionsStory({ D, e, live }: { D: DemoDates; e: number; live: boolean }) {
  const rows: { on: boolean; kind: string; text: string }[] = [
    { on: true, kind: 'Reminder', text: `Send Dana the revised launch timeline · ${D.follow}` },
    { on: true, kind: 'Due date', text: `Post-Launch Retrospective Report → ${D.q2EndShort}` },
    { on: false, kind: 'New deliverable', text: 'Media list refresh' },
  ];
  return (
    <>
      <CardHead title="3 action items" meta="Internal memo" />
      <span className="mk-brio-memo">
        Call with Dana <span className="mk-brio-tag">Internal only</span>
      </span>
      {rows.map((row, i) => (
        <span key={row.kind} className="mk-brio-row" style={rise(e >= 300 + i * 350)}>
          <span aria-hidden="true" className={row.on ? 'mk-brio-box mk-brio-box--on' : 'mk-brio-box'} />
          <span>
            <span className="mk-brio-muted">{row.kind}</span>
            <br />
            {row.text}
          </span>
        </span>
      ))}
      <span className="mk-brio-btn mk-brio-btn--start" style={press(live, e >= 1600)}>
        Apply 2
      </span>
    </>
  );
}

/** 2:00 PM: the status update to Dana, drafted from what changed; next steps are the lead's. */
function StatusUpdateStory({ e, live }: { e: number; live: boolean }) {
  return (
    <>
      <CardHead title="Status update" meta="Q2 – Launch" />
      <span className="mk-brio-to">
        <span className="mk-brio-muted">To</span> Dana Whitfield
      </span>
      <div className="mk-brio-list">
        <span className="mk-brio-tick" style={{ color: '#2F8F4E', ...rise(e >= 300) }}>
          ✓ <span>Approved: GTM Plan &amp; Launch Readiness Kit</span>
        </span>
        <span className="mk-brio-tick" style={{ color: '#2F8F4E', ...rise(e >= 650) }}>
          ✓ <span>In review: Creative &amp; Landing Page Assets</span>
        </span>
        <span className="mk-brio-tick" style={{ color: '#A86A06', ...rise(e >= 1000) }}>
          ○ <span>Next steps: yours to write</span>
        </span>
      </div>
      <span className="mk-brio-btn mk-brio-btn--start" style={press(live, e >= 1600)}>
        Send to Dana
      </span>
    </>
  );
}

/** 3:30 PM: a nudge for the deliverable that is waiting on the client. */
function NudgeStory({ D, e, live }: { D: DemoDates; e: number; live: boolean }) {
  const nudge =
    'Hi Dana, a quick check-in on Creative & Landing Page Assets, which is with you for review. If anything needs changing, a comment here is the quickest way to get it to us.';
  return (
    <>
      <CardHead title="Nudge" meta="Waiting on the client" />
      <span className="mk-brio-split">
        <span className="mk-brio-strong">Creative &amp; Landing Page Assets</span>
        <span className="mk-brio-muted">Was due {D.d02Rel}</span>
      </span>
      <div className="mk-brio-draft" style={{ opacity: e >= 300 ? 1 : 0 }}>
        <span className="mk-brio-draft-who">Brio draft</span>
        <span className="mk-brio-copy">{words(nudge, e, 600, 55)}</span>
      </div>
      <div className="mk-brio-actions" style={rise(e >= 2500)}>
        <span className="mk-brio-btn" style={press(live, e >= 2900)}>
          Send nudge
        </span>
        <span className="mk-brio-btn mk-brio-btn--ghost">Not now</span>
      </div>
    </>
  );
}

/** 5:00 PM: the daily RAID check suggests a Risk and an Assumption from the day's messages and memos. */
function RaidStory({ D, e, live }: { D: DemoDates; e: number; live: boolean }) {
  const rows = [
    { badge: 'R', text: 'Landing page pricing may change before launch', source: 'Thread · Dana' },
    { badge: 'A', text: `Dana sends the final brand photos by ${D.follow}`, source: 'Memo · Call with Dana' },
  ];
  return (
    <>
      <CardHead title="RAID check" meta="2 suggestions" />
      {rows.map((row, i) => (
        <span key={row.badge} className="mk-brio-row" style={rise(e >= 300 + i * 450)}>
          <span aria-hidden="true" className="mk-brio-badge">
            {row.badge}
          </span>
          <span>
            {row.text}
            <br />
            <span className="mk-brio-src">{row.source}</span>
          </span>
        </span>
      ))}
      <div className="mk-brio-actions" style={rise(e >= 1300)}>
        <span className="mk-brio-btn" style={press(live, e >= 1800)}>
          Accept
        </span>
        <span className="mk-brio-btn mk-brio-btn--ghost">Dismiss</span>
      </div>
    </>
  );
}

/**
 * 9:40 PM: Brio for Reviewers. Dana asks after hours and gets an answer from what Dana can see: stages
 * a Reviewer sees (in review, approved), never a deliverable still in progress (lib/ai/reviewer-context.ts).
 */
function ClientAskStory({ D, e, live }: { D: DemoDates; e: number; live: boolean }) {
  return (
    <>
      <CardHead title="Dana’s view" meta="Reviewer" />
      <AskStory
        question="Is anything waiting on me?"
        answer={`Yes, one thing. Creative & Landing Page Assets is with you for review, and it was due ${D.d02Rel}. GTM Plan & Launch Readiness Kit is already approved.`}
        e={e}
        live={live}
      />
      <span className="mk-brio-muted" style={rise(e >= 3000)}>
        Answers only from what Dana can already see.
      </span>
    </>
  );
}

/** 3:30 PM once the Files agent is released (in place of the nudge): Brio proposes renames; one is struck through and replaced. */
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
        <span className="mk-brio-btn" style={press(live, e >= 1800)}>
          Approve
        </span>
      </div>
    </>
  );
}

/** The day's moments, in order. */
function dayMoments(D: DemoDates): MomentDef[] {
  const dayText = `Two things need you today. Dana’s question on Creative & Landing Page Assets is waiting for your reply, and PR & Media Outreach Pack is due ${D.d03Rel}.`;
  const atRisk = `Two. Creative & Landing Page Assets is overdue and waiting on the client. PR & Media Outreach Pack is due ${D.d03Rel} and still in progress.`;
  return [
    {
      minutes: 510,
      label: '8:30 AM · Your brief',
      isNew: true,
      ariaLabel: 'Your brief on Home: two things need you today, a client question to answer and a deliverable due soon.',
      foot: 'You · start with what needs you',
      footAt: 2900,
      story: (e, live) => <YourDayStory text={dayText} e={e} live={live} />,
    },
    {
      minutes: 615,
      label: (
        <>
          10:15 AM · Ask <Brio iconClassName="text-[#7DFF77]" />
        </>
      ),
      ariaLabel: 'Ask Brio: which deliverables are at risk? Brio names two and why.',
      foot: 'You · ask in plain words, get the facts',
      footAt: 3600,
      story: (e, live) => <AskStory question="Which deliverables are at risk?" answer={atRisk} e={e} live={live} />,
    },
    {
      minutes: 690,
      label: '11:30 AM · Draft a reply',
      isNew: true,
      ariaLabel: 'Dana Whitfield asks whether the landing page pricing is final. Brio drafts a reply with two blanks to fill before it can be sent.',
      foot: 'You · fill the blanks, then send',
      footAt: 3000,
      story: (e) => <ReplyStory e={e} />,
    },
    {
      minutes: 780,
      label: '1:00 PM · Call notes into action items',
      isNew: true,
      ariaLabel: 'Brio identifies three action items in the notes of a call with Dana: a reminder, a due date and a new deliverable. Two are kept and applied.',
      foot: 'You · keep what’s right, skip the rest',
      footAt: 2300,
      story: (e, live) => <ActionsStory D={D} e={e} live={live} />,
    },
    {
      minutes: 840,
      label: '2:00 PM · The client update',
      ariaLabel: 'Brio’s draft status update to Dana Whitfield: what was approved and what is in review, next steps left for you, with a Send to Dana button.',
      foot: 'You · add next steps, then send it',
      footAt: 2300,
      story: (e, live) => <StatusUpdateStory e={e} live={live} />,
    },
    FILES_AGENT_PUBLIC
      ? {
          minutes: 930,
          label: '3:30 PM · Tidy the files',
          isNew: true,
          ariaLabel: 'Brio’s Files agent proposes renaming six files to the engagement’s naming pattern, with Preview and Approve buttons.',
          foot: 'You · preview, approve, reversible',
          footAt: 2500,
          story: (e, live) => <TidyFilesStory e={e} live={live} />,
        }
      : {
          minutes: 930,
          label: '3:30 PM · A gentle nudge',
          isNew: true,
          ariaLabel: 'Creative & Landing Page Assets is waiting on the client. Brio drafts a friendly nudge to Dana, with Send nudge and Not now buttons.',
          foot: 'You · send it, or let it wait',
          footAt: 3300,
          story: (e, live) => <NudgeStory D={D} e={e} live={live} />,
        },
    {
      minutes: 1020,
      label: (
        <>
          5:00 PM · The <RaidTerm tone="dark">RAID log</RaidTerm>
        </>
      ),
      isNew: true,
      ariaLabel: 'Brio’s daily RAID check suggests a risk from Dana’s thread and an assumption from the call memo, each to accept or dismiss.',
      foot: 'You · accept what’s real, dismiss the rest',
      footAt: 2300,
      story: (e, live) => <RaidStory D={D} e={e} live={live} />,
    },
    {
      minutes: EVENING,
      label: (
        <>
          9:40 PM · Your client asks <Brio iconClassName="text-[#7DFF77]" />
        </>
      ),
      isNew: true,
      ariaLabel: 'After hours, Dana asks Brio whether anything is waiting on Dana, and Brio answers only from what Dana can already see.',
      foot: 'You · off for the night. Dana has an answer.',
      footAt: 3600,
      story: (e, live) => <ClientAskStory D={D} e={e} live={live} />,
    },
  ];
}

/**
 * The chips by the clock (local time, so only after mount). During the workday (8:30 AM to 6:30 PM),
 * NOW marks the latest moment whose time has passed; from 6:30 PM NEXT marks the evening moment, NOW
 * from its time until midnight; before 8:30 AM, NEXT marks the morning one.
 */
function chipsAt(mins: number, minutes: number[]): { now: number | null; next: number | null } {
  const evening = minutes.length - 1;
  if (mins < minutes[0]) return { now: null, next: 0 };
  if (mins >= minutes[evening]) return { now: evening, next: null };
  if (mins >= WORKDAY_END) return { now: null, next: evening };
  let now = 0;
  minutes.forEach((m, i) => {
    if (i < evening && mins >= m) now = i;
  });
  return { now, next: null };
}

/** One row of four: its own line, its own wakes and story clock. */
function TimelineRow({
  defs,
  offset,
  mode,
  chips,
  labelledBy,
  label,
}: {
  defs: MomentDef[];
  /** The first moment's place in the day (0 or 4), for the chips and the list's numbering. */
  offset: number;
  mode: Mode;
  chips: { now: number | null; next: number | null } | null;
  labelledBy?: string;
  label?: string;
}) {
  const tlRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const momentEls = useRef<(HTMLLIElement | null)[]>([]);
  // Stable ref callbacks, so the 100 ms story clock doesn't detach and reattach them.
  const [momentRefs] = useState(() =>
    Array.from({ length: PER_ROW }, (_, i) => (el: HTMLLIElement | null) => {
      momentEls.current[i] = el;
    }),
  );
  const woken = useRef<(number | null)[]>(Array(PER_ROW).fill(null));
  const [wakes, setWakes] = useState<(number | null)[]>(() => Array(PER_ROW).fill(null));
  const [, setTick] = useState(0);

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
    // Only track the scroll while the row is near the screen; settle the line as it leaves.
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

  // Story clock: 100 ms ticks from the first wake until the row's last story has played out.
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
  const chipFor = (day: number): Chip => (chips?.now === day ? 'now' : chips?.next === day ? 'next' : null);

  return (
    <div ref={tlRef} className="mk-brio-tl">
      <div aria-hidden="true" className="mk-brio-track" />
      <div aria-hidden="true" ref={fillRef} className="mk-brio-fill" />
      <ol className="mk-brio-moments" aria-labelledby={labelledBy} aria-label={label} start={offset + 1}>
        {defs.map((def, i) => (
          <Moment key={def.minutes} e={elapsed(i)} live={live} def={def} chip={chipFor(offset + i)} momentRef={momentRefs[i]} />
        ))}
      </ol>
    </div>
  );
}

export function MeetBrioTimeline({ labelledBy }: { labelledBy?: string }) {
  const D = useDemoDates();
  const [mode, setMode] = useState<Mode>('idle');
  const [chips, setChips] = useState<{ now: number | null; next: number | null } | null>(null);
  const defs = dayMoments(D);
  const minutes = defs.map((d) => d.minutes).join(',');

  // Motion: live unless the visitor prefers reduced motion or the browser has no IntersectionObserver.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const decide = () => setMode(mq?.matches || typeof IntersectionObserver === 'undefined' ? 'static' : 'live');
    decide();
    mq?.addEventListener?.('change', decide);
    return () => mq?.removeEventListener?.('change', decide);
  }, []);

  // NOW and NEXT follow the local clock, checked once a minute.
  useEffect(() => {
    const times = minutes.split(',').map(Number);
    const read = () => {
      const d = new Date();
      setChips(chipsAt(d.getHours() * 60 + d.getMinutes(), times));
    };
    read();
    const id = window.setInterval(read, 60_000);
    return () => window.clearInterval(id);
  }, [minutes]);

  return (
    <>
      <TimelineRow defs={defs.slice(0, PER_ROW)} offset={0} mode={mode} chips={chips} labelledBy={labelledBy} />
      <TimelineRow
        defs={defs.slice(PER_ROW)}
        offset={PER_ROW}
        mode={mode}
        chips={chips}
        label="A day with Brio, afternoon and evening"
      />
    </>
  );
}
