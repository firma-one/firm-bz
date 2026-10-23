'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const EDGE = '24px'
const FADE_LEFT = `linear-gradient(to right, transparent, black ${EDGE})`
const FADE_RIGHT = `linear-gradient(to left, transparent, black ${EDGE})`
const FADE_BOTH = `linear-gradient(to right, transparent, black ${EDGE}, black calc(100% - ${EDGE}), transparent)`

/**
 * A row that scrolls sideways when it doesn't fit, with no scrollbar — the engagement tab bar
 * (2026-10-23). A plain mouse wheel scrolls it too (a trackpad's sideways swipe already did), and a
 * soft fade at an edge says more is hidden that way. At either end the wheel scrolls the page as usual.
 */
export function HorizontalScroll({ className, children }: { className?: string; children: React.ReactNode }) {
    const ref = React.useRef<HTMLDivElement>(null)
    const [edges, setEdges] = React.useState({ left: false, right: false })

    React.useEffect(() => {
        const el = ref.current
        if (!el) return
        const update = () => {
            const max = el.scrollWidth - el.clientWidth
            const next = { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 }
            setEdges((prev) => (prev.left === next.left && prev.right === next.right ? prev : next))
        }
        // Non-passive, so the page doesn't also scroll while the row takes the wheel.
        const onWheel = (e: WheelEvent) => {
            const max = el.scrollWidth - el.clientWidth
            if (max <= 0 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
            const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
            const target = Math.min(max, Math.max(0, el.scrollLeft + delta))
            if (target === el.scrollLeft) return
            e.preventDefault()
            el.scrollLeft = target
        }
        update()
        el.addEventListener('scroll', update, { passive: true })
        el.addEventListener('wheel', onWheel, { passive: false })
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
        observer?.observe(el)
        if (el.firstElementChild) observer?.observe(el.firstElementChild)
        return () => {
            el.removeEventListener('scroll', update)
            el.removeEventListener('wheel', onWheel)
            observer?.disconnect()
        }
    }, [])

    const fade = edges.left && edges.right ? FADE_BOTH : edges.left ? FADE_LEFT : edges.right ? FADE_RIGHT : undefined
    return (
        <div
            ref={ref}
            className={cn('min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
            style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
        >
            {children}
        </div>
    )
}
