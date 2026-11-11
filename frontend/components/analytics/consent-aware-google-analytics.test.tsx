import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ConsentAwareGoogleAnalytics } from './consent-aware-google-analytics'
import { AnalyticsModeProvider } from './analytics-mode-context'
import type { AnalyticsMode } from '@/lib/analytics-zone'
import { FM_COOKIE_CONSENT_KEY } from '@/lib/cookie-consent-storage'

let pathname = '/tour'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const GA_ID = 'G-TEST123'
const loader = () => document.querySelector(`script[data-fm-ga="loader"][data-fm-ga-id="${GA_ID}"]`)
const disabled = () => (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`]
const tree = (mode: AnalyticsMode) => <AnalyticsModeProvider mode={mode}><ConsentAwareGoogleAnalytics /></AnalyticsModeProvider>
const setGpc = (on: boolean) => Object.defineProperty(navigator, 'globalPrivacyControl', { value: on, configurable: true })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GA_ID', GA_ID)
  localStorage.clear()
  pathname = '/tour'
  document.head.querySelectorAll('script[data-fm-ga]').forEach((s) => s.remove())
})
afterEach(() => {
  vi.unstubAllEnvs()
  setGpc(false)
})

describe('ConsentAwareGoogleAnalytics', () => {
  it('loads GA on a public page in the notice zone without asking', () => {
    render(tree('notice'))
    expect(loader()).not.toBeNull()
    expect(disabled()).toBe(false)
  })

  it('waits for Accept in the consent zone', () => {
    render(tree('consent'))
    expect(loader()).toBeNull()
    expect(disabled()).toBe(true)
  })

  it('never loads with Global Privacy Control', () => {
    setGpc(true)
    render(tree('notice'))
    expect(loader()).toBeNull()
  })

  it('respects a saved Reject in the notice zone', () => {
    localStorage.setItem(FM_COOKIE_CONSENT_KEY, JSON.stringify({ necessary: true, analytics: false }))
    render(tree('notice'))
    expect(loader()).toBeNull()
  })

  it('turns GA off on moving into the app without a saved choice', () => {
    const view = render(tree('notice'))
    expect(loader()).not.toBeNull()
    pathname = '/d/acme'
    view.rerender(tree('notice'))
    expect(loader()).toBeNull()
    expect(disabled()).toBe(true)
  })

  it('keeps GA on in the app after a saved Accept', () => {
    localStorage.setItem(FM_COOKIE_CONSENT_KEY, JSON.stringify({ necessary: true, analytics: true }))
    pathname = '/d/acme'
    render(tree('consent'))
    expect(loader()).not.toBeNull()
  })
})
