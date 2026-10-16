'use client'

import Link from 'next/link'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { buttonVariants } from '@/components/ui/button'

/** Persistent topbar Sign up button — appears once the visitor has completed the guided tour and
 * dismissed the outro dialog, so the ask stays visible without blocking further exploration. */
export function DemoTourSignupButton() {
    const { hasCompletedTour, showOutroModal } = useDemoTour()

    if (!hasCompletedTour || showOutroModal) return null

    return (
        <Link href="/signup" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm', className: 'shrink-0' })}>
            Sign up
        </Link>
    )
}
