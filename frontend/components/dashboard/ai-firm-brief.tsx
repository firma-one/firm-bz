'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, Newspaper, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { formatRelativeTime } from '@/lib/utils'
import { ASSISTANT, ASSISTANT_POLICY } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { Hint } from '@/components/ui/tooltip'
import { ShimmerBar } from '@/components/ui/shimmer'
import { InsightCard } from '@/components/dashboard/insight-card'
import { BrioSections } from '@/components/ui/brio-sections'
import { fetchWithTimeout, AI_TIMEOUT_MS, AiTimeoutError } from '@/lib/ai/fetch-timeout'

interface FirmBrief {
    content: string
    generatedAt: string
}

export function AiFirmBrief({ firmId }: { firmId: string }) {
    const { session } = useAuth()
    const accessToken = session?.access_token

    const [brief, setBrief] = useState<FirmBrief | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    // Distinguishes "no API key configured" from "generation failed" — when unconfigured the
    // component renders nothing at all rather than showing an error to every user.
    const [configured, setConfigured] = useState(true)
    const [refreshError, setRefreshError] = useState<string | null>(null)

    useEffect(() => {
        if (!accessToken) return
        let cancelled = false

        setLoading(true)
        fetchWithTimeout(`/api/firms/${firmId}/ai-brief`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        }, AI_TIMEOUT_MS.brief)
            .then((r) => {
                // Without this, a 500 returning an HTML body throws on .json() into the same
                // silent catch as "no brief", making a real failure indistinguishable from
                // having nothing to show.
                if (!r.ok) throw new Error(`Brief request failed (${r.status})`)
                return r.json()
            })
            .then((d) => {
                if (cancelled) return
                setBrief(d.brief ?? null)
                setConfigured(d.configured !== false)
            })
            .catch(() => { if (!cancelled) setBrief(null) })
            .finally(() => { if (!cancelled) setLoading(false) })

        return () => { cancelled = true }
    }, [firmId, accessToken])

    const refresh = useCallback(async () => {
        if (!accessToken || refreshing) return
        setRefreshing(true)
        setRefreshError(null)
        try {
            const res = await fetchWithTimeout(`/api/firms/${firmId}/ai-brief`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
            }, AI_TIMEOUT_MS.brief)
            if (!res.ok) throw new Error(`Refresh failed (${res.status})`)
            const d = await res.json()
            if (d.brief) setBrief(d.brief)
            else throw new Error('No brief returned')
        } catch (e) {
            // Keep the existing brief on screen rather than blanking it, but say the refresh
            // failed: the user pressed a button and silence reads as "nothing happened".
            setRefreshError(
                e instanceof AiTimeoutError
                    ? `${ASSISTANT.name} took too long. The brief below is unchanged.`
                    : `Could not refresh. The brief below is unchanged.`,
            )
        } finally {
            setRefreshing(false)
        }
    }, [firmId, accessToken, refreshing])

    if (!configured) return null

    // The same flat section as the rest of the Overview: a heading row whose height matches the
    // Action Center's, so the two headings line up across the page.
    const rewriteLabel = `Ask ${ASSISTANT.name} to rewrite this`
    const rewrite = (
        <Hint label={rewriteLabel}>
            <button
                type="button"
                onClick={refresh}
                disabled={loading || refreshing}
                className="rounded-control p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50 print:hidden"
                aria-label={rewriteLabel}
            >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
        </Hint>
    )

    if (!loading && !brief) return null

    return (
        <InsightCard title="Today's brief" icon={Newspaper} theme="blue" titleAddon={<Brio className="text-small" />} headerExtra={rewrite}>
            <div className="pt-4">
                {loading || !brief ? (
                    <div className="space-y-2" aria-busy="true">
                        <ShimmerBar className="w-full" />
                        <ShimmerBar className="w-[92%]" />
                        <ShimmerBar className="w-[78%]" />
                    </div>
                ) : (
                    <>
                        {refreshError && (
                            <p role="status" className="mb-3 flex items-center gap-1.5 text-small text-fg-muted">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                {refreshError}
                            </p>
                        )}

                        <BrioSections content={brief.content} className="text-fg-muted" />

                        <p className="mt-3 text-caption text-fg-subtle">
                            Written by <Brio /> {formatRelativeTime(brief.generatedAt)} from your current data. {ASSISTANT_POLICY.short}
                        </p>
                    </>
                )}
            </div>
        </InsightCard>
    )
}
