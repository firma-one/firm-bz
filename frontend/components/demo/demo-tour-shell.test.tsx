import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { DemoTourShell } from './demo-tour-shell'
import { AnalyticsModeProvider } from '@/components/analytics/analytics-mode-context'
import type { AnalyticsMode } from '@/lib/analytics-zone'
import { COOKIE_CONSENT_UPDATED_EVENT } from '@/lib/cookie-consent-storage'

const openIntroModal = vi.fn()
vi.mock('@/lib/demo/demo-tour-context', () => ({
  useDemoTour: () => ({ openIntroModal, startNode: vi.fn() }),
  hasOptedOutOfTour: () => false,
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/demo/demo-tour', () => ({ DemoTour: () => null }))
vi.mock('@/components/demo/demo-tour-button', () => ({ DemoTourButton: () => null }))
vi.mock('@/components/demo/demo-tour-panel', () => ({ DemoTourPanel: () => null }))

const renderIn = (mode: AnalyticsMode) => render(<AnalyticsModeProvider mode={mode}><DemoTourShell /></AnalyticsModeProvider>)

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  openIntroModal.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('DemoTourShell auto-open', () => {
  it('opens straight away in the notice zone, with no banner to wait for', () => {
    renderIn('notice')
    act(() => { vi.advanceTimersByTime(900) })
    expect(openIntroModal).toHaveBeenCalledTimes(1)
  })

  it('waits for the banner answer in the consent zone, as before', () => {
    renderIn('consent')
    act(() => { vi.advanceTimersByTime(900) })
    expect(openIntroModal).not.toHaveBeenCalled()
    act(() => { window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT)) })
    act(() => { vi.advanceTimersByTime(900) })
    expect(openIntroModal).toHaveBeenCalledTimes(1)
  })
})
