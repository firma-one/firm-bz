'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Shield, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AiEfficacyReport } from '@/lib/ai/feedback'
import { REASON_LABELS } from '@/lib/ai/feedback-reasons'

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
    filesAgent: 'Files agent',
}

/**
 * Imported rather than redeclared: a local copy silently drifts from the picker, and a reason added
 * to the chip list would then render here as a raw enum value.
 */
const LABELS: Record<string, string> = { ...REASON_LABELS, unspecified: 'No reason given' }

const WINDOWS = [7, 30, 90] as const

export default function AiEfficacyPage() {
    const [days, setDays] = useState<number>(30)
    /** Null means every firm. Set by clicking a row in the per-firm table. */
    const [firmId, setFirmId] = useState<string | null>(null)
    const [report, setReport] = useState<AiEfficacyReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async (window: number, firm: string | null) => {
        setLoading(true)
        setError(null)
        try {
            const qs = new URLSearchParams({ days: String(window) })
            if (firm) qs.set('firmId', firm)
            const res = await fetch(`/api/system/ai-efficacy?${qs}`, { cache: 'no-store' })
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

    useEffect(() => { void load(days, firmId) }, [load, days, firmId])

    /** Shown when a firm filter is active, so the scope of every figure below is never ambiguous. */
    const activeFirm = report?.byFirm.find((f) => f.firmId === firmId) ?? null

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

                {/* A filter that is not visible is a filter that misleads: every figure below is
                    scoped to this firm, so the scope has to be stated and reversible from here. */}
                {firmId ? (
                    <button
                        type="button"
                        onClick={() => setFirmId(null)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-100"
                    >
                        {activeFirm?.firmName ?? 'One firm'}
                        <span className="text-gray-400">· clear</span>
                    </button>
                ) : null}
            </div>

            {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            {loading ? <p className="text-sm text-gray-500">Loading…</p> : null}

            {report && !loading ? (
                report.totalRatings === 0 ? (
                    <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                        No ratings {firmId ? 'for this firm ' : ''}in this window yet. Thumbs appear under every answer in the
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

                        {report.positiveReasonCounts.length > 0 ? (
                            <section className="rounded-lg border border-gray-200 p-4">
                                <h2 className="mb-2 text-sm font-semibold text-gray-900">What users valued</h2>
                                {/* The counterpart to the complaints below. A thumbs-up alone says
                                    only "fine"; these say which capability is worth protecting when
                                    a prompt is edited. */}
                                <div className="flex flex-wrap gap-2">
                                    {report.positiveReasonCounts.map((r) => (
                                        <span
                                            key={r.reason}
                                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800"
                                        >
                                            {LABELS[r.reason] ?? r.reason}
                                            <span className="ml-1.5 font-medium tabular-nums">{r.count}</span>
                                        </span>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {report.reasonCounts.length > 0 ? (
                            <section className="rounded-lg border border-gray-200 p-4">
                                <h2 className="mb-2 text-sm font-semibold text-gray-900">Why answers were unhelpful</h2>
                                <div className="flex flex-wrap gap-2">
                                    {report.reasonCounts.map((r) => (
                                        <span
                                            key={r.reason}
                                            className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                                        >
                                            {LABELS[r.reason] ?? r.reason}
                                            <span className="ml-1.5 font-medium tabular-nums">{r.count}</span>
                                        </span>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {report.byFirm.length > 0 ? (
                            <section className="rounded-lg border border-gray-200">
                                <div className="border-b border-gray-100 px-4 py-2.5">
                                    <h2 className="text-sm font-semibold text-gray-900">By firm</h2>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                        Worst first. Click a firm to narrow everything on this page
                                        to that account.
                                    </p>
                                </div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                                            <th className="px-4 py-2 font-medium">Firm</th>
                                            <th className="px-4 py-2 text-right font-medium">Good</th>
                                            <th className="px-4 py-2 text-right font-medium">Bad</th>
                                            <th className="px-4 py-2 text-right font-medium">Helpful</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.byFirm.map((f) => (
                                            <tr
                                                key={f.firmId}
                                                onClick={() => setFirmId(firmId === f.firmId ? null : f.firmId)}
                                                className={`cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${
                                                    firmId === f.firmId ? 'bg-gray-50' : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <td className="px-4 py-2 text-gray-900">
                                                    {f.firmName ?? <span className="text-gray-400">Unnamed firm</span>}
                                                </td>
                                                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{f.helpful}</td>
                                                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{f.unhelpful}</td>
                                                <td className="px-4 py-2 text-right tabular-nums">
                                                    {f.helpfulPct === null ? (
                                                        <span className="text-xs text-gray-400">too few ({f.total})</span>
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
                        ) : null}

                        {report.recentNegatives.length > 0 ? (
                            <section className="rounded-lg border border-gray-200">
                                <div className="border-b border-gray-100 px-4 py-2.5">
                                    <h2 className="text-sm font-semibold text-gray-900">Recent unhelpful answers</h2>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                        The question asked, never the answer given — answers are
                                        derived from engagement data and are not stored. Reporter
                                        details are shown so you can follow up offline.
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
                                                        {LABELS[n.reason] ?? n.reason}
                                                    </span>
                                                ) : null}
                                                <span className="text-[10px] text-gray-400">
                                                    {new Date(n.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            {/* Questions are no longer stored, so this is empty on
                                                every new row and populated only on rows written
                                                before that change. The reason chip is the signal
                                                now; the question was text a user typed and could
                                                name a client. */}
                                            {n.question ? (
                                                <p className="mt-0.5 text-sm text-gray-700">{n.question}</p>
                                            ) : (
                                                <p className="mt-0.5 text-sm italic text-gray-400">Question not recorded</p>
                                            )}
                                            {/* Who to talk to and what about. Names are joined at
                                                read time from ids — the feedback table itself
                                                stores no business names. */}
                                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                                                {n.firmName ? <span className="text-gray-700">{n.firmName}</span> : null}
                                                {n.clientName ? <span>· {n.clientName}</span> : null}
                                                {n.engagementName ? <span>· {n.engagementName}</span> : null}
                                                {/* Links to the user lookup, which takes an email
                                                    or user id — the one admin page that can show
                                                    this reporter's full picture before you contact
                                                    them. */}
                                                {n.userEmail ? (
                                                    <Link
                                                        href={`/system/user-data-map?identifier=${encodeURIComponent(n.userEmail)}`}
                                                        className="ml-auto underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
                                                        title={n.userEmail}
                                                    >
                                                        {n.userName ?? n.userEmail}
                                                    </Link>
                                                ) : n.userName ? (
                                                    <span className="ml-auto">{n.userName}</span>
                                                ) : null}
                                            </div>
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
