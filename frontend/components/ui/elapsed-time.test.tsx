import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ElapsedTime } from './elapsed-time'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('ElapsedTime', () => {
    /** "0s" appearing and immediately becoming "1s" is noise on a fast operation. */
    it('shows nothing for the first second', () => {
        const { container } = render(<ElapsedTime />)
        expect(container.textContent).toBe('')
    })

    it('counts in seconds', () => {
        render(<ElapsedTime />)
        advance(3000)
        expect(screen.getByText('3s')).toBeTruthy()
    })

    /** A wait long enough to worry about should not read as a three-digit second count. */
    it('switches to minutes past sixty seconds', () => {
        render(<ElapsedTime />)
        advance(75_000)
        expect(screen.getByText('1m 15s')).toBeTruthy()
    })

    it('shows a whole minute without stray seconds', () => {
        render(<ElapsedTime />)
        advance(120_000)
        expect(screen.getByText('2m 0s')).toBeTruthy()
    })

    /**
     * Measured from a fixed start, not by counting ticks: a backgrounded tab throttles timers, so
     * counting would under-report by however long the tab was asleep.
     */
    it('reports real elapsed time even when ticks are missed', () => {
        render(<ElapsedTime />)
        // One tick fires, but ten seconds of wall clock have passed.
        advance(10_000)
        expect(screen.getByText('10s')).toBeTruthy()
    })

    it('stops its timer when unmounted', () => {
        const clear = vi.spyOn(globalThis, 'clearInterval')
        const { unmount } = render(<ElapsedTime />)
        unmount()
        expect(clear).toHaveBeenCalled()
    })
})
