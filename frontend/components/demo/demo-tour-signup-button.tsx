'use client'

import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'

/** Persistent topbar Sign Up CTA — appears once the visitor has completed the guided tour and
 * dismissed the outro modal, so the ask stays visible without blocking further exploration. */
export function DemoTourSignupButton() {
    const { hasCompletedTour, showOutroModal } = useDemoTour()

    if (!hasCompletedTour || showOutroModal) return null

    return (
        <Link
            href="/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all flex items-center gap-1.5 shrink-0"
        >
            <UserPlus className="h-3.5 w-3.5" /> Sign Up
        </Link>
    )
}
