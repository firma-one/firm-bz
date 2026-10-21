'use client';

/**
 * The bento's living scenes (board: `cardVals()`). Each scene keeps its own small clock that re-renders
 * only at the moments its story changes, so the bento never re-renders as a whole.
 *
 * - Stories play once, timed from the card's first scroll-in (MkCard's reveal time): f1 approval, f2
 *   reminder. Rows, bars and chips that only arrive are CSS reveals (`mk-reveal`), no clock at all.
 * - Loops (f4 audit log every 3.5 s, f5 Doc Search every 6.5 s) run only while their card is on screen.
 * - Under reduced motion every scene shows its final state and nothing loops.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Odometer, STORY_DONE, revealDelay, useCardReveal, useOnScreen, usePrefersReducedMotion } from '../motion';
import { useDemoDates } from '../demo-dates-context';
import { ScaleToFit } from './feature-bento-scale';
import { CheckGlyph, FileGlyph, SearchGlyph } from './feature-bento-icons';

// ── Clock ────────────────────────────────────────────────────────────────────────────────────────

/** Given the elapsed ms, how long until the scene next changes (null once it never will). */
type NextChange = (elapsed: number) => number | null;

/** Waits for the first of `times` still ahead. */
const atTimes =
  (times: number[]): NextChange =>
  (e) => {
    for (const t of times) if (e < t) return t - e;
    return null;
  };

/** Waits for the next multiple of `period`. */
const every =
  (period: number): NextChange =>
  (e) =>
    period - (e % period);

/**
 * Milliseconds since `startedAt` (-1 before it, STORY_DONE under reduced motion). Re-renders only when
 * `next` says the scene changes, and not at all while `active` is false (the card is off screen).
 */
function useSceneClock(startedAt: number | null, next: NextChange, active = true) {
  const reduce = usePrefersReducedMotion();
  const [elapsed, setElapsed] = useState(-1);
  useEffect(() => {
    if (reduce || startedAt === null || !active) return;
    let id = 0;
    const run = () => {
      const e = performance.now() - startedAt;
      setElapsed(e);
      const wait = next(e);
      // A few ms past the boundary, so the render lands on the new state.
      if (wait !== null) id = window.setTimeout(run, wait + 16);
    };
    id = window.setTimeout(run, 0);
    return () => window.clearTimeout(id);
  }, [reduce, startedAt, active, next]);
  if (reduce) return STORY_DONE;
  return startedAt === null ? -1 : elapsed;
}

const PRESS = 'mkPress 500ms var(--mk-ease) both';
const RING = 'mkRing 1100ms var(--mk-ease) both';

// ── f1 · Comments and approvals ──────────────────────────────────────────────────────────────────

const F1 = { press: 2000, approved: 2300, moved: 2600 };
const f1Next = atTimes([F1.press, F1.approved, F1.moved]);
/** The status chip carries each state's color inside the odometer, so the change is a roll. */
const STATUS_LOOKS: CSSProperties[] = [
  { background: '#FBF0D9', color: '#7A5200', padding: '0 8px' },
  { background: '#E2F2E7', color: '#1F6B3A', padding: '0 8px' },
];
/** Design width of the desktop scene: the comment card (28 + 404) and the Board (24 + 280), plus air. */
const F1_WIDTH = 761;

function Comment({
  initials,
  bg,
  fg,
  name,
  meta,
  text,
  delay,
}: {
  initials: string;
  bg: string;
  fg: string;
  name: string;
  meta: string;
  text: string;
  delay: number;
}) {
  return (
    <div className="mk-bento-row mk-bento-row--top mk-reveal" style={revealDelay(delay)}>
      <span className="mk-bento-av" style={{ background: bg, color: fg }}>
        {initials}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block' }}>
          <strong className="mk-bento-strong">{name}</strong> <span className="mk-bento-muted">{meta}</span>
        </span>
        <span className="mk-bento-comment">{text}</span>
      </span>
    </div>
  );
}

function BoardTile({ title, who, date }: { title: string; who: string; date: string }) {
  return (
    <div className="mk-bento-ui mk-bento-tile">
      <span className="mk-bento-tile-title">{title}</span>
      <span className="mk-bento-tile-meta">
        <span>{who}</span>
        <span>{date}</span>
      </span>
    </div>
  );
}

/**
 * Two comments arrive, Approve is pressed (with the ring), the status rolls In Review → Approved and
 * "Approved just now" appears. On desktop the card then crosses the Board from In Review to Approved;
 * on phones "Approved just now" takes the place of "Request changes" instead.
 */
export function ApprovalScene() {
  const e = useSceneClock(useCardReveal(), f1Next);
  const { d01Short, d02Short } = useDemoDates();
  const live = e !== STORY_DONE;
  const pressed = live && e >= F1.press;
  const approved = e >= F1.approved;
  const moved = e >= F1.moved;

  const status = (
    <span className="mk-bento-status">
      <Odometer values={['In Review', 'Approved']} index={approved ? 1 : 0} lineHeight={20} animate={live} looks={STATUS_LOOKS} />
    </span>
  );
  const approve = (
    <span className="mk-bento-approve" style={{ animation: pressed ? PRESS : 'none' }}>
      Approve
      <span className="mk-bento-ring" style={{ animation: pressed ? RING : 'none' }} />
    </span>
  );
  const doneStyle: CSSProperties = { opacity: approved ? 1 : 0, transform: approved ? 'none' : 'translate3d(-6px, 0, 0)' };
  const comments = (phone: boolean) => (
    <>
      <Comment
        initials="MC"
        bg="#FBE4D6"
        fg="#9A4A16"
        name="Megan Carter"
        meta={phone ? '· Horizon FinTech' : '· Horizon FinTech · 9:12 AM'}
        text="Love the direction. Can we tighten the hero headline?"
        delay={350}
      />
      <Comment
        initials="SR"
        bg="#E3EDFB"
        fg="#2C4A9A"
        name="Sam Rivera"
        meta={phone ? '· Beacon Growth' : '· Beacon Growth · 9:40 AM'}
        text="Tightened in v4. Ready for your sign-off."
        delay={950}
      />
    </>
  );

  return (
    <>
      <ScaleToFit width={F1_WIDTH} className="mk-bento-desk">
        <div className="mk-bento-ui mk-bento-thread">
          <div className="mk-bento-bar">
            <span className="mk-bento-strong" style={{ whiteSpace: 'nowrap' }}>
              02 Creative &amp; Landing Page Assets
            </span>
            <span style={{ marginLeft: 'auto', flex: 'none' }}>{status}</span>
          </div>
          {comments(false)}
          <div className="mk-bento-row mk-reveal" style={revealDelay(1450)}>
            {approve}
            <span className="mk-bento-secondary">Request changes</span>
            <span className="mk-bento-done mk-bento-done--end" style={doneStyle}>
              <CheckGlyph />
              Approved just now
            </span>
          </div>
        </div>
        <div className="mk-bento-board">
          <div>
            <div className="mk-bento-col-head">
              <span className="mk-bento-dot" style={{ background: '#E5B33E' }} />
              In Review
            </div>
            <div style={{ height: 64 }} />
          </div>
          <div>
            <div className="mk-bento-col-head">
              <span className="mk-bento-dot" style={{ background: '#2F8F4E' }} />
              Approved
            </div>
            <BoardTile title="01 GTM Plan & Launch Kit" who="Alex J." date={d01Short} />
          </div>
          <div className="mk-bento-mover" style={{ transform: moved ? 'translate3d(145px, 82px, 0)' : 'none' }}>
            <BoardTile title="02 Creative & Landing Assets" who="Sam R." date={d02Short} />
          </div>
        </div>
      </ScaleToFit>

      <div className="mk-bento-phone">
        <div className="mk-bento-ui mk-bento-sheet">
          <div className="mk-bento-bar">
            <span className="mk-bento-strong mk-bento-ell" style={{ flex: 1 }}>
              02 Creative &amp; Landing Assets
            </span>
            {status}
          </div>
          {comments(true)}
          <div className="mk-bento-row mk-reveal" style={revealDelay(1450)}>
            {approve}
            <span style={{ position: 'relative', flex: 'none' }}>
              <span className="mk-bento-secondary" style={{ opacity: approved ? 0 : 1 }}>
                Request changes
              </span>
              <span className="mk-bento-done mk-bento-done--over" style={doneStyle}>
                <CheckGlyph />
                Approved just now
              </span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── f2 · Client reminders ────────────────────────────────────────────────────────────────────────

const F2 = { press: 1600, sent: 1900, toast: 2200 };
const f2Next = atTimes([F2.press, F2.sent, F2.toast]);
const SEND_LOOKS: CSSProperties[] = [
  { background: '#047857', color: '#FFFFFF', padding: '0 14px' },
  { background: '#E2F2E7', color: '#1F6B3A', padding: '0 14px' },
];

function WaitingRow({ name, tag, bg, fg, delay }: { name: string; tag: string; bg: string; fg: string; delay: number }) {
  return (
    <div className="mk-bento-row mk-reveal" style={revealDelay(delay)}>
      <FileGlyph />
      <span className="mk-bento-ell" style={{ flex: 1 }}>
        {name}
      </span>
      <span className="mk-bento-tag" style={{ background: bg, color: fg }}>
        {tag}
      </span>
    </div>
  );
}

/** Rows arrive, Send reminder is pressed and rolls to "Reminder sent ✓", then the toast rises. */
export function ReminderScene() {
  const e = useSceneClock(useCardReveal(), f2Next);
  const { follow } = useDemoDates();
  const live = e !== STORY_DONE;
  const pressed = live && e >= F2.press;
  const sent = e >= F2.sent;
  const toast = e >= F2.toast;
  return (
    <>
      <div className="mk-bento-ui mk-bento-sheet">
        <div className="mk-bento-bar mk-bento-strong">
          Waiting on Horizon FinTech
          <span className="mk-bento-tag" style={{ marginLeft: 'auto', background: '#EFEFED', color: '#55534E' }}>
            2 items
          </span>
        </div>
        <WaitingRow name="Landing Page Copy.docx" tag="Approval · 3 days" bg="#FBF0D9" fg="#7A5200" delay={350} />
        <WaitingRow name="Media List – Q2.xlsx" tag="Feedback · 5 days" bg="#FBE4D6" fg="#9A4A16" delay={650} />
        <div className="mk-bento-row mk-reveal" style={{ ...revealDelay(950), justifyContent: 'space-between' }}>
          <span className="mk-bento-muted" style={{ fontSize: 12 }}>
            Follow up · {follow}
          </span>
          <span className="mk-bento-send" style={{ animation: pressed ? PRESS : 'none' }}>
            <Odometer values={['Send reminder', 'Reminder sent ✓']} index={sent ? 1 : 0} lineHeight={28} animate={live} looks={SEND_LOOKS} />
          </span>
        </div>
      </div>
      <div className="mk-bento-ui mk-bento-toast" style={{ opacity: toast ? 1 : 0, transform: toast ? 'none' : 'translate3d(0, 14px, 0)' }}>
        <span style={{ display: 'inline-flex', color: '#2F7A46' }}>
          <CheckGlyph />
        </span>
        Reminder sent to Megan Carter
      </div>
    </>
  );
}

// ── f4 · Audit trail (loop) ──────────────────────────────────────────────────────────────────────

const LOG = [
  { who: 'AJ', bg: '#E3EDFB', fg: '#2C4A9A', text: 'Alex Jordan shared Q2 Launch Strategy.pdf with Leadership' },
  { who: 'MC', bg: '#FBE4D6', fg: '#9A4A16', text: 'Megan Carter viewed Landing Page Copy.docx' },
  { who: 'SR', bg: '#E2F2E7', fg: '#2F7A46', text: 'Sam Rivera uploaded Creative Assets v4.zip' },
  { who: 'MC', bg: '#FBE4D6', fg: '#9A4A16', text: 'Megan Carter approved Creative & Landing Page Assets' },
  { who: 'AJ', bg: '#E3EDFB', fg: '#2C4A9A', text: 'Engagement closed: guest access removed' },
];
const LOG_TIMES = ['now', '12m', '40m'];
const LOG_EVERY = 3500;
const logNext = every(LOG_EVERY);

/**
 * Newest on top: every 3.5 s a new row slides in from above (the list shifts down one row, the new row
 * fades in) and the oldest drops out of the window.
 */
export function AuditLogScene() {
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const e = useSceneClock(useCardReveal(), logNext, onScreen);
  const step = e >= 0 && e !== STORY_DONE ? Math.floor(e / LOG_EVERY) : 0;
  const rows = [2, 1, 0].map((o) => LOG[(step + o) % LOG.length]);
  return (
    <div ref={ref} className="mk-bento-ui mk-bento-sheet">
      <div className="mk-bento-bar mk-bento-strong" style={{ justifyContent: 'space-between' }}>
        Audit log
        <span className="mk-bento-muted" style={{ fontWeight: 400, fontSize: 12 }}>
          Q2 – Product Launch
        </span>
      </div>
      <div className="mk-bento-log mk-reveal" style={revealDelay(300)}>
        {/* Keyed by step, so the shift and the fade replay for every new row. */}
        <div key={step} className={step > 0 ? 'mk-bento-log-shift' : undefined}>
          {rows.map((r, i) => (
            <div key={i} className={`mk-bento-row mk-bento-log-row${i === 0 && step > 0 ? ' mk-bento-log-new' : ''}`}>
              <span className="mk-bento-av mk-bento-av--sm" style={{ background: r.bg, color: r.fg, fontSize: 10 }}>
                {r.who}
              </span>
              <span className="mk-bento-log-text">{r.text}</span>
              <span className="mk-bento-muted" style={{ flex: 'none', fontSize: 11 }}>
                {LOG_TIMES[i]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── f5 · Doc Search (loop) ───────────────────────────────────────────────────────────────────────

const SEARCH_EVERY = 6500;
/** After rolling onto the repeated first search, snap back to the real first one, unseen. */
const SEARCH_SNAP = 1500;
const searchNext: NextChange = (e) => {
  const t = e % SEARCH_EVERY;
  return t < SEARCH_SNAP ? SEARCH_SNAP - t : SEARCH_EVERY - t;
};
const SEARCH_ROLL = 1200;

/**
 * Three real filter searches (contracts for Horizon FinTech, decks in Q4 Brand Refresh, reports from
 * the last 30 days): every 6.5 s each chip and result line rolls to the next, staggered left to right.
 */
export function DocSearchScene() {
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const e = useSceneClock(useCardReveal(), searchNext, onScreen);
  const { search: s } = useDemoDates();

  // 0 → 1 → 2 → 3 (a copy of 0), then back to 0 without a transition.
  let index = 0;
  let animate = false;
  if (e >= 0 && e !== STORY_DONE) {
    const round = Math.floor(e / SEARCH_EVERY);
    const pos = round % 3;
    animate = true;
    if (round > 0 && pos === 0) {
      if (e % SEARCH_EVERY < SEARCH_SNAP) index = 3;
      else animate = false;
    } else {
      index = pos;
    }
  }
  const roll = (values: ReactNode[], lineHeight: number, delay: number, style?: CSSProperties) => (
    <Odometer values={values} index={index} lineHeight={lineHeight} animate={animate} delay={delay} duration={SEARCH_ROLL} style={style} />
  );
  const result = (names: string[], subs: string[], delay: number) => (
    <div className="mk-bento-row">
      <FileGlyph />
      <span style={{ flex: 1, minWidth: 0 }}>
        {roll(names, 18, delay, { fontWeight: 500 })}
        {roll(subs, 16, delay + 40, { fontSize: 11.5, color: '#8D8B86' })}
      </span>
    </div>
  );

  return (
    <div ref={ref} className="mk-bento-ui mk-bento-sheet">
      <div className="mk-bento-search">
        <SearchGlyph />
        <span className="mk-bento-chip">{roll(['Type: Contract', 'Type: Deck', 'Type: Report'], 24, 0, { padding: '0 10px' })}</span>
        <span className="mk-bento-chip">
          {roll(['Client: Horizon FinTech', 'Engagement: Q4 Brand Refresh', 'Date: Last 30 days'], 24, 70, { padding: '0 10px' })}
        </span>
      </div>
      {result(
        ['Master Services Agreement.pdf', 'Brand Refresh – Concepts v2.pptx', 'Q3 Growth Report.pdf'],
        [`Horizon FinTech · ${s[0]}`, `Acme Robotics · ${s[2]}`, `Horizon FinTech · ${s[4]}`],
        140,
      )}
      {result(
        ['SOW – Q2 Launch.pdf', 'Visual Identity Review.pdf', 'Campaign Results – Sept.xlsx'],
        [`Q2 – Product Launch · ${s[1]}`, `Acme Robotics · ${s[3]}`, `Northwind Studio · ${s[5]}`],
        220,
      )}
    </div>
  );
}

// ── f6 · Calendar and Inbox ──────────────────────────────────────────────────────────────────────

const INBOX = [
  { who: 'MC', bg: '#FBE4D6', fg: '#9A4A16', text: 'Megan Carter commented on Landing Page Copy.docx', time: '2m' },
  { who: 'DL', bg: '#E3EDFB', fg: '#2C4A9A', text: 'Dana Lee approved Brand Refresh – Concepts v2', time: '1h' },
  { who: 'NS', bg: '#EFEFED', fg: '#55534E', text: 'Northwind Studio requested changes on Media Kit', time: '3h' },
];

function CalendarCard() {
  const { week, weekLabel } = useDemoDates();
  return (
    <div className="mk-bento-ui mk-bento-cal">
      <div className="mk-bento-cal-head mk-bento-strong">
        Calendar <span className="mk-bento-muted" style={{ fontWeight: 400 }}>· {weekLabel}</span>
      </div>
      <div className="mk-bento-week">
        {week.map((d, i) => (
          <div key={i} className="mk-bento-day">
            <span className="mk-bento-day-name" style={d.isToday ? { fontWeight: 700, color: '#007A55' } : undefined}>
              {d.name}
            </span>
            <span className="mk-bento-day-num" style={d.isToday ? { background: '#009669', color: '#FFFFFF' } : undefined}>
              {d.num}
            </span>
            {d.event && (
              <span
                className="mk-bento-event mk-reveal mk-reveal--pop"
                style={{ ...revealDelay(400 + i * 180), background: d.event.bg, color: d.event.fg }}
              >
                {d.event.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxCard({ delays }: { delays: number[] }) {
  return (
    <div className="mk-bento-ui mk-bento-inbox">
      <div className="mk-bento-inbox-head mk-bento-strong">
        Inbox <span className="mk-bento-muted" style={{ fontWeight: 400 }}>· {delays.length} unread</span>
      </div>
      {INBOX.slice(0, delays.length).map((m, i) => (
        <div key={m.who} className="mk-bento-row mk-reveal" style={revealDelay(delays[i])}>
          <span className="mk-bento-av mk-bento-av--sm" style={{ background: m.bg, color: m.fg }}>
            {m.who}
          </span>
          <span className="mk-bento-ell" style={{ flex: 1, fontSize: 12 }}>
            {m.text}
          </span>
          <span className="mk-bento-muted" style={{ flex: 'none', fontSize: 11 }}>
            {m.time}
          </span>
          <span className="mk-bento-unread" />
        </div>
      ))}
    </div>
  );
}

/**
 * The next five business days (today highlighted) with due-date chips that pop in, beside the inbox
 * whose rows slide in. Pure CSS reveals; the component is client-side only for today's dates.
 * Phones stack the two cards and show two inbox rows.
 */
export function CalendarInboxScene() {
  return (
    <>
      <ScaleToFit width={792} grow className="mk-bento-desk">
        <CalendarCard />
        <InboxCard delays={[600, 820, 1040]} />
      </ScaleToFit>
      <div className="mk-bento-phone">
        <CalendarCard />
        <InboxCard delays={[900, 1120]} />
      </div>
    </>
  );
}
