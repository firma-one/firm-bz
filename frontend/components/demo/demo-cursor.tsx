'use client'

import { useEffect, useRef } from 'react'

/**
 * Large dot cursor overlay, styled after the pointer used in recorded product demos
 * (Loom/Arcade/Supademo-style walkthroughs) — replaces the native cursor with a
 * bigger, more visible one that shrinks slightly on click for tactile feedback.
 * Scoped to the /demo route only via demo/layout.tsx.
 *
 * Position and scale are combined into a single `transform` string set entirely
 * from JS (rather than mixing an imperative transform with a CSS `scale` class
 * toggle) to avoid any cross-property animation/order artifacts.
 */
export function DemoCursor() {
    const dotRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const dot = dotRef.current
        if (!dot) return

        let x = -100
        let y = -100
        let scale = 1

        const render = () => {
            dot.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
        }

        const handleMove = (e: MouseEvent) => {
            x = e.clientX - 12
            y = e.clientY - 12
            render()
        }

        const handleDown = () => {
            scale = 0.55
            render()
        }

        const handleUp = () => {
            scale = 1
            render()
        }

        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mousedown', handleDown)
        window.addEventListener('mouseup', handleUp)
        return () => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mousedown', handleDown)
            window.removeEventListener('mouseup', handleUp)
        }
    }, [])

    return (
        <div className="pointer-events-none fixed inset-0 z-[10200] overflow-hidden">
            <div ref={dotRef} className="demo-cursor-dot" />
            <style jsx global>{`
                * {
                    cursor: none !important;
                }
                .demo-cursor-dot {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 24px;
                    height: 24px;
                    border-radius: 9999px;
                    background: hsl(var(--primary));
                    opacity: 0.85;
                    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9), 0 2px 8px rgba(0, 0, 0, 0.25);
                    transform-origin: center center;
                    transition: transform 0.12s ease-out;
                    will-change: transform;
                }
            `}</style>
        </div>
    )
}
