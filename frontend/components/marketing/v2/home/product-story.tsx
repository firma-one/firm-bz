/**
 * 4 · Product story ("How it works"), on a white band.
 *
 * Desktop and tablet: one tabbed showcase (01 Connect · 02 Plan · 03 Share · 04 Steer), each tab with
 * its real screen on the pastel stage; it auto-advances every 6 s (see StoryTabs). Phone: no carousel.
 * Step 02 shows in full with its Board's four columns stacked as cards, then 01, 03 and 04 as cards.
 *
 * The screens are static markup rendered here on the server; dates are relative to today (DemoDate).
 */
import { Fragment, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { BRAND_NAME } from '@/config/brand';
import { DemoDate } from '../demo-dates-context';
import { Band, Eyebrow } from '../primitives';
import { GoogleDriveIcon } from '../storage-icons';
import { StoryScale } from './product-story-scale';
import { StoryTabs, type StoryStep } from './product-story-tabs';
import './product-story.css';

type DateKey = ComponentProps<typeof DemoDate>['k'];

const STEPS: StoryStep[] = [
  { num: '01', label: 'Connect', title: 'Start from the folders you already have.' },
  { num: '02', label: 'Plan', title: 'Every deliverable on one Board.' },
  { num: '03', label: 'Share', title: 'Your brand in front. Your Drive behind.' },
  { num: '04', label: 'Steer', title: 'Know which engagement needs you today.' },
];

/* ── Product UI tokens (the app's own colors inside the screens) ─────────────────────────────── */

const UI: CSSProperties = { fontFamily: 'var(--mk-font-body)', fontSize: 13, color: '#37352F' };
const FRAME_SHADOW = '0 0 0 1px rgba(5,39,28,0.08), 0 30px 60px -30px rgba(3,40,27,0.45)';
const CHIP: CSSProperties = {
  position: 'absolute',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px',
  borderRadius: 999,
  background: '#FFFFFF',
  boxShadow: '0 0 0 1px rgba(0,150,105,0.3), 0 14px 28px -12px rgba(3,40,27,0.4)',
  fontSize: 13,
  color: '#37352F',
};
const MUTED = '#8D8B86';

/** Brio inside product UI: sparkle and name in green. */
function BrioUi({ children }: { children?: ReactNode }) {
  return (
    <span style={{ color: '#009669' }}>
      <Brio fixedColor />
      {children}
    </span>
  );
}

const CheckIcon = ({ size, color, width }: { size: number; color: string; width: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/* ── Board data (baseVals().cols) ─────────────────────────────────────────────────────────────── */

type BoardColumn = {
  name: string;
  count: string;
  dot: string;
  tile: string;
  card: { id: string; title: string; date: DateKey; dateShort: DateKey; who: string; name: string; prog: string; pct: string; bar: string };
};

const COLUMNS: BoardColumn[] = [
  {
    name: 'To Do',
    count: '1/4',
    dot: '#C9C8C4',
    tile: '#EFEFED',
    card: { id: 'QPL-20', title: '04 Post-Launch Retrospective Report', date: 'q2End', dateShort: 'q2EndShort', who: 'TK', name: 'Taylor Kim', prog: '1/3', pct: '33%', bar: '#55534E' },
  },
  {
    name: 'In Progress',
    count: '1/4',
    dot: '#5B7FE0',
    tile: '#E3EDFB',
    card: { id: 'QPL-16', title: '03 PR & Media Outreach Pack', date: 'd03', dateShort: 'd03Short', who: 'JL', name: 'Jordan Lee', prog: '1/3', pct: '33%', bar: '#2F5FB0' },
  },
  {
    name: 'In Review',
    count: '1/4',
    dot: '#E5B33E',
    tile: '#FBF0D9',
    card: { id: 'QPL-11', title: '02 Creative & Landing Page Assets', date: 'd02', dateShort: 'd02Short', who: 'SR', name: 'Sam Rivera', prog: '2/4', pct: '50%', bar: '#8A6A1F' },
  },
  {
    name: 'Approved',
    count: '1/4',
    dot: '#2F8F4E',
    tile: '#E2F2E7',
    card: { id: 'QPL-7', title: '01 GTM Plan & Launch Readiness Kit', date: 'd01', dateShort: 'd01Short', who: 'AJ', name: 'Alex Jordan', prog: '3/3', pct: '100%', bar: '#2F8F4E' },
  },
];

/* ── 01 Connect: the folder picker ────────────────────────────────────────────────────────────── */

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

function FolderRow({ name, files, first = false }: { name: string; files: string; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 6, background: '#EEF6F1', marginTop: first ? 0 : 4 }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, background: '#047857', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <CheckIcon size={11} color="#FFFFFF" width={3.2} />
      </span>
      <FolderIcon />
      <span style={{ fontWeight: 500 }}>{name}</span>
      <span style={{ marginLeft: 'auto', color: MUTED, fontSize: 12 }}>{files}</span>
    </div>
  );
}

function ConnectScreen() {
  return (
    <div
      role="img"
      aria-label="Folder picker: three Horizon FinTech folders selected for the Q2 Product Launch Campaign; an internal folder left unshared. Brio offers to answer what is still in Drafts."
      style={{ position: 'relative', width: '100%', maxWidth: 600, padding: '0 0 44px', boxSizing: 'border-box' }}
    >
      <div style={{ ...UI, background: '#FFFFFF', borderRadius: 12, boxShadow: FRAME_SHADOW, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(55,53,47,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <GoogleDriveIcon size={16} color="#55534E" />
          <span style={{ fontWeight: 600 }}>Choose folders</span>
          <span style={{ marginLeft: 'auto', color: MUTED, fontSize: 12 }}>My Drive › Clients › Horizon FinTech</span>
        </div>
        <div style={{ padding: 8 }}>
          <FolderRow name="01 Strategy & Launch Plan" files="4 files" first />
          <FolderRow name="02 Creative & Landing Pages" files="6 files" />
          <FolderRow name="03 PR & Media" files="7 files" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 6, marginTop: 4, color: MUTED }}>
            <span style={{ width: 16, height: 16, boxSizing: 'border-box', borderRadius: 4, border: '1px solid #C9C8C4' }} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Internal – pricing &amp; notes</span>
            <span style={{ marginLeft: 'auto', fontSize: 12 }}>not shared</span>
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(55,53,47,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: MUTED, fontSize: 12 }}>3 folders · 17 files · stay in your Drive</span>
          <span style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 5, background: '#047857', color: '#FFFFFF', fontWeight: 500, fontSize: 12.5 }}>
            Map to Q2 – Product Launch
          </span>
        </div>
      </div>
      <span style={{ ...CHIP, right: 22, bottom: 18 }}>
        <span style={{ color: '#009669', fontWeight: 600 }}>
          Ask <Brio fixedColor />:
        </span>
        <span>“What’s still in Drafts?”</span>
      </span>
    </div>
  );
}

/* ── 02 Plan: the Board ───────────────────────────────────────────────────────────────────────── */

function PlanScreen() {
  return (
    <div style={{ position: 'relative', width: '100%', padding: '0 0 52px', boxSizing: 'border-box' }}>
      {/* 1000 px content + 48 px padding: the board's narrowest layout before it scales. */}
      <StoryScale min={1048}>
        <div
          role="img"
          aria-label="Board for Q2 – Product Launch Campaign with four columns: To Do, In Progress, In Review and Approved, one deliverable card in each."
          style={{ ...UI, minWidth: 1000, boxSizing: 'content-box', background: '#FFFFFF', borderRadius: 12, boxShadow: FRAME_SHADOW, padding: '22px 24px 28px' }}
        >
          <div style={{ display: 'flex', gap: 22, color: MUTED, borderBottom: '1px solid rgba(55,53,47,0.09)' }}>
            <span style={{ paddingBottom: 9 }}>Overview</span>
            <span style={{ paddingBottom: 9 }}>Files</span>
            <span style={{ paddingBottom: 9, color: '#37352F', fontWeight: 500, borderBottom: '2px solid #37352F' }}>Board 4</span>
            <span style={{ paddingBottom: 9 }}>Comments</span>
            <span style={{ paddingBottom: 9 }}>Audit</span>
            <span style={{ paddingBottom: 9 }}>Members 4</span>
          </div>
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
            {COLUMNS.map(({ name, count, dot, tile, card }) => (
              <div key={name} style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 9, borderBottom: `2px solid ${dot}`, fontWeight: 600 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, background: tile }} />
                  {name}
                  <span style={{ color: MUTED, fontWeight: 400 }}>{count}</span>
                </div>
                <div style={{ marginTop: 12, border: '1px solid rgba(55,53,47,0.10)', borderRadius: 6, padding: '10px 12px', boxShadow: '0 1px 2px rgba(15,15,15,0.04)' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 6, background: tile }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: MUTED, fontSize: 11 }}>{card.id}</div>
                      <div style={{ fontWeight: 500, marginTop: 1, lineHeight: 1.35 }}>{card.title}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, color: MUTED, fontSize: 12 }}>
                    <span>
                      <DemoDate k={card.date} />
                    </span>
                    <span>
                      <span
                        style={{
                          display: 'inline-flex',
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          background: '#EFEFED',
                          color: '#55534E',
                          fontSize: 9,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 4,
                        }}
                      >
                        {card.who}
                      </span>
                      {card.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#EEEDEA' }}>
                      <div style={{ width: card.pct, height: 4, borderRadius: 2, background: card.bar }} />
                    </div>
                    <span style={{ color: MUTED, fontSize: 11.5 }}>{card.prog}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </StoryScale>
      <span style={{ ...CHIP, right: 0, bottom: 0 }}>
        <BrioUi>:</BrioUi>
        <span>1 overdue, 8 planning gaps. Want the list?</span>
      </span>
    </div>
  );
}

/* ── 03 Share: the client's branded view ──────────────────────────────────────────────────────── */

function Comment({ initials, bg, fg, name, when, text }: { initials: string; bg: string; fg: string; name: string; when: DateKey; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span
        style={{
          width: 22,
          height: 22,
          flex: 'none',
          borderRadius: 11,
          background: bg,
          color: fg,
          fontSize: 9.5,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {initials}
      </span>
      <div style={{ lineHeight: 1.45 }}>
        <span style={{ fontWeight: 500 }}>{name}</span>{' '}
        <span style={{ color: MUTED, fontSize: 11.5 }}>
          <DemoDate k={when} />
        </span>
        <br />
        {text}
      </div>
    </div>
  );
}

function ShareScreen() {
  return (
    <div
      role="img"
      aria-label="The client’s branded view: a status update drafted by Brio and published by Alex Jordan, and deliverables, one awaiting the client’s approval with a comment thread and a reminder."
      style={{ width: '100%', maxWidth: 600, boxSizing: 'border-box' }}
    >
      <div style={{ ...UI, background: '#FFFFFF', borderRadius: 12, overflow: 'hidden', boxShadow: FRAME_SHADOW }}>
        <div style={{ background: '#0F4C5C', color: '#FFFFFF', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: '#FFFFFF',
              color: '#0F4C5C',
              fontWeight: 700,
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            BG
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Beacon Growth Partners</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Q2 – Product Launch Campaign · for Horizon FinTech</div>
          </div>
        </div>
        <div style={{ padding: '6px 8px' }}>
          <div style={{ margin: '4px 2px 6px', padding: '10px 12px', borderRadius: 8, background: '#F2F8F5', border: '1px solid rgba(0,150,105,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>
                Status update · <DemoDate k="c8" />
              </span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: '#007A55', fontSize: 11.5 }}>
                Drafted by <Brio fixedColor /> · published by Alex Jordan
              </span>
            </div>
            <div style={{ marginTop: 4, color: '#55534E', lineHeight: 1.5 }}>
              1 of 4 deliverables approved. Creative &amp; Landing Page Assets is with you for review.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                background: '#E2F2E7',
                color: '#2F8F4E',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckIcon size={12} color="currentColor" width={3} />
            </span>
            <span>01 GTM Plan &amp; Launch Readiness Kit</span>
            <span style={{ marginLeft: 'auto', color: '#2F8F4E', fontSize: 12, fontWeight: 500 }}>Approved</span>
          </div>
          <div style={{ padding: 10, borderRadius: 8, background: '#FBFAF7', border: '1px solid rgba(55,53,47,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, background: '#FBF0D9', display: 'inline-flex' }} />
              <span style={{ fontWeight: 500 }}>02 Creative &amp; Landing Page Assets</span>
              <span style={{ marginLeft: 'auto', color: '#A86A06', fontSize: 12, fontWeight: 500 }}>Awaiting your approval</span>
            </div>
            <div style={{ margin: '10px 0 0 30px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Comment initials="SR" bg="#EFEFED" fg="#55534E" name="Sam Rivera" when="c6" text="Final landing page and three ad sizes are in the folder." />
              <Comment initials="MC" bg="#FBE4D6" fg="#9A4A16" name="Megan Carter" when="c8" text="Copy reads well. Approving today." />
            </div>
            <div style={{ margin: '12px 0 0 30px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ padding: '7px 14px', borderRadius: 5, background: '#047857', color: '#FFFFFF', fontWeight: 500 }}>Approve</span>
              <span style={{ padding: '7px 14px', borderRadius: 5, border: '1px solid rgba(55,53,47,0.16)' }}>Comment</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, color: MUTED, fontSize: 11.5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                Reminder sent <DemoDate k="c7" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 04 Steer: Firm Overview (baseVals().rows) ────────────────────────────────────────────────── */

type OverviewRow = {
  name: string;
  sub: string;
  deliv: string;
  dcol: string;
  time: string;
  tpct: string;
  tcol: string;
  due: DateKey;
  sbg: string;
  sfg: string;
  status: string;
};

const BEHIND = { sbg: '#FBE4D6', sfg: '#9A4A16', status: 'Behind pace' };
const ROWS: OverviewRow[] = [
  { name: 'Q2 – Product Launch Campaign', sub: 'Horizon FinTech · Alex Jordan', deliv: '1 of 4 approved · 1 overdue', dcol: '#C2413B', time: '14 days left · 85% used', tpct: '85%', tcol: '#E5B33E', due: 'q2EndShort', ...BEHIND },
  { name: 'Q3 – Growth Marketing Retainer', sub: 'Horizon FinTech · Alex Jordan', deliv: '1 of 4 approved · 1 overdue', dcol: '#C2413B', time: '21 days left · 77% used', tpct: '77%', tcol: '#5B7FE0', due: 'r2Due', ...BEHIND },
  { name: 'Q2 – Go-To-Market Positioning', sub: 'Acme Robotics · Alex Jordan', deliv: '1 of 4 approved', dcol: MUTED, time: '45 days left · 51% used', tpct: '51%', tcol: '#5B7FE0', due: 'r3Due', ...BEHIND },
  {
    name: 'Q4 – Brand Refresh & Visual Identity',
    sub: 'Acme Robotics · Alex Jordan',
    deliv: '1 of 4 approved',
    dcol: MUTED,
    time: '60 days left · 34% used',
    tpct: '34%',
    tcol: '#5B7FE0',
    due: 'r4Due',
    sbg: '#FBF0D9',
    sfg: '#8A5A00',
    status: 'Slightly behind',
  },
];
const ROW_GRID: CSSProperties = { display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1.6fr 1fr', gap: '0 20px' };
const STAGE_COLORS = ['#E5B33E', '#5B7FE0', '#8F86E0', '#2F8F4E'];

function ActionItem({ title, sub, count, attention = false }: { title: string; sub: string; count: string; attention?: boolean }) {
  return (
    <div style={{ border: '1px solid rgba(55,53,47,0.10)', borderRadius: 6, padding: '10px 12px', display: 'flex', justifyContent: 'space-between' }}>
      <span>
        <span style={{ fontWeight: 500 }}>{title}</span>
        <br />
        <span style={attention ? { color: '#A86A06', fontSize: 12, fontWeight: 500 } : { color: MUTED, fontSize: 12 }}>{sub}</span>
      </span>
      <span style={{ fontWeight: 600 }}>{count}</span>
    </div>
  );
}

function SteerScreen() {
  return (
    <div style={{ position: 'relative', width: '100%', padding: '0 0 56px', boxSizing: 'border-box' }}>
      {/* 1000 px content + 52 px padding. */}
      <StoryScale min={1052}>
        <div
          role="img"
          aria-label="Firm Overview: Action Center items and the active engagements table with deliverable, time and pace status for four engagements, with Brio’s brief."
          style={{ ...UI, minWidth: 1000, boxSizing: 'content-box', background: '#FFFFFF', borderRadius: 12, boxShadow: FRAME_SHADOW, padding: '24px 26px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#55534E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </svg>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Overview</span>
            <span style={{ marginLeft: 'auto', color: MUTED, fontSize: 12.5 }}>Beacon Growth Partners · 2 clients · 4 engagements</span>
          </div>
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <ActionItem title="Reply to client comments" sub="The client wrote last" count="1" />
            <ActionItem title="Resend invitations" sub="Expired, or expiring within 3 days" count="1" />
            <ActionItem title="Engagements" sub="4 need attention" count="4" attention />
          </div>
          <div style={{ marginTop: 20, fontWeight: 600, fontSize: 14 }}>Active engagements</div>
          <div style={{ ...ROW_GRID, marginTop: 8, color: MUTED, fontSize: 12, padding: '8px 0', borderBottom: '1px solid rgba(55,53,47,0.09)' }}>
            <span>Engagement</span>
            <span>Deliverables</span>
            <span>Time</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>
          {ROWS.map((row) => (
            <div key={row.name} style={{ ...ROW_GRID, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(55,53,47,0.06)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    flex: 'none',
                    borderRadius: 12,
                    background: '#EFEFED',
                    color: '#55534E',
                    fontSize: 9.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  AJ
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{row.name}</div>
                  <div style={{ color: MUTED, fontSize: 12 }}>{row.sub}</div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {STAGE_COLORS.map((c) => (
                    <span key={c} style={{ flex: 1, height: 6, borderRadius: 2, background: c }} />
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: row.dcol }}>{row.deliv}</div>
              </div>
              <div>
                <div style={{ height: 6, borderRadius: 3, background: '#EEEDEA' }}>
                  <div style={{ width: row.tpct, height: 6, borderRadius: 3, background: row.tcol }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: MUTED }}>{row.time}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: row.sbg, color: row.sfg, fontSize: 12, fontWeight: 500 }}>
                  {row.status}
                </span>
                <div style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                  Due <DemoDate k={row.due} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </StoryScale>
      <span style={{ ...CHIP, right: 0, bottom: 0, maxWidth: 560 }}>
        <BrioUi />
        <span>
          <strong style={{ fontWeight: 600 }}>Today’s brief:</strong> Horizon FinTech carries the largest share, $44.5K. Q2 – Product Launch finishes
          next, in 14 days.
        </span>
      </span>
    </div>
  );
}

/* ── Desktop and tablet panels ────────────────────────────────────────────────────────────────── */

const PANELS: ReactNode[] = [
  <Fragment key="panel-1">
    <p className="mk-story-copy">
      Sign in with Google or Microsoft and pick the folders for a client. {BRAND_NAME} maps them to Client → Engagement → Deliverable. Nothing is copied
      or moved, and you don’t need an IT admin.
    </p>
    <ConnectScreen />
  </Fragment>,
  <Fragment key="panel-2">
    <p className="mk-story-copy">
      Each deliverable gets an owner, a due date and a status: to do, in progress, in review, approved. Your team and your client look at the same Board,
      so nobody has to ask.
    </p>
    <PlanScreen />
  </Fragment>,
  <Fragment key="panel-3">
    <p className="mk-story-copy">
      Clients open a view in your firm’s brand that shows only what you’ve shared. They read the update <Brio fixedColor /> drafted and you published,
      comment on the deliverable, approve it in one click, and get a reminder when something is waiting on them.
    </p>
    <ShareScreen />
  </Fragment>,
  <Fragment key="panel-4">
    <p className="mk-story-copy">
      Health scores pace, overdue work and planning gaps. The Action Center lists what to do next, the Firm Overview rolls it up across every client, and
      the brief from <Brio fixedColor /> tells you in two sentences.
    </p>
    <SteerScreen />
  </Fragment>,
];

/* ── Phone ────────────────────────────────────────────────────────────────────────────────────── */

function PhoneBoard() {
  return (
    <div className="mk-story-phone-panel">
      <div
        role="img"
        aria-label="Board for Q2 – Product Launch Campaign: To Do, In Progress, In Review and Approved, one deliverable in each."
        style={{ ...UI, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {COLUMNS.map(({ name, count, dot, tile, card }) => (
          <div key={name} style={{ background: '#FFFFFF', borderRadius: 12, padding: 12, boxShadow: '0 0 0 1px rgba(5,39,28,0.08), 0 16px 30px -20px rgba(3,40,27,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 8, borderBottom: `2px solid ${dot}`, fontWeight: 600 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: tile }} />
              {name}
              <span style={{ color: MUTED, fontWeight: 400 }}>{count}</span>
            </div>
            <div style={{ marginTop: 10, border: '1px solid rgba(55,53,47,0.10)', borderRadius: 6, padding: 10 }}>
              <div style={{ color: MUTED, fontSize: 11 }}>{card.id}</div>
              <div style={{ fontWeight: 500, marginTop: 2, lineHeight: 1.35 }}>{card.title}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, color: MUTED, fontSize: 11.5 }}>
                <span>
                  <DemoDate k={card.dateShort} />
                </span>
                <span>{card.name}</span>
              </div>
              <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: '#EEEDEA' }}>
                <div style={{ width: card.pct, height: 4, borderRadius: 2, background: card.bar }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 999,
          background: '#FFFFFF',
          boxShadow: '0 0 0 1px rgba(0,150,105,0.3)',
          fontSize: 12.5,
          color: '#37352F',
        }}
      >
        <BrioUi>:</BrioUi>
        <span>1 overdue, 8 planning gaps.</span>
      </div>
    </div>
  );
}

function PhoneStory() {
  const plan = STEPS[1];
  return (
    <div className="mk-story-phone">
      <div className="mk-story-phone-head">
        <span className="mk-story-num">{plan.num}</span>
        <span className="mk-story-phone-label">{plan.label}</span>
      </div>
      <h3 className="mk-story-phone-title">{plan.title}</h3>
      <p className="mk-story-phone-copy">An owner, a due date and a status for each one. Your team and your client see the same Board.</p>
      <PhoneBoard />
      <ul className="mk-story-phone-steps">
        {STEPS.filter((s) => s !== plan).map((s) => (
          <li key={s.num} className="mk-story-phone-step">
            <span className="mk-story-num">{s.num}</span>
            <span>{s.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────────────────────────────────── */

export function ProductStorySection() {
  return (
    <Band surface="white" id="product" className="mk-story" aria-labelledby="mk-story-title">
      <div className="mk-rail">
        <Eyebrow>HOW IT WORKS</Eyebrow>
        <h2 id="mk-story-title" className="mk-section mk-story-title">
          Clients shouldn’t have to ask “is this done?”
        </h2>
        <p className="mk-story-lede">
          {BRAND_NAME} gives every engagement one place where the work, its status and the conversation live together, and <Brio fixedColor /> keeps an
          eye on all of it.
        </p>
        <StoryTabs steps={STEPS} panels={PANELS} />
        <PhoneStory />
      </div>
    </Band>
  );
}
