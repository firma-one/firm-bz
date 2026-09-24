'use client'

import { useId } from 'react'
import { ASSISTANT } from '@/lib/ai/assistant'

/**
 * Brio's avatar.
 *
 * Deliberately not a robot: no antennae, no screen-face, no circuitry. The form is a soft
 * rounded blob with two simple eyes and a warm gradient — closer to an iOS emoji than to a
 * machine, which suits an assistant whose job is drafting prose for client-facing reports.
 *
 * Pure SVG so it stays crisp at any size and needs no asset pipeline.
 */
export function BrioAvatar({
    className = '',
    size = 24,
    title = ASSISTANT.name,
}: {
    className?: string
    size?: number
    /** Set to null inside a labelled control, so the name is not announced twice. */
    title?: string | null
}) {
    // useId, not Math.random: the gradient ids must match between server and client render,
    // and two avatars on one page must not collide.
    const uid = useId().replace(/:/g, '')

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 40 40"
            fill="none"
            className={className}
            role={title ? 'img' : 'presentation'}
            aria-label={title ?? undefined}
            aria-hidden={title ? undefined : true}
        >
            <defs>
                <linearGradient id={`${uid}-body`} x1="8" y1="4" x2="32" y2="36" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#A78BFA" />
                    <stop offset="0.55" stopColor="#8B5CF6" />
                    <stop offset="1" stopColor="#6D28D9" />
                </linearGradient>
                <radialGradient id={`${uid}-sheen`} cx="0" cy="0" r="1"
                    gradientTransform="translate(14 11) rotate(58) scale(13 11)"
                    gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fff" stopOpacity="0.55" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Body — a squircle, the shape iOS icons use: softer than a circle, friendlier than a square. */}
            <path
                d="M20 2c10 0 18 8 18 18s-8 18-18 18S2 30 2 20 10 2 20 2Z"
                fill={`url(#${uid}-body)`}
            />
            <path
                d="M20 2c10 0 18 8 18 18s-8 18-18 18S2 30 2 20 10 2 20 2Z"
                fill={`url(#${uid}-sheen)`}
            />

            {/* Eyes — simple rounded capsules rather than lenses or pixels. */}
            <rect x="12.4" y="15.5" width="3.6" height="7" rx="1.8" fill="#fff" />
            <rect x="24" y="15.5" width="3.6" height="7" rx="1.8" fill="#fff" />

            {/* Mouth — a small upward arc; present but understated, so it reads calm not cartoonish. */}
            <path
                d="M16 27.4c1.2 1.25 2.55 1.875 4 1.875s2.8-.625 4-1.875"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                opacity="0.9"
            />
        </svg>
    )
}
