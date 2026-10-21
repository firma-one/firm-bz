'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { BrandMarkIcon } from '@/components/brand/BrandMarkIcon'
import { BrandName } from '@/components/brand/BrandName'
import { BRAND_NAME } from '@/config/brand'
import { FormRibbon } from '@/components/marketing/v2/forms/form-ribbon'
import { PageGuides } from '@/components/marketing/v2/primitives'
import { SiteFooter } from '@/components/marketing/v2/site-footer'
import '@/components/marketing/v2/forms/forms.css'
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
            {/* Brand bar: the campaign page's only chrome above the form */}
            <header className="mk-form-brandbar">
                <div className="mk-rail flex h-16 items-center justify-center md:h-[76px]">
                    <Link href="/" aria-label={`${BRAND_NAME} home`} className="group inline-flex items-center gap-2">
                        <BrandMarkIcon className="h-[23px] w-[23px] md:h-[26px] md:w-[26px]" />
                        <BrandName className="text-[22px] leading-none md:text-[24px]" />
                    </Link>
                </div>
            </header>

            <main className="relative w-full flex-1 overflow-hidden">
                <FormRibbon wash={false} />
                <PageGuides />
                {/* Phones: the form runs edge to edge. From md: centered in the white card. */}
                <div className="mk-form-embed-wrap">
                    <div className="mk-form-embed">
                        <div ref={embedRef} className="w-full" />
                    </div>
                </div>
            </main>

            <SiteFooter />
        </div>
    )
}
