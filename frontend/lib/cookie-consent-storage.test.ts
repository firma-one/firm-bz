import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  analyticsAllowed,
  analyticsNoticeApplies,
  isPublicAnalyticsPath,
  globalPrivacyControlOn,
  markAnalyticsNoticeSeen,
  readAnalyticsNoticeSeen,
  preferencesForPanel,
  FM_ANALYTICS_NOTICE_SEEN_KEY,
  FM_COOKIE_CONSENT_KEY,
} from './cookie-consent-storage'

const accepted = { necessary: true, analytics: true }
const rejected = { necessary: true, analytics: false }

describe('isPublicAnalyticsPath', () => {
  it.each(['/', '/pricing', '/tour', '/tour/acme/home', '/signup', '/signin', '/go/abc', '/resources/guide', '/privacy'])(
    'treats %s as public',
    (p) => expect(isPublicAnalyticsPath(p)).toBe(true),
  )

  it.each(['/d', '/d/acme/f/x', '/dash', '/invite/abc', '/system/links', '/auth/callback', '/checkout', '/tourist', '/signups', null])(
    'treats %s as an app page',
    (p) => expect(isPublicAnalyticsPath(p)).toBe(false),
  )
})

describe('analyticsAllowed', () => {
  it('lets a saved choice win in either zone and on any page', () => {
    expect(analyticsAllowed({ mode: 'notice', stored: rejected, gpc: false, pathname: '/tour' })).toBe(false)
    expect(analyticsAllowed({ mode: 'consent', stored: accepted, gpc: false, pathname: '/d' })).toBe(true)
    expect(analyticsAllowed({ mode: 'consent', stored: accepted, gpc: true, pathname: '/tour' })).toBe(true)
  })

  it('never runs GA with Global Privacy Control and no saved choice', () => {
    expect(analyticsAllowed({ mode: 'notice', stored: null, gpc: true, pathname: '/tour' })).toBe(false)
  })

  it('keeps app pages opt-in in the notice zone', () => {
    expect(analyticsAllowed({ mode: 'notice', stored: null, gpc: false, pathname: '/d/acme' })).toBe(false)
  })

  it('runs GA on public pages in the notice zone only', () => {
    expect(analyticsAllowed({ mode: 'notice', stored: null, gpc: false, pathname: '/tour' })).toBe(true)
    expect(analyticsAllowed({ mode: 'consent', stored: null, gpc: false, pathname: '/tour' })).toBe(false)
  })
})

describe('analyticsNoticeApplies', () => {
  it('applies on a public page in the notice zone with no choice and no privacy signal', () => {
    expect(analyticsNoticeApplies({ mode: 'notice', stored: null, gpc: false, pathname: '/' })).toBe(true)
  })

  it('does not apply in the consent zone, on app pages, after a choice, or with the privacy signal', () => {
    expect(analyticsNoticeApplies({ mode: 'consent', stored: null, gpc: false, pathname: '/' })).toBe(false)
    expect(analyticsNoticeApplies({ mode: 'notice', stored: null, gpc: false, pathname: '/d' })).toBe(false)
    expect(analyticsNoticeApplies({ mode: 'notice', stored: rejected, gpc: false, pathname: '/' })).toBe(false)
    expect(analyticsNoticeApplies({ mode: 'notice', stored: null, gpc: true, pathname: '/' })).toBe(false)
  })
})

describe('notice seen and panel defaults', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
  })

  it('records the notice as seen under its own key, never as consent', () => {
    expect(readAnalyticsNoticeSeen()).toBe(false)
    markAnalyticsNoticeSeen()
    expect(readAnalyticsNoticeSeen()).toBe(true)
    expect(localStorage.getItem(FM_ANALYTICS_NOTICE_SEEN_KEY)).not.toBeNull()
    expect(localStorage.getItem(FM_COOKIE_CONSENT_KEY)).toBeNull()
  })

  it('starts the panel switch from the saved choice, or from what is running when there is none', () => {
    expect(preferencesForPanel(true).analytics).toBe(true)
    expect(preferencesForPanel(false).analytics).toBe(false)
    localStorage.setItem(FM_COOKIE_CONSENT_KEY, JSON.stringify(rejected))
    expect(preferencesForPanel(true).analytics).toBe(false)
  })

  it('reads the Global Privacy Control signal', () => {
    expect(globalPrivacyControlOn()).toBe(false)
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
    expect(globalPrivacyControlOn()).toBe(true)
  })
})
