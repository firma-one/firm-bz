'use client'

import { Eye, PartyPopper, ThumbsUp, TriangleAlert, CircleCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * The reactions a comment can get, and their marks (Deepak, 2026-10-23: "improve the icon pack").
 * Emoji drew differently on every system, and Yes / No / OK / +1 came out as boxed letters, so each
 * reaction is a design-system mark instead: a lucide icon for the expressive ones, a short word for
 * the answers, in the tag palette (signals, not statuses). The keys are stored on comments and read
 * by the insights (lib/insights/engagement-insights.ts: which reactions keep a thread open), so they
 * never change; only how they're drawn.
 */

export type ReactionKey = 'urgent' | 'looking' | 'done' | 'thumbs_up' | 'yes' | 'no' | 'ok' | 'plus_one' | 'celebrate'

type Reaction =
    | { key: ReactionKey; label: string; icon: LucideIcon; tone: string }
    | { key: ReactionKey; label: string; word: string; tone: string; tint: string }

/** In picker order: the signals first, then the answers, then the cheers. */
export const REACTIONS: Reaction[] = [
    { key: 'urgent', label: 'Urgent', icon: TriangleAlert, tone: 'text-tag-orange-fg' },
    { key: 'looking', label: 'Looking', icon: Eye, tone: 'text-tag-blue-fg' },
    { key: 'done', label: 'Done', icon: CircleCheck, tone: 'text-tag-green-fg' },
    { key: 'yes', label: 'Yes', word: 'Yes', tone: 'text-tag-green-fg', tint: 'bg-tag-green-bg' },
    { key: 'no', label: 'No', word: 'No', tone: 'text-tag-red-fg', tint: 'bg-tag-red-bg' },
    { key: 'ok', label: 'OK', word: 'OK', tone: 'text-tag-blue-fg', tint: 'bg-tag-blue-bg' },
    { key: 'plus_one', label: '+1', word: '+1', tone: 'text-tag-gray-fg', tint: 'bg-tag-gray-bg' },
    { key: 'thumbs_up', label: 'Thumbs up', icon: ThumbsUp, tone: 'text-tag-yellow-fg' },
    { key: 'celebrate', label: 'Celebrate', icon: PartyPopper, tone: 'text-tag-pink-fg' },
]

/**
 * A reaction's mark. `pill`: inside a reaction pill under a comment (small, the word without its
 * tint, since the pill has its own). `picker`: a cell in the reaction picker (larger, the word on its tint).
 */
export function ReactionMark({ reaction, size }: { reaction: Reaction; size: 'pill' | 'picker' }) {
    if ('icon' in reaction) {
        const Icon = reaction.icon
        return <Icon aria-hidden className={cn('shrink-0', reaction.tone, size === 'pill' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]')} />
    }
    return (
        <span
            aria-hidden
            className={cn(
                'inline-flex shrink-0 items-center justify-center font-semibold leading-none tabular-nums',
                reaction.tone,
                size === 'pill' ? 'text-[11px]' : cn('h-6 min-w-[28px] rounded-[5px] px-1 text-[12px]', reaction.tint),
            )}
        >
            {reaction.word}
        </span>
    )
}
