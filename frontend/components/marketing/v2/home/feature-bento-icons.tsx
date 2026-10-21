/**
 * The bento's six duotone icons (aqua→bottle body, electric→teal badge), copied from the board.
 * Server-safe. Gradient ids carry the `mkb-` prefix so they stay unique on the page.
 */
import type { ReactNode } from 'react';

function Duotone({ id, children }: { id: string; children: ReactNode }) {
  return (
    <svg className="mk-bento-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
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
      {children}
    </svg>
  );
}

/** f1 · Comments and approvals: a speech bubble with a check badge. */
export function IconComments() {
  return (
    <Duotone id="mkb-f1">
      <path
        d="M5 20.5C5 12.5 12.6 6 22 6s17 6.5 17 14.5S31.4 35 22 35c-2.3 0-4.5-.4-6.5-1.1L7 37.5l2.3-6.9C6.6 28 5 24.4 5 20.5z"
        fill="url(#mkb-f1P)"
      />
      <circle cx="15" cy="20.5" r="2.1" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="22" cy="20.5" r="2.1" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="29" cy="20.5" r="2.1" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="37.5" cy="11" r="9" fill="url(#mkb-f1A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M33.6 11.2l2.7 2.7 5-5.4" stroke="#05271C" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </Duotone>
  );
}

/** f2 · Client reminders: a bell with a clock badge. */
export function IconReminders() {
  return (
    <Duotone id="mkb-f2">
      <path
        d="M22 6c-6.8 0-11.8 5.3-11.8 12.3v7.4l-3.4 5.6c-.8 1.4.2 3.1 1.8 3.1h26.8c1.6 0 2.6-1.7 1.8-3.1l-3.4-5.6v-7.4C33.8 11.3 28.8 6 22 6z"
        fill="url(#mkb-f2P)"
      />
      <path d="M17.6 38.2a4.4 4.4 0 0 0 8.8 0z" fill="url(#mkb-f2P)" />
      <path d="M14.6 20.2c.3-3.4 2.6-6 5.8-6.7" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round" />
      <circle cx="37" cy="11.5" r="8.5" fill="url(#mkb-f2A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M37 7.6v4.2l2.7 1.7" stroke="#05271C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Duotone>
  );
}

/** f3 · Firm Overview: rising bars with a trend line. */
export function IconOverview() {
  return (
    <Duotone id="mkb-f3">
      <rect x="7" y="26" width="8.5" height="16" rx="3" fill="url(#mkb-f3P)" />
      <rect x="19.5" y="17" width="8.5" height="25" rx="3" fill="url(#mkb-f3P)" />
      <rect x="32" y="9" width="8.5" height="33" rx="3" fill="url(#mkb-f3P)" />
      <path d="M6 21l11.5-8 9.5 4.5L41 6.5" stroke="#FFFFFF" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 21l11.5-8 9.5 4.5L41 6.5" stroke="url(#mkb-f3A)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="41" cy="6.5" r="3.6" fill="url(#mkb-f3A)" stroke="#FFFFFF" strokeWidth="2" />
    </Duotone>
  );
}

/** f4 · Audit trail: a shield with a keyhole and a person badge. */
export function IconAudit() {
  return (
    <Duotone id="mkb-f4">
      <path d="M22 4.5l15 5.6v11.2c0 9.8-6.4 17.7-15 20.9-8.6-3.2-15-11.1-15-20.9V10.1L22 4.5z" fill="url(#mkb-f4P)" />
      <circle cx="22" cy="18.5" r="3.4" fill="#FFFFFF" />
      <rect x="20.5" y="19.5" width="3" height="8" rx="1.5" fill="#FFFFFF" />
      <circle cx="37" cy="35.5" r="9" fill="url(#mkb-f4A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <circle cx="37" cy="32.8" r="2.7" fill="#05271C" />
      <path d="M32.3 40.4c.8-2.6 2.6-4.1 4.7-4.1s3.9 1.5 4.7 4.1" stroke="#05271C" strokeWidth="2.1" strokeLinecap="round" />
    </Duotone>
  );
}

/** f5 · Doc Search: a document under a magnifier. */
export function IconSearch() {
  return (
    <Duotone id="mkb-f5">
      <path d="M10 4.5h16.5l9 9V39a3.5 3.5 0 0 1-3.5 3.5H10A3.5 3.5 0 0 1 6.5 39V8A3.5 3.5 0 0 1 10 4.5z" fill="url(#mkb-f5P)" />
      <path d="M26.5 4.5v6.5a2.5 2.5 0 0 0 2.5 2.5h6.5" fill="#FFFFFF" fillOpacity="0.35" />
      <rect x="11.5" y="19" width="14" height="2.6" rx="1.3" fill="#FFFFFF" fillOpacity="0.85" />
      <rect x="11.5" y="25" width="9" height="2.6" rx="1.3" fill="#FFFFFF" fillOpacity="0.85" />
      <circle cx="34" cy="32" r="7.6" stroke="#FFFFFF" strokeWidth="8" />
      <path d="M39.6 37.6l4.6 4.6" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
      <circle cx="34" cy="32" r="7.6" fill="#FFFFFF" stroke="url(#mkb-f5A)" strokeWidth="4" />
      <path d="M39.6 37.6l4.6 4.6" stroke="url(#mkb-f5A)" strokeWidth="4" strokeLinecap="round" />
    </Duotone>
  );
}

/** f6 · Calendar and Inbox: a calendar with an inbox tray badge. */
export function IconCalendar() {
  return (
    <Duotone id="mkb-f6">
      <rect x="12" y="4" width="3.4" height="9" rx="1.7" fill="url(#mkb-f6P)" />
      <rect x="26" y="4" width="3.4" height="9" rx="1.7" fill="url(#mkb-f6P)" />
      <rect x="5" y="9" width="31" height="29" rx="6" fill="url(#mkb-f6P)" />
      <rect x="5" y="9" width="31" height="8" rx="4" fill="#FFFFFF" fillOpacity="0.22" />
      <rect x="10" y="21.5" width="4.4" height="4.4" rx="1.2" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="18.3" y="21.5" width="4.4" height="4.4" rx="1.2" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="10" y="29.5" width="4.4" height="4.4" rx="1.2" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="25.5" y="25" width="19" height="17" rx="4.5" fill="url(#mkb-f6A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M28.5 33h3.6l2 3h5l2-3h3.4" stroke="#05271C" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </Duotone>
  );
}

/** The small UI glyphs used inside the scenes (file, search, check). */
export function FileGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B7FE0" strokeWidth="2" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function SearchGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8D8B86" strokeWidth="2" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function CheckGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
