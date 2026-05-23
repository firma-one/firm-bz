'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { Footer } from '@/components/layout/Footer'

interface ResearchContentProps {
    campaign: {
        id: string
        scriptSnippet: string | null
    }
}

export function ResearchContent({ campaign }: ResearchContentProps) {
    const embedRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!campaign.scriptSnippet || !embedRef.current) return
        // createContextualFragment parses mixed HTML+<script> and executes scripts,
        // unlike innerHTML which silently ignores injected <script> tags.
        const fragment = document.createRange().createContextualFragment(campaign.scriptSnippet)
        embedRef.current.appendChild(fragment)
    }, [campaign.scriptSnippet])

    return (
        <div className="relative flex min-h-screen flex-col">
            {/* Brand header — logo lockup only, no nav */}
            <header className="border-b border-slate-200/60 bg-white/70 backdrop-blur-md px-6 py-4">
                <Link href="/" aria-label="Firma home">
                    <Logo size="md" showText wordmarkClassName="text-2xl leading-none" />
                </Link>
            </header>

            {/* Main content */}
            <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
                <div ref={embedRef} className="w-full" />
            </main>

            <Footer />
        </div>
    )
}
