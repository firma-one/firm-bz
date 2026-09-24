'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { formatRelativeTime } from '@/lib/utils'
import { ASSISTANT, ASSISTANT_POLICY } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { BrioSections } from '@/components/ui/brio-sections'

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

    useEffect(() => {
        if (!accessToken) return
        let cancelled = false

        setLoading(true)
        fetch(`/api/firms/${firmId}/ai-brief`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
            .then((r) => r.json())
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
        try {
            const res = await fetch(`/api/firms/${firmId}/ai-brief`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
            })
            const d = await res.json()
            if (d.brief) setBrief(d.brief)
        } catch {
            // Keep the existing brief on screen rather than blanking it.
        } finally {
            setRefreshing(false)
        }
    }, [firmId, accessToken, refreshing])

    if (!configured) return null

    if (loading) {
        return (
            <div className="bg-white border border-[#e5e7eb] rounded p-6 shadow-sm mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-gray-900">Today&apos;s brief</span>
                    <span className="text-gray-300">·</span>
                    <Brio className="text-sm text-primary" />
                </div>
                <div className="space-y-2 animate-pulse">
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-[92%]" />
                    <div className="h-3 bg-gray-100 rounded w-[78%]" />
                </div>
            </div>
        )
    }

    if (!brief) return null

    return (
        <div className="bg-white border border-[#e5e7eb] rounded p-6 shadow-sm mb-6">
            <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Today&apos;s brief</span>
                    <span className="text-gray-300">·</span>
                    <Brio className="text-sm text-primary" />
                </div>
                <button
                    onClick={refresh}
                    disabled={refreshing}
                    className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 shrink-0"
                    title={`Ask ${ASSISTANT.name} to rewrite this`}
                    aria-label={`Ask ${ASSISTANT.name} to rewrite this`}
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <BrioSections content={brief.content} className="text-gray-700" />

            <p className="text-xs text-gray-400 mt-3">
                Written by <Brio /> {formatRelativeTime(brief.generatedAt)} from your current data. {ASSISTANT_POLICY.short}
            </p>
        </div>
    )
}
