"use client"

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { refreshAccessAndNavigate } from '@/lib/navigation/refresh-access-and-navigate'
import { PageGuides } from '@/components/marketing/v2/primitives'
import '@/components/marketing/v2/marketing-v2.css'

function resolveHomeHref(pathname: string | null): { href: string; label: string } {
    if (pathname?.startsWith('/d')) return { href: '/d', label: 'Go to Dashboard' }
    if (pathname?.startsWith('/resources')) return { href: '/resources/blog', label: 'Back to Resources' }
    return { href: '/', label: 'Back to Home' }
}

export default function RootNotFound() {
    const pathname = usePathname()
    const { href, label } = resolveHomeHref(pathname)
    // A /d 404 can be a stale permission cache/JWT rather than a missing page —
    // refresh both on the way back to the dashboard (same effect as re-signing in).
    const refreshOnLeave = pathname?.startsWith('/d') ?? false
    const [refreshing, setRefreshing] = useState(false)

    return (
        <div className="marketing-site mk relative flex min-h-screen items-center justify-center overflow-hidden bg-white">
            <PageGuides />
            <div className="relative z-10 flex flex-col items-center px-6 text-center">
                <p
                    className="mb-2 select-none text-[96px] font-bold leading-none tracking-[-0.05em] text-[var(--mk-bottle)] md:text-[140px]"
                    style={{ fontFamily: 'var(--mk-font-display)' }}
                >
                    404
                </p>
                <h1 className="mk-section text-[var(--mk-ink)]">Page not found</h1>
                <p className="mk-lede mb-8 mt-3 max-w-sm">This page has moved or doesn&apos;t exist.</p>
                <Link
                    href={href}
                    aria-disabled={refreshing}
                    onClick={(e) => {
                        if (!refreshOnLeave) return
                        e.preventDefault()
                        if (refreshing) return
                        setRefreshing(true)
                        void refreshAccessAndNavigate(href)
                    }}
                    className="mk-btn mk-btn--primary"
                >
                    {refreshing ? 'Refreshing access…' : label}
                </Link>
            </div>
        </div>
    )
}
