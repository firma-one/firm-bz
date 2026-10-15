'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { formatRelativeTime } from '@/lib/utils'
import { ASSISTANT, ASSISTANT_POLICY } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { Button } from '@/components/ui/button'
import { ShimmerBar } from '@/components/ui/shimmer'
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

    if (loading) {
        return (
            <div className="mb-6 rounded-card border border-line bg-surface p-5">
                <div className="mb-3 flex items-center gap-1.5">
                    <span className="text-small font-medium text-fg-muted">Today&apos;s brief</span>
                    <Brio className="text-small" />
                </div>
                <div className="space-y-2" aria-busy="true">
                    <ShimmerBar className="w-full" />
                    <ShimmerBar className="w-[92%]" />
                    <ShimmerBar className="w-[78%]" />
                </div>
            </div>
        )
    }

    if (!brief) return null

    return (
        <div className="mb-6 rounded-card border border-line bg-surface p-5">
            <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex items-center gap-1.5">
                    <span className="text-small font-medium text-fg-muted">Today&apos;s brief</span>
                    <Brio className="text-small" />
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={refresh}
                    disabled={refreshing}
                    className="h-7 w-7 shrink-0"
                    title={`Ask ${ASSISTANT.name} to rewrite this`}
                    aria-label={`Ask ${ASSISTANT.name} to rewrite this`}
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {refreshError && (
                <p role="status" className="mb-3 rounded-control bg-tag-yellow-bg px-2.5 py-1.5 text-small text-tag-yellow-fg">
                    {refreshError}
                </p>
            )}

            <BrioSections content={brief.content} className="text-fg-muted" />

            <p className="mt-3 text-caption text-fg-subtle">
                Written by <Brio /> {formatRelativeTime(brief.generatedAt)} from your current data. {ASSISTANT_POLICY.short}
            </p>
        </div>
    )
}
