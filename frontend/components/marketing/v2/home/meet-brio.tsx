/**
 * Home §3 · Meet Brio: the dark slanted band. The intro (lockup, heading, paragraph and "How Brio is
 * kept in its lane") is static markup; "A day with Brio" is the client scroll story in
 * `meet-brio-timeline.tsx`.
 *
 * Phones follow the phone board: the shorter tagline and paragraph, and the three-point lane box after
 * the timeline instead of beside the intro.
 */
import type { ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { FILES_AGENT_PUBLIC } from '../config';
import { Band } from '../primitives';
import { MeetBrioTimeline } from './meet-brio-timeline';
import './meet-brio.css';

function LaneIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#7DFF77"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const LANE: { icon: ReactNode; text: string }[] = [
  {
    icon: (
      <>
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    text: 'Reads names, statuses and dates, never what’s inside a document or a comment.',
  },
  {
    icon: (
      <>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    text: 'Never changes anything without your consent.',
  },
  {
    icon: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
    text: 'Nothing reaches a client until a person on your team publishes it.',
  },
  {
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </>
    ),
    text: 'Leaves Mitigation and Next Steps to the engagement lead, by design.',
  },
];

const LANE_PHONE = [
  'Never reads what’s inside a document.',
  'Never changes anything without your consent.',
  'Nothing reaches a client until you publish it.',
];

/** Brio on the dark band: the name follows the text color, the sparkle is electric green. */
const BrioOnDark = ({ sparkle = false }: { sparkle?: boolean }) => (
  <Brio iconClassName={sparkle ? 'text-[#7DFF77] mk-sparkle' : 'text-[#7DFF77]'} />
);

export function MeetBrioSection() {
  return (
    <Band surface="dark" slant="both" id="brio" className="mk-brio" aria-labelledby="mk-brio-title">
      <div className="mk-rail">
        <div className="mk-brio-intro">
          <div className="mk-brio-intro-main">
            <p className="mk-brio-lockup">
              <BrioOnDark sparkle />
            </p>
            <p className="mk-brio-tagline">
              <span className="mk-brio-wide">The executive assistant for client delivery, built into firmä</span>
              <span className="mk-brio-narrow">The executive assistant for client delivery</span>
            </p>
            <h2 id="mk-brio-title" className="mk-brio-h2">
              <span className="mk-gradient-text">
                Meet <BrioOnDark />.
              </span>{' '}
              It already knows where every engagement stands.
            </h2>
            <p className="mk-brio-lede mk-brio-wide">
              <span className="mk-brio-on-white">
                <BrioOnDark />
              </span>{' '}
              reads the delivery data in your workspace (deliverables, due dates, statuses, who’s involved) and turns
              it into the brief you’d write yourself if you had the time. It answers in plain words
              {FILES_AGENT_PUBLIC ? ', drafts the client update, and keeps your files tidy' : ' and drafts the client update'}, and it
              always waits for you before anything changes.
            </p>
            <p className="mk-brio-lede mk-brio-narrow">
              It answers in plain words, drafts the client update
              {FILES_AGENT_PUBLIC ? ' and keeps your files tidy' : ''}, and it always waits for you before anything changes.
            </p>
          </div>

          <div className="mk-brio-lane mk-brio-wide">
            <p id="mk-brio-lane" className="mk-brio-lane-chip">
              HOW BRIO IS KEPT IN ITS LANE
            </p>
            <ul aria-labelledby="mk-brio-lane">
              {LANE.map((item) => (
                <li key={item.text}>
                  <LaneIcon>{item.icon}</LaneIcon>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mk-brio-day">
          <h3 id="mk-brio-day">
            A day with <BrioOnDark />
          </h3>
          <p>Four real moments from the demo firm. You make every call.</p>
        </div>

        <MeetBrioTimeline labelledBy="mk-brio-day" />

        <div className="mk-brio-lane mk-brio-lane--phone mk-brio-narrow">
          <ul aria-label="How Brio is kept in its lane">
            {LANE_PHONE.map((text) => (
              <li key={text}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7DFF77"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mk-brio-credits">
          25{' '}
          <span className="mk-brio-credits-name">
            <BrioOnDark />
          </span>{' '}
          credits a month on the free plan, 500 on Standard. One credit is one brief, summary or answer.
        </p>
      </div>
    </Band>
  );
}
