'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LandingArrivalOverlay } from '@/components/app/landing-arrival-overlay'

/**
 * The one-time arrival after sign-in: when the page was reached with `?landed=new|returning`
 * (lib/landing/default-landing-path.ts), plays LandingArrivalOverlay (the loader's last beat, then
 * "Welcome back, {name}") and drops the param, so a refresh or the back button doesn't replay it.
 * Rendered by every page sign-in can land on: Home, and a new user's firm.
 */
export function LandingArrival({ firstName }: { firstName?: string | null }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    // Read once: the overlay keeps playing after the param is gone from the URL.
    const [variant] = useState<'new' | 'returning' | null>(() => {
        const landed = searchParams.get('landed')
        return landed === 'new' || landed === 'returning' ? landed : null
    })
    const [open, setOpen] = useState(variant !== null)
    if (!open || !variant) return null

    const close = () => {
        setOpen(false)
        const params = new URLSearchParams(searchParams.toString())
        params.delete('landed')
        const query = params.toString()
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }

    return <LandingArrivalOverlay variant={variant} firstName={firstName ?? undefined} onClose={close} />
}
