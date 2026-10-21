/**
 * 5 · Feature bento: "Everything an engagement needs. Nothing it doesn’t."
 *
 * Six product scenes on pastel panels, on the page's one gray band. Desktop is the board's 3-column
 * bento (f1 spans two, f6 spans three and is short), tablets get two columns, phones stack the scenes
 * re-laid for a 350 px card. Each card is an MkCard (hover rim and spotlight, title nudge, art lift,
 * touch press) and plays its story once on first scroll-in; the audit log and Doc Search loop.
 *
 * Server component: the copy, icons and the Firm Overview bars (pure CSS reveals) render here; only the
 * scenes with a clock or today's dates are client components.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { Band, Eyebrow } from '../primitives';
import { MkCard } from '../motion';
import { IconAudit, IconCalendar, IconComments, IconOverview, IconReminders, IconSearch } from './feature-bento-icons';
import { ApprovalScene, AuditLogScene, CalendarInboxScene, DocSearchScene, ReminderScene } from './feature-bento-scenes';
import './feature-bento.css';

/** Reveal delay for an `mk-reveal` element (motion.tsx's `revealDelay`, which is client-only). */
const delay = (ms: number): CSSProperties => ({ ['--mk-delay' as string]: `${ms}ms` });

function BentoCard({
  id,
  icon,
  title,
  panel,
  children,
  scene,
}: {
  id: 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6';
  icon: ReactNode;
  title: string;
  /** Which pastel mesh the panel uses (the board's panel1–panel4). */
  panel: 1 | 2 | 3 | 4;
  /** The description. */
  children: ReactNode;
  scene: ReactNode;
}) {
  return (
    <MkCard className={`mk-bento-card mk-bento-${id}`}>
      <div className="mk-card-title-wrap mk-bento-head">
        <div className="mk-bento-title-row">
          {icon}
          <h3 className="mk-card-title mk-bento-title">{title}</h3>
        </div>
        <p className="mk-bento-desc">{children}</p>
      </div>
      <div aria-hidden="true" className={`mk-bento-panel mk-bento-panel--${panel}`}>
        <div className="mk-card-lift mk-bento-lift">{scene}</div>
      </div>
    </MkCard>
  );
}

/** Due-date bars, 15 of them; the two amber ones are at risk. */
const BARS: [height: number, atRisk?: boolean][] = [
  [38], [62], [30], [80], [54], [92, true], [46], [70], [34], [58], [86, true], [42], [66], [50], [74],
];

/** f3 · Firm Overview: the bars rise, staggered, on scroll-in. */
function OverviewScene() {
  return (
    <div className="mk-bento-ui mk-bento-sheet mk-bento-ov">
      <div className="mk-bento-ov-head">
        <span className="mk-bento-strong">Due in the next 30 days</span>
        <span className="mk-bento-muted" style={{ fontSize: 12 }}>
          All clients
        </span>
      </div>
      <div className="mk-bento-ov-total">9 deliverables</div>
      <div className="mk-bento-bars">
        {BARS.map(([h, risk], i) => (
          <span
            key={i}
            className="mk-reveal mk-reveal--bar"
            style={{ ...delay(300 + i * 55), height: `${h}%`, background: risk ? '#E5B33E' : '#00C49A' }}
          />
        ))}
      </div>
      <div className="mk-bento-legend">
        <span>
          <span style={{ color: '#00C49A' }}>●</span> On track 7
        </span>
        <span>
          <span style={{ color: '#E5B33E' }}>●</span> At risk 2
        </span>
      </div>
    </div>
  );
}

export function FeatureBentoSection({ id = 'features' }: { id?: string }) {
  return (
    <Band surface="gray" slant="both" id={id} className="mk-bento" aria-labelledby="mk-bento-title">
      <div className="mk-rail">
        <Eyebrow>THE WHOLE ENGAGEMENT</Eyebrow>
        <h2 id="mk-bento-title" className="mk-section mk-bento-h2">
          Everything an engagement needs. Nothing it doesn’t.
        </h2>

        <div className="mk-bento-grid">
          <BentoCard id="f1" icon={<IconComments />} title="Comments and approvals" panel={1} scene={<ApprovalScene />}>
            Threaded comments on each deliverable, and a sign-off your client clicks, not an email you search for later.
          </BentoCard>

          <BentoCard id="f2" icon={<IconReminders />} title="Client reminders" panel={2} scene={<ReminderScene />}>
            Nudge a client about what’s waiting on them, and set a follow-up date for every contact.
          </BentoCard>

          <BentoCard id="f3" icon={<IconOverview />} title="Firm Overview" panel={3} scene={<OverviewScene />}>
            Pipeline, engagement types and what’s due in the next 30 days, across every client.
          </BentoCard>

          <BentoCard id="f4" icon={<IconAudit />} title="Audit trail" panel={4} scene={<AuditLogScene />}>
            See who was given access to which files, and when, for every engagement. Changes made by <Brio fixedColor /> are
            logged too.
          </BentoCard>

          <BentoCard id="f5" icon={<IconSearch />} title="Doc Search" panel={2} scene={<DocSearchScene />}>
            Find any file across clients by type, client, engagement or date.
          </BentoCard>

          <BentoCard id="f6" icon={<IconCalendar />} title="Calendar and Inbox" panel={1} scene={<CalendarInboxScene />}>
            Every due date on one calendar, and every client comment in one inbox.
          </BentoCard>
        </div>
      </div>
    </Band>
  );
}
