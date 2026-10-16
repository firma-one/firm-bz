'use client'

import { useEffect, useState } from 'react'
import { Newspaper } from 'lucide-react'
import { ASSISTANT_POLICY } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { BrioSections } from '@/components/ui/brio-sections'
import { ShimmerBar } from '@/components/ui/shimmer'
import { InsightCard } from '@/components/dashboard/insight-card'
import { buildDemoFirmBrief } from '@/lib/demo/demo-brio'
import type { DemoFirm } from '@/lib/demo/static-demo-data'

/**
 * Static counterpart to AiFirmBrief (components/dashboard/ai-firm-brief.tsx): the same flat section,
 * written from the demo firm's sample data instead of by the model (lib/demo/demo-brio.ts). Built
 * after mount, since it reads "today" and the server's day may not be the visitor's.
 */
export function DemoFirmBrief({ firm }: { firm: DemoFirm }) {
    const [content, setContent] = useState<string | null>(null)
    useEffect(() => setContent(buildDemoFirmBrief(firm)), [firm])

    return (
        <div data-demo-tour="firm-brief">
            <InsightCard title="Today's brief" icon={Newspaper} theme="blue" titleAddon={<Brio className="text-small" />}>
                <div className="pt-4">
                    {content ? (
                        <BrioSections content={content} className="text-fg-muted" />
                    ) : (
                        <div className="space-y-2" aria-busy="true">
                            <ShimmerBar className="w-full" />
                            <ShimmerBar className="w-[92%]" />
                            <ShimmerBar className="w-[78%]" />
                        </div>
                    )}
                    <p className="mt-3 text-caption text-fg-subtle">
                        Written by <Brio /> from the demo firm&apos;s sample data. {ASSISTANT_POLICY.short}
                    </p>
                </div>
            </InsightCard>
        </div>
    )
}
