/**
 * The header menus' icons, drawn in the Features bento's duotone language (feature-bento-icons.tsx):
 * an aqua→bottle body with white details, and an electric→teal badge ringed in white with an ink glyph.
 * Same 48-unit grid. Gradient ids come from useId, since the desktop dropdown and the phone menu can
 * both be in the page at once.
 */
import { useId, type ReactNode } from 'react';
import type { NavMenuItem } from './config';

const INK = '#05271C';
const WHITE = '#FFFFFF';

type Paint = { body: string; badge: string };

function Duotone({ size, children }: { size: number; children: (paint: Paint) => ReactNode }) {
  const id = `mkn${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className="mk-nav-icon"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}P`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2EE6C5" />
          <stop offset="1" stopColor="#009669" />
        </linearGradient>
        <linearGradient id={`${id}A`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7DFF77" />
          <stop offset="1" stopColor="#00C49A" />
        </linearGradient>
      </defs>
      {children({ body: `url(#${id}P)`, badge: `url(#${id}A)` })}
    </svg>
  );
}

/** A round badge in the corner, ringed in white so it reads as sitting in front of the body. */
function Badge({ cx, cy, r = 9, fill }: { cx: number; cy: number; r?: number; fill: string }) {
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={WHITE} strokeWidth="2.5" />;
}

const ink = { stroke: INK, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const DRAW: Record<NavMenuItem['icon'], (p: Paint) => ReactNode> = {
  /** How it works: a folder that becomes a Board (the badge's three columns). */
  flow: ({ body, badge }) => (
    <>
      <path d="M4 13a4 4 0 0 1 4-4h9.4a4 4 0 0 1 3 1.4l2.2 2.6H36a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill={body} />
      <path d="M4.5 19h35" stroke={WHITE} strokeOpacity="0.45" strokeWidth="2" />
      <Badge cx={37} cy={35.5} fill={badge} />
      <path d="M33.4 31.8v7.4M37 31.8v4.6M40.6 31.8v6" {...ink} />
    </>
  ),
  /** Features: tiles, with one more being added. */
  features: ({ body, badge }) => (
    <>
      <rect x="5" y="5" width="17" height="17" rx="4.5" fill={body} />
      <rect x="26" y="5" width="17" height="17" rx="4.5" fill={body} />
      <rect x="5" y="26" width="17" height="17" rx="4.5" fill={body} />
      <Badge cx={34.5} cy={34.5} r={9.5} fill={badge} />
      <path d="M34.5 30.2v8.6M30.2 34.5h8.6" {...ink} />
    </>
  ),
  /** Brio: the sparkle, with a small one beside it. */
  brio: ({ body, badge }) => (
    <>
      <path d="M19 7c1.5 8.8 6.2 13.5 15 15-8.8 1.5-13.5 6.2-15 15-1.5-8.8-6.2-13.5-15-15 8.8-1.5 13.5-6.2 15-15z" fill={body} />
      <path d="M14.2 19.6c1.7-.7 3-2 3.7-3.7" stroke={WHITE} strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M37.5 3.5c.8 4.6 2.9 6.7 7.5 7.5-4.6.8-6.7 2.9-7.5 7.5-.8-4.6-2.9-6.7-7.5-7.5 4.6-.8 6.7-2.9 7.5-7.5z"
        fill={badge}
        stroke={WHITE}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="38.5" cy="38.5" r="3.6" fill={badge} stroke={WHITE} strokeWidth="2" />
    </>
  ),
  /** Built on your Drive: the cloud your files stay in, with a check. */
  drive: ({ body, badge }) => (
    <>
      <path d="M13 37a8 8 0 0 1-1.4-15.88A11 11 0 0 1 33.6 20a8.5 8.5 0 0 1 .4 17z" fill={body} />
      <path d="M15.8 27.6a6 6 0 0 1 4.6-4.8" stroke={WHITE} strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round" />
      <Badge cx={37} cy={35.5} fill={badge} />
      <path d="M33.2 35.7l2.6 2.6 4.9-5.3" {...ink} />
    </>
  ),
  /** Who it's for: a person, and the client beside them. */
  people: ({ body, badge }) => (
    <>
      <circle cx="19" cy="15" r="7.5" fill={body} />
      <path d="M4.5 39.5C4.5 31.4 11 25.5 19 25.5s14.5 5.9 14.5 14a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5z" fill={body} />
      <Badge cx={37.5} cy={13} fill={badge} />
      <circle cx="37.5" cy="10.4" r="2.6" fill={INK} />
      <path d="M33.1 17.6c.8-2.4 2.5-3.8 4.4-3.8s3.6 1.4 4.4 3.8" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  /** Take the tour: the product in a window, with a play badge. */
  tour: ({ body, badge }) => (
    <>
      <rect x="4" y="7" width="35" height="29" rx="5.5" fill={body} />
      <rect x="4" y="7" width="35" height="8" rx="4" fill={WHITE} fillOpacity="0.22" />
      <circle cx="9.5" cy="11" r="1.4" fill={WHITE} fillOpacity="0.9" />
      <circle cx="14" cy="11" r="1.4" fill={WHITE} fillOpacity="0.9" />
      <circle cx="18.5" cy="11" r="1.4" fill={WHITE} fillOpacity="0.9" />
      <rect x="9" y="20" width="15" height="2.6" rx="1.3" fill={WHITE} fillOpacity="0.85" />
      <rect x="9" y="26" width="9" height="2.6" rx="1.3" fill={WHITE} fillOpacity="0.85" />
      <Badge cx={37} cy={35.5} r={9.5} fill={badge} />
      <path d="M35 31.6v7.8l6-3.9z" fill={INK} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
  /** Pricing: a price tag, with a check. */
  pricing: ({ body, badge }) => (
    <>
      <path
        d="M5 9a4 4 0 0 1 4-4h11.3a4 4 0 0 1 2.8 1.2l14.5 14.5a4 4 0 0 1 0 5.6L26.3 37.6a4 4 0 0 1-5.6 0L6.2 23.1A4 4 0 0 1 5 20.3z"
        fill={body}
      />
      <circle cx="14" cy="14" r="3.3" fill={WHITE} />
      <Badge cx={37} cy={36} fill={badge} />
      <path d="M33.2 36.2l2.6 2.6 4.9-5.3" {...ink} />
    </>
  ),
  /** FAQs: a question, with an answer on its way. */
  faq: ({ body, badge }) => (
    <>
      <path
        d="M5 21.5C5 13.5 12.6 7 22 7s17 6.5 17 14.5S31.4 36 22 36c-2.3 0-4.5-.4-6.5-1.1L7 38.5l2.3-6.9C6.6 29 5 25.4 5 21.5z"
        fill={body}
      />
      <path d="M18.4 17.6a3.7 3.7 0 1 1 5.3 3.3c-1.1.5-1.7 1.4-1.7 2.6v.7" stroke={WHITE} strokeWidth="2.7" strokeLinecap="round" />
      <circle cx="22" cy="29" r="1.75" fill={WHITE} />
      <Badge cx={38} cy={11} fill={badge} />
      <circle cx="34.6" cy="11" r="1.35" fill={INK} />
      <circle cx="38" cy="11" r="1.35" fill={INK} />
      <circle cx="41.4" cy="11" r="1.35" fill={INK} />
    </>
  ),
  /** Blog: an open book, with a pen. */
  blog: ({ body, badge }) => (
    <>
      <path d="M3.5 13c6.2-1.9 12.4-1.3 18.5 2.3v26.2c-6.1-3.4-12.3-4-18.5-2.1z" fill={body} />
      <path d="M44.5 13c-6.2-1.9-12.4-1.3-18.5 2.3v26.2c6.1-3.4 12.3-4 18.5-2.1z" fill={body} />
      <path d="M8 21.6c3.3-.6 6.5-.2 9.6 1.1M8 27.6c3.3-.6 6.5-.2 9.6 1.1" stroke={WHITE} strokeOpacity="0.85" strokeWidth="2.2" strokeLinecap="round" />
      <Badge cx={36.5} cy={11} fill={badge} />
      <path d="M33 14.6l.8-2.8 4.5-4.5a1.4 1.4 0 0 1 2 2l-4.5 4.5z" {...ink} strokeWidth="1.9" />
    </>
  ),
  /** Changelog: the release notes, with a "new" sparkle. */
  changelog: ({ body, badge }) => (
    <>
      <rect x="5" y="5" width="29" height="37" rx="5.5" fill={body} />
      <circle cx="11.5" cy="14" r="2" fill={WHITE} fillOpacity="0.9" />
      <rect x="16" y="12.7" width="12" height="2.6" rx="1.3" fill={WHITE} fillOpacity="0.85" />
      <circle cx="11.5" cy="22" r="2" fill={WHITE} fillOpacity="0.9" />
      <rect x="16" y="20.7" width="9" height="2.6" rx="1.3" fill={WHITE} fillOpacity="0.85" />
      <circle cx="11.5" cy="30" r="2" fill={WHITE} fillOpacity="0.9" />
      <rect x="16" y="28.7" width="6" height="2.6" rx="1.3" fill={WHITE} fillOpacity="0.85" />
      <Badge cx={36.5} cy={35.5} r={9.5} fill={badge} />
      <path d="M36.5 30c.5 3 1.7 4.1 4.6 4.6-2.9.5-4.1 1.6-4.6 4.6-.5-3-1.7-4.1-4.6-4.6 2.9-.5 4.1-1.6 4.6-4.6z" fill={INK} />
    </>
  ),
  /** Trust Center: a shield with a check, and a lock. */
  trust: ({ body, badge }) => (
    <>
      <path d="M22 4.5l15 5.6v11.2c0 9.8-6.4 17.7-15 20.9-8.6-3.2-15-11.1-15-20.9V10.1L22 4.5z" fill={body} />
      <path d="M16 22.5l4.3 4.3 8-8.5" stroke={WHITE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <Badge cx={37} cy={35.5} fill={badge} />
      <rect x="33.5" y="35" width="7" height="5.4" rx="1.3" fill={INK} />
      <path d="M35 35v-1.7a2 2 0 0 1 4 0V35" stroke={INK} strokeWidth="1.9" />
    </>
  ),
  /** Get in touch: an envelope, with a send arrow. */
  mail: ({ body, badge }) => (
    <>
      <rect x="4" y="9" width="35" height="26" rx="5.5" fill={body} />
      <path d="M7.5 13.5l13.2 9.8a2.2 2.2 0 0 0 2.6 0l13.2-9.8" stroke={WHITE} strokeOpacity="0.9" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <Badge cx={37.5} cy={35.5} fill={badge} />
      <path d="M33.4 35.5h7.6M38 32.3l3.2 3.2-3.2 3.2" {...ink} />
    </>
  ),
  /** Book a demo: a calendar, with a clock. */
  calendar: ({ body, badge }) => (
    <>
      <rect x="12" y="4" width="3.4" height="9" rx="1.7" fill={body} />
      <rect x="26" y="4" width="3.4" height="9" rx="1.7" fill={body} />
      <rect x="5" y="9" width="31" height="29" rx="6" fill={body} />
      <rect x="5" y="9" width="31" height="8" rx="4" fill={WHITE} fillOpacity="0.22" />
      <rect x="10" y="21.5" width="4.4" height="4.4" rx="1.2" fill={WHITE} fillOpacity="0.9" />
      <rect x="18.3" y="21.5" width="4.4" height="4.4" rx="1.2" fill={WHITE} fillOpacity="0.9" />
      <rect x="10" y="29.5" width="4.4" height="4.4" rx="1.2" fill={WHITE} fillOpacity="0.9" />
      <Badge cx={36.5} cy={35} r={9.5} fill={badge} />
      <path d="M36.5 31v4.4l2.8 1.8" {...ink} />
    </>
  ),
};

/** A header menu entry's icon. 34px in the dropdowns (as in the Features bento), 30px in the phone menu. */
export function NavIcon({ icon, size = 34 }: { icon: NavMenuItem['icon']; size?: number }) {
  return <Duotone size={size}>{DRAW[icon]}</Duotone>;
}
