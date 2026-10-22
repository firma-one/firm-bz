'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'

/** How long a just-changed item keeps its fade-in class: the chip's enter plus a beat. */
const FRESH_MS = 1200

/** Fades a status chip in once; put it on the chip of the item `isFresh` names. */
export const FRESH_CHIP_CLASS = 'animate-in fade-in duration-ui-slow ease-ui-out'

/**
 * Feedback for a state change the user just made (.claude/plans/app-design-refinements.md,
 * section 4): the success toast, and, when the item is on screen, its new status chip fades in.
 * No rings or celebrations.
 *
 * Approvals by default ("Approved · {name}"); pass a title for other changes, e.g. an invitation
 * accepted or a storage connection restored.
 *
 *   const { confirm, isFresh } = useApprovalFeedback()
 *   confirm({ id: deliverable.id, name: deliverable.title })
 *   <StatusPill … className={cn(isFresh(deliverable.id) && FRESH_CHIP_CLASS)} />
 */
export function useApprovalFeedback() {
    const { addToast } = useToast()
    const [freshId, setFreshId] = useState<string | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current)
    }, [])

    const confirm = useCallback(
        ({ id, name, title = 'Approved' }: { id: string; name?: string; title?: string }) => {
            addToast({ type: 'success', title, message: name })
            setFreshId(id)
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => setFreshId(null), FRESH_MS)
        },
        [addToast]
    )

    const isFresh = useCallback((id: string) => id === freshId, [freshId])

    return { confirm, isFresh }
}
