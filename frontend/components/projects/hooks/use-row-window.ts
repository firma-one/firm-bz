'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'

/**
 * One Files row's pitch: the 34px row plus the 1px line under it. Both live on the row itself
 * (`h-[35px] border-b` in engagement-file-row.tsx) rather than on the container as a `divide-y`,
 * because windowing replaces most of the rows with two spacers and a container divider would
 * draw lines around those instead of between rows.
 */
export const FILE_ROW_HEIGHT = 35

/**
 * Below this many rows the whole list renders and nothing here does anything.
 *
 * Windowing is not free: it costs a scroll listener, a measured viewport and two spacers, and a
 * row outside the window is not in the DOM at all, so anything that reaches for one by id has to
 * ask for it to be scrolled to first. None of that earns its keep for a folder that fits on a
 * couple of screens. Past it, a folder of 500 mounts about thirty rows instead of five hundred.
 */
export const VIRTUALIZE_ABOVE = 80

export type RowWindow = {
    /** First row index to render, inclusive. */
    start: number
    /** Last row index to render, exclusive. */
    end: number
    /** Height to stand in for the rows before `start`, and after `end`. */
    padTop: number
    padBottom: number
    /** False when every row is rendered, which is the case for most folders. */
    virtualized: boolean
    /**
     * Bring the row at this index into the window, for a caller that wants a row the window
     * doesn't currently hold — a deeplink or "show file location" landing on row 300. It scrolls
     * rather than widening the window, so the row arrives where the user can see it.
     */
    scrollToIndex: (index: number) => void
}

/**
 * Render only the rows a scroll container can show, plus a margin either side.
 *
 * Fixed-height rows only — `rowHeight` is the pitch, not a measurement — which is what the Files
 * table has. The container must be the scrolling element and must already be laid out; while its
 * height measures 0 (a jsdom test, a hidden tab) every row renders, so a list is never silently
 * empty because the measurement hadn't happened yet.
 */
export function useRowWindow(
    scrollRef: RefObject<HTMLElement | null>,
    rowCount: number,
    rowHeight: number = FILE_ROW_HEIGHT,
    overscan = 10,
): RowWindow {
    const [scrollTop, setScrollTop] = useState(0)
    const [viewport, setViewport] = useState(0)

    const active = rowCount > VIRTUALIZE_ABOVE

    // Measured in a layout effect, and again whenever the container resizes: the first window has
    // to be right on the first paint, or the list would flash a single screen's worth of rows.
    useLayoutEffect(() => {
        const el = scrollRef.current
        if (!el || !active) return
        setViewport(el.clientHeight)
        setScrollTop(el.scrollTop)
        if (typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(() => setViewport(el.clientHeight))
        ro.observe(el)
        return () => ro.disconnect()
    }, [scrollRef, active])

    useEffect(() => {
        const el = scrollRef.current
        if (!el || !active) return
        const onScroll = () => setScrollTop(el.scrollTop)
        el.addEventListener('scroll', onScroll, { passive: true })
        return () => el.removeEventListener('scroll', onScroll)
    }, [scrollRef, active])

    const scrollToIndex = useCallback((index: number) => {
        const el = scrollRef.current
        if (!el) return
        const centered = index * rowHeight - Math.max(0, el.clientHeight - rowHeight) / 2
        el.scrollTop = Math.max(0, centered)
    }, [scrollRef, rowHeight])

    return useMemo(() => {
        // Not enough rows to bother, or nothing measured yet: render the lot.
        if (!active || viewport <= 0) {
            return { start: 0, end: rowCount, padTop: 0, padBottom: 0, virtualized: false, scrollToIndex }
        }
        const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
        const visible = Math.ceil(viewport / rowHeight)
        const last = Math.min(rowCount, first + visible + overscan * 2)
        return {
            start: first,
            end: last,
            padTop: first * rowHeight,
            padBottom: (rowCount - last) * rowHeight,
            virtualized: true,
            scrollToIndex,
        }
    }, [active, viewport, scrollTop, rowCount, rowHeight, overscan, scrollToIndex])
}
