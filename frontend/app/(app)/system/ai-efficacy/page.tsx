'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Shield, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AiEfficacyReport } from '@/lib/ai/feedback'

/**
 * AI efficacy — thumbs up/down rates across all firms.
 *
 * Deliberately thin. It answers two questions and no more: is Brio getting better or worse, and
 * what is it bad at. Richer analytics would mostly render empty at current volume, and the point of
 * this feedback is to tell a person which prompt to go and fix.
 */

type ApiResponse = { data?: AiEfficacyReport; error?: string }

const FEATURE_LABELS: Record<string, string> = {
    chat: 'Engagement assistant',
    summary: 'Engagement summaries',
    brief: 'Firm briefs',
    searchInterpret: 'Doc Search',
}

const REASON_LABELS: Record<string, string> = {
    inaccurate: 'Inaccurate or wrong',
    incomplete: 'Missing information',
    refused: "Wouldn't answer",
    confusing: 'Hard to understand',
    other: 'Something else',
    unspecified: 'No reason given',
}

const WINDOWS = [7, 30, 90] as const

export default function AiEfficacyPage() {
    const [days, setDays] = useState<number>(30)
    const [report, setReport] = useState<AiEfficacyReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async (window: number) => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/system/ai-efficacy?days=${window}`, { cache: 'no-store' })
            const body = (await res.json().catch(() => ({}))) as ApiResponse
            if (!res.ok || !body.data) {
                setReport(null)
                setError(body.error ?? 'Could not load AI efficacy')
                return
            }
            setReport(body.data)
        } catch {
            setReport(null)
            setError('Could not load AI efficacy')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { void load(days) }, [load, days])

    return (
        <div className="flex flex-col space-y-6">
            <nav className="flex items-center text-sm text-gray-500">
                <Link href="/system" className="flex items-center hover:text-gray-900 transition-colors">
                    <Shield className="w-4 h-4" />
                </Link>
                <ChevronRight className="w-4 h-4 mx-2" />
                <Link href="/system" className="hover:text-gray-900 transition-colors">Administration</Link>
                <ChevronRight className="w-4 h-4 mx-2" />
                <span className="font-medium text-gray-900">AI Efficacy</span>
            </nav>

            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                    <Sparkles className="h-5 w-5 text-gray-700" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">AI Efficacy</h1>
                    <p className="mt-1 text-gray-500">
                        How users rate AI answers. Ratings do not change the model — they show which
                        prompts need work.
                    </p>
                </div>
            </div>

            <div className="flex gap-2">
                {WINDOWS.map((w) => (
                    <Button
                        key={w}
                        type="button"
                        variant={days === w ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDays(w)}
                    >
                        Last {w} days
                    </Button>
                ))}
            </div>

            {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            {loading ? <p className="text-sm text-gray-500">Loading…</p> : null}

            {report && !loading ? (
                report.totalRatings === 0 ? (
                    <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                        No ratings in this window yet. Thumbs appear under every answer in the
                        engagement assistant.
                    </p>
                ) : (
                    <>
                        <section className="rounded-lg border border-gray-200">
                            <div className="border-b border-gray-100 px-4 py-2.5">
                                <h2 className="text-sm font-semibold text-gray-900">By feature</h2>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                    <tr>
                                        <th className="px-4 py-2 font-medium">Feature</th>
                                        <th className="px-4 py-2 font-medium">Helpful</th>
                                        <th className="px-4 py-2 font-medium">Unhelpful</th>
                                        <th className="px-4 py-2 font-medium">Rate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.byFeature.map((f) => (
                                        <tr key={f.feature}>
                                            <td className="px-4 py-2 font-medium text-gray-900">
                                                {FEATURE_LABELS[f.feature] ?? f.feature}
                                            </td>
                                            <td className="px-4 py-2 tabular-nums text-gray-700">
                                                <span className="inline-flex items-center gap-1">
                                                    <ThumbsUp className="h-3 w-3 text-primary" />{f.helpful}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 tabular-nums text-gray-700">
                                                <span className="inline-flex items-center gap-1">
                                                    <ThumbsDown className="h-3 w-3 text-amber-600" />{f.unhelpful}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 tabular-nums">
                                                {/* Below the sample threshold a percentage misleads:
                                                    1 of 2 reads as "50% unhelpful" when it is one
                                                    data point. */}
                                                {f.helpfulPct === null ? (
                                                    <span className="text-xs text-gray-400">
                                                        too few ({f.total})
                                                    </span>
                                                ) : (
                                                    <span className={f.helpfulPct >= 70 ? 'text-gray-900' : 'font-medium text-amber-700'}>
                                                        {f.helpfulPct}%
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>

                        {report.reasonCounts.length > 0 ? (
                            <section className="rounded-lg border border-gray-200 p-4">
                                <h2 className="mb-2 text-sm font-semibold text-gray-900">Why answers were unhelpful</h2>
                                <div className="flex flex-wrap gap-2">
                                    {report.reasonCounts.map((r) => (
                                        <span
                                            key={r.reason}
                                            className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                                        >
                                            {REASON_LABELS[r.reason] ?? r.reason}
                                            <span className="ml-1.5 font-medium tabular-nums">{r.count}</span>
                                        </span>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {report.recentNegatives.length > 0 ? (
                            <section className="rounded-lg border border-gray-200">
                                <div className="border-b border-gray-100 px-4 py-2.5">
                                    <h2 className="text-sm font-semibold text-gray-900">Recent unhelpful answers</h2>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                        The question asked, never the answer given — answers are
                                        derived from engagement data and are not stored.
                                    </p>
                                </div>
                                <ul className="divide-y divide-gray-100">
                                    {report.recentNegatives.map((n, i) => (
                                        <li key={`${n.createdAt}-${i}`} className="px-4 py-2.5">
                                            <div className="flex flex-wrap items-baseline gap-2">
                                                <span className="text-xs font-medium text-gray-900">
                                                    {FEATURE_LABELS[n.feature] ?? n.feature}
                                                </span>
                                                {n.reason ? (
                                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-800">
                                                        {REASON_LABELS[n.reason] ?? n.reason}
                                                    </span>
                                                ) : null}
                                                <span className="text-[10px] text-gray-400">
                                                    {new Date(n.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            {n.question ? (
                                                <p className="mt-0.5 text-sm text-gray-700">{n.question}</p>
                                            ) : (
                                                <p className="mt-0.5 text-sm italic text-gray-400">No question (generated surface)</p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}
                    </>
                )
            ) : null}
        </div>
    )
}
