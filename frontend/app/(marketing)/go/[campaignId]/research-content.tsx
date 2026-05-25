'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { Footer } from '@/components/layout/Footer'
import { sendEvent, ANALYTICS_EVENTS } from '@/lib/analytics'

interface ResearchContentProps {
    campaign: {
        id: string
        scriptSnippet: string | null
    }
}

export function ResearchContent({ campaign }: ResearchContentProps) {
    const embedRef = useRef<HTMLDivElement>(null)
    const startedAtRef = useRef<number | null>(null)

    useEffect(() => {
        if (!campaign.scriptSnippet || !embedRef.current) return
        const fragment = document.createRange().createContextualFragment(campaign.scriptSnippet)
        embedRef.current.appendChild(fragment)
    }, [campaign.scriptSnippet])

    useEffect(() => {
        const campaignId = campaign.id

        const handleMessage = (event: MessageEvent) => {
            if (!event.data?.isTally) return

            switch (event.data.code) {
                case 'TallyFormLoaded':
                    sendEvent({ action: ANALYTICS_EVENTS.RESEARCH_FORM_LOADED, category: 'Research', label: campaignId })
                    break
                case 'TallyFormStarted':
                    startedAtRef.current = Date.now()
                    sendEvent({ action: ANALYTICS_EVENTS.RESEARCH_FORM_STARTED, category: 'Research', label: campaignId })
                    break
                case 'TallyFormSubmitted': {
                    const duration = startedAtRef.current
                        ? Math.round((Date.now() - startedAtRef.current) / 1000)
                        : undefined
                    sendEvent({
                        action: ANALYTICS_EVENTS.RESEARCH_FORM_SUBMITTED,
                        category: 'Research',
                        label: campaignId,
                        ...(duration !== undefined && { completion_duration_seconds: duration }),
                    })
                    startedAtRef.current = null
                    break
                }
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [campaign.id])

    return (
        <div className="flex min-h-screen flex-col">
            {/* Brand header */}
            <header className="border-b border-slate-200/60 bg-white/70 backdrop-blur-md px-6 py-4 flex justify-center">
                <Link href="/" aria-label="Firma home" className="[&>div]:items-center">
                    <Logo size="md" showText wordmarkClassName="text-2xl leading-none" />
                </Link>
            </header>

            <main className="flex-1 w-full">
                <div className="md:max-w-7xl md:mx-auto md:px-6 md:py-16">

                    {/* Outer card — desktop only */}
                    <div className="md:bg-[#F0EDEE] md:p-8 md:shadow-[0_4px_24px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.05)]">

                        {/* Inner diagonal card — desktop only */}
                        <div className="relative overflow-hidden md:mx-8 md:my-8 md:shadow-[0_2px_12px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]">

                            {/* Diagonal backgrounds — desktop only */}
                            <div className="hidden md:block absolute inset-0 bg-[#FDF8FA]" />
                            <div className="hidden md:block absolute inset-0" style={{ clipPath: 'polygon(0% 15%, 100% 40%, 100% 100%, 0% 100%)', background: '#ECE5E0' }} />
                            <div className="hidden md:block absolute inset-0" style={{ clipPath: 'polygon(0% 85%, 100% 50%, 100% 100%, 0% 100%)', background: '#E1DEE5' }} />

                            {/* Left vertical "firma" label — desktop only */}
                            <div className="hidden md:flex absolute left-0 inset-y-0 z-10 w-16 items-center justify-center">
                                <span className="text-[#1b1b1d]/30 font-bold text-sm tracking-[0.35em] uppercase select-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: 'var(--font-kinetic-headline, system-ui)' }}>
                                    firma
                                </span>
                            </div>

                            {/* White iframe card — desktop centered, mobile plain */}
                            <div className="relative z-10 md:flex md:justify-center md:py-12 md:px-20">
                                <div className="w-full md:max-w-[640px] md:bg-white md:overflow-hidden md:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]">
                                    <div ref={embedRef} className="w-full" />
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    )
}
