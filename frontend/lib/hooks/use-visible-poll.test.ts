import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/*
 * A hidden tab must not poll. Browsers throttle background timers rather than stopping them,
 * so before this hook a signed-in tab left open overnight kept calling the server until
 * morning — the shape of the Vercel Fluid Active CPU overage in November 2026.
 */

import { useVisiblePoll } from './use-visible-poll'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useVisiblePoll', () => {
  it('runs once immediately and then on the interval', () => {
    const task = vi.fn()
    renderHook(() => useVisiblePoll(task, 1000))

    expect(task).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(task).toHaveBeenCalledTimes(4)
  })

  it('stops polling while the tab is hidden', () => {
    const task = vi.fn()
    renderHook(() => useVisiblePoll(task, 1000))
    task.mockClear()

    act(() => { setVisibility('hidden') })
    act(() => { vi.advanceTimersByTime(10_000) })

    expect(task).not.toHaveBeenCalled()
  })

  it('runs once and resumes when the tab comes back', () => {
    const task = vi.fn()
    renderHook(() => useVisiblePoll(task, 1000))

    act(() => { setVisibility('hidden') })
    act(() => { vi.advanceTimersByTime(10_000) })
    task.mockClear()

    // Coming back refreshes at once, so the user does not read a stale screen.
    act(() => { setVisibility('visible') })
    expect(task).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(2000) })
    expect(task).toHaveBeenCalledTimes(3)
  })

  it('does nothing at all when disabled', () => {
    const task = vi.fn()
    renderHook(() => useVisiblePoll(task, 1000, false))

    act(() => { vi.advanceTimersByTime(5000) })
    expect(task).not.toHaveBeenCalled()
  })

  it('runs once but never polls when the interval is null', () => {
    const task = vi.fn()
    renderHook(() => useVisiblePoll(task, null))

    expect(task).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('stops polling after unmount', () => {
    const task = vi.fn()
    const { unmount } = renderHook(() => useVisiblePoll(task, 1000))
    task.mockClear()

    unmount()
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(task).not.toHaveBeenCalled()
  })
})
