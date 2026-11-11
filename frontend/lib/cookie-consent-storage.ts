/**
 * Browser-only cookie preference storage (localStorage).
 * Used by the cookie banner, footer "Cookie settings", and consent-gated analytics.
 */

import type { AnalyticsMode } from './analytics-zone'

export const FM_COOKIE_CONSENT_KEY = 'fm_cookie_consent'

/**
 * Set when a visitor dismisses the analytics notice with OK. It records that they were told, not that
 * they consented, so it never stands in for `fm_cookie_consent` (app pages still ask).
 */
export const FM_ANALYTICS_NOTICE_SEEN_KEY = 'fm_analytics_notice_seen'

export const OPEN_COOKIE_SETTINGS_EVENT = 'fm-open-cookie-settings'
export const COOKIE_CONSENT_UPDATED_EVENT = 'fm-cookie-consent-updated'

export type StoredCookieConsent = {
  necessary: boolean
  analytics: boolean
  timestamp?: string
}

/** Banner UI state — necessary cookies are always on. */
export type CookieConsentUIPreferences = {
  necessary: true
  analytics: boolean
}

export function parseStoredCookieConsent(raw: string | null): StoredCookieConsent | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    if (typeof v !== 'object' || v === null) return null
    return {
      necessary: true,
      analytics: Boolean(v.analytics),
      timestamp: typeof v.timestamp === 'string' ? v.timestamp : undefined,
    }
  } catch {
    return null
  }
}

export function readCookieConsentFromStorage(): StoredCookieConsent | null {
  if (typeof window === 'undefined') return null
  return parseStoredCookieConsent(localStorage.getItem(FM_COOKIE_CONSENT_KEY))
}

/** Treat missing consent as no analytics (do not load GA until user opts in). */
export function analyticsConsentGranted(): boolean {
  const c = readCookieConsentFromStorage()
  return Boolean(c?.analytics)
}

export function preferencesFromStorageOrDefaults(): CookieConsentUIPreferences {
  const c = readCookieConsentFromStorage()
  if (!c) {
    return { necessary: true, analytics: false }
  }
  return {
    necessary: true,
    analytics: c.analytics,
  }
}

/**
 * Public pages, where a visitor in the notice zone gets Google Analytics without being asked
 * (.claude/plans/campaign-visit-counts.md). An allowlist, so a new app route stays opt-in by default.
 * App pages (`/d`, `/dash`, `/invite`, `/system`, `/auth`, `/checkout` and the rest) carry firm and
 * client names in their addresses and titles, so they keep the opt-in banner everywhere.
 */
const PUBLIC_ANALYTICS_PREFIXES = [
  '/landing',
  '/pricing',
  '/contact',
  '/privacy',
  '/terms',
  '/waitlist',
  '/resources',
  '/tour',
  '/signup',
  '/signin',
  '/go',
] as const

export function isPublicAnalyticsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (pathname === '/') return true
  return PUBLIC_ANALYTICS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** The browser's Global Privacy Control signal. When it's on, Google Analytics never loads. */
export function globalPrivacyControlOn(): boolean {
  if (typeof navigator === 'undefined') return false
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

/**
 * Whether Google Analytics may run, in this order:
 * 1. A saved choice wins, whichever way it went.
 * 2. Global Privacy Control means no.
 * 3. App pages need a saved Accept, so with no saved choice it's no.
 * 4. Public pages: yes in the notice zone, no in the consent zone.
 */
export function analyticsAllowed({
  mode,
  stored,
  gpc,
  pathname,
}: {
  mode: AnalyticsMode
  stored: StoredCookieConsent | null
  gpc: boolean
  pathname: string | null | undefined
}): boolean {
  if (stored) return stored.analytics
  if (gpc) return false
  if (!isPublicAnalyticsPath(pathname)) return false
  return mode === 'notice'
}

/**
 * Whether the analytics notice shows instead of the banner: the notice zone, a public page, no saved
 * choice, no Global Privacy Control (GA isn't running, so there's nothing to tell), and not yet
 * dismissed with OK.
 */
export function analyticsNoticeApplies({
  mode,
  stored,
  gpc,
  pathname,
}: {
  mode: AnalyticsMode
  stored: StoredCookieConsent | null
  gpc: boolean
  pathname: string | null | undefined
}): boolean {
  return mode === 'notice' && !stored && !gpc && isPublicAnalyticsPath(pathname)
}

export function readAnalyticsNoticeSeen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(FM_ANALYTICS_NOTICE_SEEN_KEY) !== null
  } catch {
    return false
  }
}

export function markAnalyticsNoticeSeen(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(FM_ANALYTICS_NOTICE_SEEN_KEY, new Date().toISOString())
  } catch {
    /* storage blocked: the notice shows again next visit, which is harmless */
  }
}

/**
 * The Cookie settings panel's starting state. With no saved choice, the analytics switch shows what is
 * actually happening: on where GA runs without asking (the notice zone's public pages), off elsewhere.
 */
export function preferencesForPanel(defaultAnalytics: boolean): CookieConsentUIPreferences {
  const c = readCookieConsentFromStorage()
  if (!c) return { necessary: true, analytics: defaultAnalytics }
  return { necessary: true, analytics: c.analytics }
}

export function dispatchCookieConsentUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT))
}

export function requestOpenCookieSettings(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_COOKIE_SETTINGS_EVENT))
}
