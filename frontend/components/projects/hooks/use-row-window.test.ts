import { describe, it, expect, beforeAll, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import { useRowWindow, FILE_ROW_HEIGHT, VIRTUALIZE_ABOVE } from './use-row-window'

/*
 * The windowing behind the Files list. What matters here is the two things a wrong window breaks:
 * a short folder must render every row (anything that reaches for a row by id depends on it), and
 * a long one must keep the full scroll height so the scrollbar still describes the whole folder.
 */

/** A stand-in for the scrolling element: jsdom gives clientHeight 0, so it is defined here. */
function container(clientHeight: number, scrollTop = 0) {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
    el.scrollTop = scrollTop
    const ref = createRef<HTMLElement>()
    ;(ref as { current: HTMLElement | null }).current = el
    return { el, ref }
}

beforeAll(() => {
    if (typeof ResizeObserver === 'undefined') {
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        })
    }
})

describe('useRowWindow', () => {
    it('renders every row for a folder under the threshold', () => {
        const { ref } = container(600)
        const { result } = renderHook(() => useRowWindow(ref, VIRTUALIZE_ABOVE))
        expect(result.current.virtualized).toBe(false)
        expect(result.current.start).toBe(0)
        expect(result.current.end).toBe(VIRTUALIZE_ABOVE)
        expect(result.current.padTop).toBe(0)
        expect(result.current.padBottom).toBe(0)
    })

    it('windows a long folder and keeps the list its full height', () => {
        const { ref } = container(700)
        const { result } = renderHook(() => useRowWindow(ref, 500))
        const w = result.current
        expect(w.virtualized).toBe(true)
        expect(w.start).toBe(0)
        // A 700px viewport holds 20 rows; the window is that plus the overscan either side.
        expect(w.end).toBeLessThan(100)
        expect(w.padTop + (w.end - w.start) * FILE_ROW_HEIGHT + w.padBottom).toBe(500 * FILE_ROW_HEIGHT)
    })

    it('moves the window as the container scrolls', () => {
        const { el, ref } = container(700)
        const { result } = renderHook(() => useRowWindow(ref, 500))
        const firstEnd = result.current.end
        act(() => {
            el.scrollTop = 300 * FILE_ROW_HEIGHT
            el.dispatchEvent(new Event('scroll'))
        })
        expect(result.current.start).toBeGreaterThan(firstEnd)
        expect(result.current.padTop).toBe(result.current.start * FILE_ROW_HEIGHT)
        expect(result.current.end).toBeLessThanOrEqual(500)
    })

    it('never windows past the last row', () => {
        const { el, ref } = container(700)
        const { result } = renderHook(() => useRowWindow(ref, 500))
        act(() => {
            el.scrollTop = 499 * FILE_ROW_HEIGHT
            el.dispatchEvent(new Event('scroll'))
        })
        expect(result.current.end).toBe(500)
        expect(result.current.padBottom).toBe(0)
    })

    it('renders every row while the container measures nothing', () => {
        // A hidden tab, or a test: a measurement of 0 must not leave the list empty.
        const { ref } = container(0)
        const { result } = renderHook(() => useRowWindow(ref, 500))
        expect(result.current.virtualized).toBe(false)
        expect(result.current.end).toBe(500)
    })

    it('scrollToIndex centers the row it is given', () => {
        const { el, ref } = container(700)
        const { result } = renderHook(() => useRowWindow(ref, 500))
        act(() => result.current.scrollToIndex(300))
        expect(el.scrollTop).toBe(300 * FILE_ROW_HEIGHT - (700 - FILE_ROW_HEIGHT) / 2)
        // The row is in the window afterwards, which is the point — a deeplink can reach row 300.
        act(() => { el.dispatchEvent(new Event('scroll')) })
        expect(result.current.start).toBeLessThanOrEqual(300)
        expect(result.current.end).toBeGreaterThan(300)
    })

    it('never scrolls above the top of the list', () => {
        const { el, ref } = container(700)
        const { result } = renderHook(() => useRowWindow(ref, 500))
        act(() => result.current.scrollToIndex(2))
        expect(el.scrollTop).toBe(0)
    })
})
