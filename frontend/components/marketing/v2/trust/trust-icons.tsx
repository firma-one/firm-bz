/**
 * Trust Center icons: the home bento's duotone recipe (aqua→bottle body, electric→teal badge with a
 * white keyline), drawn for the five trust pillars. Server-safe. Gradient ids carry the `mkt-` prefix
 * so they stay unique on the page.
 */
import type { ReactNode } from 'react';

function Duotone({ id, children }: { id: string; children: ReactNode }) {
  return (
    <svg className="mk-trust-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
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

/** 01 · Non-custody: your folder, with a person badge (you own it). */
export function IconOwnership() {
  return (
    <Duotone id="mkt-1">
      <path
        d="M4.5 12.5A4.5 4.5 0 0 1 9 8h8.6c1.2 0 2.3.5 3.2 1.3l2.4 2.4c.8.8 2 1.3 3.2 1.3H35a4.5 4.5 0 0 1 4.5 4.5v16A4.5 4.5 0 0 1 35 38H9a4.5 4.5 0 0 1-4.5-4.5v-21z"
        fill="url(#mkt-1P)"
      />
      <rect x="4.5" y="17" width="35" height="5" fill="#FFFFFF" fillOpacity="0.22" />
      <circle cx="37" cy="35.5" r="9" fill="url(#mkt-1A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <circle cx="37" cy="32.8" r="2.7" fill="#05271C" />
      <path d="M32.3 40.4c.8-2.6 2.6-4.1 4.7-4.1s3.9 1.5 4.7 4.1" stroke="#05271C" strokeWidth="2.1" strokeLinecap="round" />
    </Duotone>
  );
}

/** 02 · Client experience: a branded portal window with a star badge. */
export function IconPortal() {
  return (
    <Duotone id="mkt-2">
      <rect x="4" y="7" width="36" height="30" rx="5.5" fill="url(#mkt-2P)" />
      <rect x="4" y="7" width="36" height="8" rx="4" fill="#FFFFFF" fillOpacity="0.22" />
      <circle cx="9.5" cy="11" r="1.5" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="14" cy="11" r="1.5" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="9" y="20" width="10" height="10" rx="2.5" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="22" y="20.5" width="12" height="2.6" rx="1.3" fill="#FFFFFF" fillOpacity="0.85" />
      <rect x="22" y="26.5" width="8" height="2.6" rx="1.3" fill="#FFFFFF" fillOpacity="0.85" />
      <circle cx="37.5" cy="36" r="9" fill="url(#mkt-2A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path
        d="M37.5 31.2l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z"
        fill="#05271C"
      />
    </Duotone>
  );
}

/** 03 · IP and confidentiality: a document with a padlock badge. */
export function IconConfidential() {
  return (
    <Duotone id="mkt-3">
      <path d="M10 4.5h16.5l9 9V39a3.5 3.5 0 0 1-3.5 3.5H10A3.5 3.5 0 0 1 6.5 39V8A3.5 3.5 0 0 1 10 4.5z" fill="url(#mkt-3P)" />
      <path d="M26.5 4.5v6.5a2.5 2.5 0 0 0 2.5 2.5h6.5" fill="#FFFFFF" fillOpacity="0.35" />
      <rect x="11.5" y="19" width="14" height="2.6" rx="1.3" fill="#FFFFFF" fillOpacity="0.85" />
      <rect x="11.5" y="25" width="9" height="2.6" rx="1.3" fill="#FFFFFF" fillOpacity="0.85" />
      <rect x="27" y="29" width="19" height="15" rx="4" fill="url(#mkt-3A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M31.5 29v-3a5 5 0 0 1 10 0v3" stroke="#FFFFFF" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M31.5 29v-3a5 5 0 0 1 10 0v3" stroke="url(#mkt-3A)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="36.5" cy="35.6" r="2" fill="#05271C" />
      <rect x="35.6" y="36" width="1.8" height="4" rx="0.9" fill="#05271C" />
    </Duotone>
  );
}

/** 04 · Analytics: an eye, with a download badge (views and downloads). */
export function IconViews() {
  return (
    <Duotone id="mkt-4">
      <path d="M2.5 22C7 13.6 14 9 22 9s15 4.6 19.5 13C37 30.4 30 35 22 35S7 30.4 2.5 22z" fill="url(#mkt-4P)" />
      <circle cx="22" cy="22" r="7.5" fill="#FFFFFF" fillOpacity="0.92" />
      <circle cx="22" cy="22" r="3.4" fill="url(#mkt-4P)" />
      <circle cx="37.5" cy="36" r="9" fill="url(#mkt-4A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M37.5 31.4v7.4M34.4 36l3.1 3.1 3.1-3.1" stroke="#05271C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Duotone>
  );
}

/** 05 · Permissions: a key, with a check badge (access you grant and take back). */
export function IconAccess() {
  return (
    <Duotone id="mkt-5">
      <circle cx="15" cy="17" r="10.5" fill="url(#mkt-5P)" />
      <circle cx="15" cy="17" r="3.8" fill="#FFFFFF" fillOpacity="0.92" />
      <path d="M21.5 23.5L35 37" stroke="url(#mkt-5P)" strokeWidth="6.5" strokeLinecap="round" />
      <path d="M28.5 30.5l3.4-3.4" stroke="url(#mkt-5P)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="37.5" cy="11.5" r="9" fill="url(#mkt-5A)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M33.6 11.7l2.7 2.7 5-5.4" stroke="#05271C" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </Duotone>
  );
}

/** "Talk to our team": a shield with a speech badge. */
export function IconSecurityTalk() {
  return (
    <Duotone id="mkt-6">
      <path d="M22 4.5l15 5.6v11.2c0 9.8-6.4 17.7-15 20.9-8.6-3.2-15-11.1-15-20.9V10.1L22 4.5z" fill="url(#mkt-6P)" />
      <path d="M15.8 22.6l4.3 4.3 8.3-8.9" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M29 33.5c0-4.4 3.9-8 8.7-8s8.7 3.6 8.7 8-3.9 8-8.7 8c-1.1 0-2.2-.2-3.2-.5l-4 1.7 1.1-3.4c-1.6-1.5-2.6-3.5-2.6-5.8z"
        fill="url(#mkt-6A)"
        stroke="#FFFFFF"
        strokeWidth="2.5"
      />
      <circle cx="34.2" cy="33.5" r="1.3" fill="#05271C" />
      <circle cx="37.7" cy="33.5" r="1.3" fill="#05271C" />
      <circle cx="41.2" cy="33.5" r="1.3" fill="#05271C" />
    </Duotone>
  );
}
