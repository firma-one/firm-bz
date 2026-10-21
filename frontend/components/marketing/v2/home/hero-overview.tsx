/**
 * The hero's product screen: the real Engagement Overview for "Q2 – Product Launch Campaign" from the
 * /tour demo firm (Beacon Growth Partners), drawn at 1152 × 676 design pixels, plus the "Approved" Board
 * card that overlaps its lower-left corner. Static markup; dates come from `DemoDate`.
 */
import { Briefcase, Check, Home, Inbox, Search } from 'lucide-react';
import { Brio } from '@/components/ui/brio';
import { DemoDate } from '../demo-dates-context';

const MUTED = '#8D8B86';
const SIDE = '#55534E';

const sideItem = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', color: SIDE } as const;
const sub = { padding: '5px 8px 5px 24px', color: SIDE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const groupLabel = { padding: '14px 8px 4px', fontSize: 11.5, color: MUTED } as const;
const box = { border: '1px solid rgba(55,53,47,0.10)', borderRadius: 6 } as const;
const label = { marginTop: 12, fontSize: 10.5, letterSpacing: '0.06em', color: MUTED, fontWeight: 600 } as const;

function ActionTile({ name, count, hint, red }: { name: string; count: number; hint: string; red?: boolean }) {
  return (
    <div style={{ ...box, padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
        <span style={red ? { color: '#C2413B' } : undefined}>{name}</span>
        <span>{count}</span>
      </div>
      <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{hint}</div>
    </div>
  );
}

export function EngagementOverviewFrame() {
  return (
    <div
      style={{
        width: 1152,
        height: 676,
        display: 'flex',
        background: '#FFFFFF',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'var(--mk-shadow-frame)',
        fontFamily: 'var(--mk-font-body)',
        color: '#37352F',
        fontSize: 13,
        textAlign: 'left',
      }}
    >
      <div
        style={{
          width: 236,
          flex: 'none',
          background: '#F7F7F5',
          borderRight: '1px solid rgba(55,53,47,0.09)',
          padding: '12px 10px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontWeight: 600, fontSize: 13.5 }}>
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              background: '#2F3437',
              color: '#FFFFFF',
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            B
          </span>
          Beacon Growth Partners
        </div>
        <div style={{ ...sideItem, marginTop: 6 }}>
          <Search size={15} strokeWidth={1.8} aria-hidden />
          Search
        </div>
        <div style={sideItem}>
          <Home size={15} strokeWidth={1.8} aria-hidden />
          Home
        </div>
        <div style={sideItem}>
          <Inbox size={15} strokeWidth={1.8} aria-hidden />
          Inbox<span style={{ marginLeft: 'auto', fontSize: 11.5, color: MUTED }}>7</span>
        </div>
        <div style={groupLabel}>Your engagements</div>
        <div style={{ padding: '5px 8px', color: SIDE }}>Acme Robotics</div>
        <div style={sub}>Q2 – Go-To-Market Positioning</div>
        <div style={sub}>Q4 – Brand Refresh &amp; Visual Identity</div>
        <div style={{ padding: '5px 8px', color: SIDE }}>Horizon FinTech</div>
        <div style={sub}>Q3 – Growth Marketing Retainer</div>
        <div style={{ ...sub, color: '#37352F', fontWeight: 500, background: 'rgba(55,53,47,0.08)', borderRadius: 5 }}>Q2 – Product Launch Campaign</div>
        <div style={groupLabel}>Firm</div>
        {['Overview', 'Calendar', 'Doc Search', 'Members', 'Audit'].map((n) => (
          <div key={n} style={{ padding: '5px 8px', color: SIDE }}>
            {n}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            height: 44,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 8,
            color: MUTED,
            fontSize: 12.5,
            borderBottom: '1px solid rgba(55,53,47,0.06)',
          }}
        >
          Beacon Growth Partners<span>›</span>Horizon FinTech<span>›</span>
          <span style={{ color: '#37352F' }}>Q2 – Product Launch Campaign</span>
        </div>
        <div style={{ padding: '26px 36px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Briefcase size={24} strokeWidth={1.7} color="#55534E" aria-hidden />
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#37352F' }}>Q2 – Product Launch Campaign</span>
          </div>
          <div style={{ marginTop: 6, color: MUTED }}>Fixed price engagement · 17 files across 6 folders</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 14, alignItems: 'center', color: MUTED, fontSize: 12.5 }}>
            <span style={{ padding: '2px 8px', borderRadius: 4, background: '#E3EDFB', color: '#1F5FAF', fontWeight: 500 }}>● Active</span>
            <span>
              <DemoDate k="q2Start" />
            </span>
            <span>
              <DemoDate k="q2End" />
            </span>
            <span>Horizon FinTech</span>
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 22, borderBottom: '1px solid rgba(55,53,47,0.09)', color: MUTED }}>
            <span style={{ paddingBottom: 9, color: '#37352F', fontWeight: 500, borderBottom: '2px solid #37352F' }}>Overview</span>
            {['Files', 'Board 4', 'Comments', 'Audit', 'Members 4'].map((t) => (
              <span key={t} style={{ paddingBottom: 9 }}>
                {t}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 20, fontWeight: 600, fontSize: 14 }}>
            Action Center <span style={{ color: MUTED, fontWeight: 400 }}>4</span>
          </div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, maxWidth: 560 }}>
            <ActionTile name="Overdue" count={1} hint="not yet approved" red />
            <ActionTile name="Gaps" count={8} hint="no date or owner" />
            <ActionTile name="In review" count={1} hint="with the client" />
            <ActionTile name="Invites" count={1} hint="pending" />
          </div>
          <div style={{ marginTop: 22, fontWeight: 600, fontSize: 14 }}>
            Engagement Health <span style={{ color: MUTED, fontWeight: 400 }}>· Overall 71/100 · 4 deliverables</span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 14, maxWidth: 560 }}>
            <div style={{ ...box, width: 220, flex: 'none', padding: 14 }}>
              <div style={{ fontWeight: 500 }}>Overall health score</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <HealthRing size={78} />
                <div>
                  <div style={{ color: '#A86A06', fontWeight: 600, fontSize: 14 }}>Needs attention</div>
                  <div style={{ color: MUTED, marginTop: 3, fontSize: 12 }}>100 − 29 = 71</div>
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>● 1 overdue</span>
                  <span style={{ color: '#C2413B' }}>−15</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>● Behind pace</span>
                  <span style={{ color: '#A86A06' }}>−8</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>● Planning gaps</span>
                  <span style={{ color: MUTED }}>−6</span>
                </div>
              </div>
            </div>
            <div style={{ ...box, flex: 1, minWidth: 0, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>Engagement Summary</span>
                <span style={{ color: MUTED, fontSize: 12 }}>2d ago</span>
              </div>
              <div style={label}>SUMMARY</div>
              <div style={{ marginTop: 4, lineHeight: 1.55 }}>
                84% of the way through its timeline, with 14 days left, and 1 of 4 deliverables approved. Delivery is running behind the clock.
              </div>
              <div style={label}>PROGRESS</div>
              <div style={{ marginTop: 4, lineHeight: 1.55 }}>QPL-7 is approved. QPL-11 is with the client for review. QPL-16 is in progress.</div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, color: MUTED, fontSize: 11.5 }}>
                Written by{' '}
                <span style={{ color: '#009669' }}>
                  <Brio fixedColor />
                </span>{' '}
                · approved by Alex Jordan
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The 71/100 health ring, as in the app. */
export function HealthRing({ size, sub = true }: { size: number; sub?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="40" fill="none" stroke="#F0EFEC" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#E5B33E"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray="178.4 251.3"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y={sub ? 52 : 58} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={sub ? 24 : 27} fontWeight="700" fill="#37352F">
        71
      </text>
      {sub && (
        <text x="50" y="68" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fill={MUTED}>
          / 100
        </text>
      )}
    </svg>
  );
}

/** The Board card that just moved to Approved, overlapping the frame's lower-left corner. */
export function ApprovedCard() {
  return (
    <div
      style={{
        position: 'absolute',
        left: -36,
        bottom: -44,
        width: 292,
        background: '#FFFFFF',
        borderRadius: 12,
        padding: 12,
        boxShadow: '0 0 0 1px rgba(5,39,28,0.08), 0 28px 56px -18px rgba(3,40,27,0.40)',
        fontFamily: 'var(--mk-font-body)',
        fontSize: 12.5,
        color: '#37352F',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: '#E2F2E7',
            color: '#2F8F4E',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={12} strokeWidth={3} aria-hidden />
        </span>
        Approved<span style={{ color: MUTED, fontWeight: 400 }}>2/4</span>
        <span style={{ marginLeft: 'auto', fontWeight: 400, color: MUTED, fontSize: 11.5 }}>from In review</span>
      </div>
      <div style={{ ...box, marginTop: 10, padding: 10 }}>
        <div style={{ color: MUTED, fontSize: 11 }}>QPL-11</div>
        <div style={{ fontWeight: 500, marginTop: 2 }}>02 Creative &amp; Landing Page Assets</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: MUTED, fontSize: 11.5 }}>
          <span>
            <DemoDate k="d02" />
          </span>
          <span>SR Sam Rivera</span>
        </div>
        <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: '#EEEDEA' }}>
          <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#2F8F4E' }} />
        </div>
      </div>
    </div>
  );
}
