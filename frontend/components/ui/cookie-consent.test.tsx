import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CookieConsent } from './cookie-consent'
import { AnalyticsModeProvider } from '@/components/analytics/analytics-mode-context'
import type { AnalyticsMode } from '@/lib/analytics-zone'
import { FM_ANALYTICS_NOTICE_SEEN_KEY, FM_COOKIE_CONSENT_KEY } from '@/lib/cookie-consent-storage'

let pathname = '/tour'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const renderIn = (mode: AnalyticsMode) => {
  const view = render(<AnalyticsModeProvider mode={mode}><CookieConsent /></AnalyticsModeProvider>)
  act(() => { vi.advanceTimersByTime(600) })
  return view
}
const notice = () => screen.queryByRole('region', { name: 'Analytics notice' })
const banner = () => screen.queryByText('Your privacy')
const setGpc = (on: boolean) => Object.defineProperty(navigator, 'globalPrivacyControl', { value: on, configurable: true })

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  sessionStorage.clear()
  pathname = '/tour'
})
afterEach(() => {
  vi.useRealTimers()
  setGpc(false)
})

describe('CookieConsent in the notice zone', () => {
  it('shows the notice, not the banner, on a public page', () => {
    renderIn('notice')
    expect(notice()?.textContent).toContain('We use Google Analytics to see how visitors use this site.')
    expect(banner()).toBeNull()
  })

  it('hides the notice on OK and records it as seen, not as consent', () => {
    renderIn('notice')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(notice()).toBeNull()
    expect(localStorage.getItem(FM_ANALYTICS_NOTICE_SEEN_KEY)).not.toBeNull()
    expect(localStorage.getItem(FM_COOKIE_CONSENT_KEY)).toBeNull()
  })

  it('stays hidden once seen', () => {
    localStorage.setItem(FM_ANALYTICS_NOTICE_SEEN_KEY, '2026-11-11')
    renderIn('notice')
    expect(notice()).toBeNull()
    expect(banner()).toBeNull()
  })

  it('opens Cookie settings with analytics on, and saving off is a real choice', () => {
    renderIn('notice')
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    const toggle = screen.getByRole('switch', { name: 'Analytics cookies' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(notice()).toBeNull()
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(JSON.parse(localStorage.getItem(FM_COOKIE_CONSENT_KEY)!).analytics).toBe(false)
    expect(notice()).toBeNull()
  })

  it('brings the notice back after Cookie settings is closed without saving', () => {
    renderIn('notice')
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(notice()).not.toBeNull()
  })

  it('keeps the opt-in banner on app pages', () => {
    pathname = '/d/acme'
    renderIn('notice')
    expect(banner()).not.toBeNull()
    expect(notice()).toBeNull()
  })

  it('shows neither when the browser sends Global Privacy Control', () => {
    setGpc(true)
    renderIn('notice')
    expect(notice()).toBeNull()
    expect(banner()).toBeNull()
  })

  it('shows nothing once a choice is saved', () => {
    localStorage.setItem(FM_COOKIE_CONSENT_KEY, JSON.stringify({ necessary: true, analytics: false }))
    renderIn('notice')
    expect(notice()).toBeNull()
    expect(banner()).toBeNull()
  })
})

describe('CookieConsent in the consent zone', () => {
  it('shows the opt-in banner on public pages, as before', () => {
    renderIn('consent')
    expect(banner()).not.toBeNull()
    expect(notice()).toBeNull()
  })

  it('opens Cookie settings with analytics off when nothing is saved', () => {
    renderIn('consent')
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    expect(screen.getByRole('switch', { name: 'Analytics cookies' }).getAttribute('aria-checked')).toBe('false')
  })
})
