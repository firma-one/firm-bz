'use client'

import { FormEvent, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Copy, Database, Search, Shield, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import type { UserDataMapResult } from '@/lib/system/user-data-map'

type ApiResponse = { data?: UserDataMapResult; error?: string }

type HardResetApiResponse = {
    data?: {
        firmAdminFirmIds: string[]
        deletedNotifications: number
        deletedCustomerRequests: number
        deletedFirms: number
        deletedOrphanConnectors: number
        deletedUserPersonalizations: number
        deletedSystemAdmins: number
        noOp: boolean
    }
    error?: string
}

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
    const tone =
        severity === 'critical'
            ? 'border-red-200 bg-red-50 text-red-700'
            : severity === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-slate-200 bg-slate-50 text-slate-700'
    return (
        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase', tone)}>
            {severity}
        </span>
    )
}

export default function UserDataMapPage() {
    const [identifier, setIdentifier] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<UserDataMapResult | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [hardResetOpen, setHardResetOpen] = useState(false)
    const [confirmUserId, setConfirmUserId] = useState('')
    const [hardResetLoading, setHardResetLoading] = useState(false)
    const [hardResetError, setHardResetError] = useState<string | null>(null)

    const sortedFindings = useMemo(() => {
        if (!result) return []
        const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 }
        return [...result.findings].sort((a, b) => rank[a.severity] - rank[b.severity])
    }, [result])

    const loadMap = useCallback(async (value: string) => {
        if (!value) return
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/system/user-data-map?identifier=${encodeURIComponent(value)}`, {
                cache: 'no-store',
            })
            const body = (await response.json().catch(() => ({}))) as ApiResponse
            if (!response.ok || !body.data) {
                setResult(null)
                setError(body.error ?? 'Could not load user data map')
                return
            }
            setResult(body.data)
        } catch {
            setResult(null)
            setError('Could not load user data map')
        } finally {
            setLoading(false)
        }
    }, [])

    const onSubmit = (event: FormEvent) => {
        event.preventDefault()
        void loadMap(identifier.trim())
    }

    const normalizedConfirm = confirmUserId.trim().toLowerCase()
    const normalizedTargetId = result?.targetUser.id.trim().toLowerCase() ?? ''
    const confirmMatchesTarget = normalizedConfirm.length > 0 && normalizedConfirm === normalizedTargetId

    const runHardReset = async () => {
        if (!result || !confirmMatchesTarget) return
        setHardResetLoading(true)
        setHardResetError(null)
        try {
            const response = await fetch('/api/system/user-data-map/hard-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetUserId: result.targetUser.id,
                    confirmUserId: confirmUserId.trim(),
                }),
            })
            const body = (await response.json().catch(() => ({}))) as HardResetApiResponse
            if (!response.ok || !body.data) {
                setHardResetError(body.error ?? 'Hard reset failed')
                return
            }
            setHardResetOpen(false)
            setConfirmUserId('')
            await loadMap(identifier.trim())
        } catch {
            setHardResetError('Hard reset failed')
        } finally {
            setHardResetLoading(false)
        }
    }

    const copySql = async (id: string, sql: string) => {
        try {
            await navigator.clipboard.writeText(sql)
            setCopiedId(id)
            window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500)
        } catch {
            setCopiedId(null)
        }
    }

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex flex-col space-y-4">
                <nav className="flex items-center text-sm text-gray-500">
                    <Link href="/system" className="flex items-center hover:text-gray-900 transition-colors">
                        <Shield className="w-4 h-4" />
                    </Link>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <Link href="/system" className="hover:text-gray-900 transition-colors">
                        Administration
                    </Link>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <span className="font-medium text-gray-900">User Data Map</span>
                </nav>

                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                        <Database className="h-5 w-5 text-gray-700" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">User Data Map</h1>
                        <p className="text-gray-500 mt-1">
                            Read-only diagnostics for user workspace integrity and recovery recommendations.
                        </p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Read-only diagnostics by default. Hard reset (below) runs the same platform deletes as the firm_admin
                cascade SQL script; it does not remove the Supabase auth user.
            </div>

            <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <label htmlFor="identifier" className="mb-2 block text-sm font-medium text-gray-700">
                    Target user (email or UUID)
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                        id="identifier"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="name@example.com or 00000000-0000-0000-0000-000000000000"
                        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500"
                    />
                    <Button type="submit" disabled={loading || !identifier.trim()} className="h-10 min-w-32">
                        <Search className="mr-2 h-4 w-4" />
                        {loading ? 'Inspecting…' : 'Inspect'}
                    </Button>
                </div>
                {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            </form>

            {result ? (
                <>
                    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
                        <MetricCard label="Memberships" value={result.summary.memberships} />
                        <MetricCard label="Firm admins" value={result.summary.firmAdminMemberships} />
                        <MetricCard label="Default memberships" value={result.summary.defaultMemberships} />
                        <MetricCard label="Onboarding complete" value={result.summary.onboardingCompleteFirms} />
                        <MetricCard label="Discrepancies" value={result.summary.discrepancyCount} emphasize />
                    </section>

                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">Target user</h2>
                            <Button
                                type="button"
                                variant="destructive"
                                className="shrink-0"
                                onClick={() => {
                                    setHardResetError(null)
                                    setConfirmUserId('')
                                    setHardResetOpen(true)
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Hard reset firm_admin data
                            </Button>
                        </div>
                        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                            <DataRow label="User ID" value={result.targetUser.id} mono />
                            <DataRow label="Email" value={result.targetUser.email ?? 'N/A'} />
                            <DataRow
                                label="System admin metadata"
                                value={String(result.targetUser.appMetadata.role ?? 'N/A')}
                            />
                            <DataRow
                                label="User personalization"
                                value={result.operational.userPersonalizationExists ? 'Present' : 'Missing'}
                            />
                            <DataRow label="Notifications (user)" value={String(result.operational.notificationsForUser)} />
                            <DataRow
                                label="Customer requests (user/scope)"
                                value={String(result.operational.customerRequestsForUser)}
                            />
                        </dl>
                    </section>

                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-900">Findings</h2>
                        <div className="mt-3 space-y-3">
                            {sortedFindings.map((finding) => (
                                <article key={finding.id} className="rounded-lg border border-gray-200 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <SeverityBadge severity={finding.severity} />
                                            <span className="text-sm font-semibold text-gray-900">{finding.title}</span>
                                        </div>
                                        <span className="text-xs uppercase text-gray-500">
                                            {finding.recommendedActionType}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm text-gray-600">{finding.evidence}</p>
                                    <div className="mt-2 rounded-md bg-gray-950 p-3">
                                        <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-gray-100">
                                            {finding.sqlPreview}
                                        </pre>
                                    </div>
                                    <div className="mt-2 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => void copySql(finding.id, finding.sqlPreview)}
                                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                            {copiedId === finding.id ? 'Copied' : 'Copy SQL'}
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-900">Firm map</h2>
                        <div className="mt-3 space-y-3">
                            {result.firms.map((firm) => (
                                <article key={`${firm.id}:${firm.role}`} className="rounded-lg border border-gray-200 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-gray-900">
                                            {firm.name} <span className="text-gray-500">/{firm.slug}</span>
                                        </p>
                                        <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs">
                                            {firm.role}
                                        </span>
                                        {firm.isDefault ? (
                                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                                                default
                                            </span>
                                        ) : null}
                                    </div>
                                    <dl className="mt-2 grid grid-cols-1 gap-1 text-sm md:grid-cols-2 xl:grid-cols-3">
                                        <DataRow label="Firm ID" value={firm.id} mono />
                                        <DataRow label="Connector" value={firm.connectorId ?? 'None'} mono />
                                        <DataRow
                                            label="Onboarding"
                                            value={`${firm.onboardingStage ?? 'unknown'} (computed: ${
                                                firm.computedOnboardingComplete ? 'complete' : 'incomplete'
                                            })`}
                                        />
                                        <DataRow label="Billing anchor" value={firm.billing.anchorFirmId} mono />
                                        <DataRow
                                            label="Active subscription"
                                            value={firm.billing.activeSubscription?.status ?? 'none'}
                                        />
                                        <DataRow
                                            label="Coupon"
                                            value={firm.billing.activeSubscription?.couponCode ?? 'none'}
                                        />
                                        <DataRow
                                            label="Counts"
                                            value={`clients ${firm.counts.clients}, engagements ${firm.counts.engagements}, documents ${firm.counts.documents}`}
                                        />
                                        <DataRow
                                            label="Invitations"
                                            value={`firm ${firm.counts.invitations.firm}, client ${firm.counts.invitations.client}, engagement ${firm.counts.invitations.engagement}`}
                                        />
                                        <DataRow
                                            label="Notifications (firm)"
                                            value={String(firm.counts.notificationsForFirm)}
                                        />
                                    </dl>
                                </article>
                            ))}
                        </div>
                    </section>
                </>
            ) : null}

            <Dialog
                open={hardResetOpen}
                onOpenChange={(open) => {
                    setHardResetOpen(open)
                    if (!open) {
                        setConfirmUserId('')
                        setHardResetError(null)
                    }
                }}
            >
                <DialogContent className="max-w-lg border-red-200">
                    <DialogHeader>
                        <DialogTitle className="text-red-700">Hard reset platform data</DialogTitle>
                        <DialogDescription asChild>
                            <div className="space-y-3 text-left text-sm text-gray-700">
                                <p>
                                    This permanently deletes every firm where this user is{' '}
                                    <span className="font-mono text-xs">firm_admin</span> and all rows that cascade from
                                    those firms (clients, engagements, documents, subscriptions, invitations, members,
                                    audit events, and related platform data).
                                </p>
                                <p>It also deletes platform notifications and customer requests tied to those firms or this
                                    user, clears legacy firm connector pointers, removes orphaned connectors owned by this
                                    user, clears user personalization, and removes{' '}
                                    <span className="font-mono text-xs">system.system_admins</span> for this user.</p>
                                <p className="font-medium text-red-800">
                                    This does not delete the Supabase auth account. Firms where the user is only{' '}
                                    <span className="font-mono text-xs">firm_member</span> are left unchanged.
                                </p>
                                {result?.summary.firmAdminMemberships === 0 ? (
                                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        This user has no firm_admin workspaces. The reset will not delete firms or
                                        cascaded workspace data (same as the SQL script early exit).
                                    </p>
                                ) : null}
                                {result ? (
                                    <p className="text-xs text-gray-600">
                                        Target user id (copy into the confirmation field):{' '}
                                        <span className="font-mono break-all">{result.targetUser.id}</span>
                                    </p>
                                ) : null}
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <label htmlFor="hard-reset-confirm" className="text-sm font-medium text-gray-900">
                            Type the target user UUID to confirm
                        </label>
                        <input
                            id="hard-reset-confirm"
                            value={confirmUserId}
                            onChange={(e) => setConfirmUserId(e.target.value)}
                            placeholder="Paste full user id"
                            autoComplete="off"
                            className="h-10 w-full rounded-lg border border-gray-300 px-3 font-mono text-sm outline-none focus:border-red-400"
                        />
                    </div>
                    {hardResetError ? <p className="text-sm text-red-600">{hardResetError}</p> : null}
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={() => setHardResetOpen(false)} disabled={hardResetLoading}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={hardResetLoading || !confirmMatchesTarget}
                            onClick={() => void runHardReset()}
                        >
                            {hardResetLoading ? 'Deleting…' : 'Delete data'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function MetricCard({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
    return (
        <div className={cn('rounded-xl border bg-white p-4 shadow-sm', emphasize ? 'border-amber-300' : 'border-gray-200')}>
            <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
        </div>
    )
}

function DataRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <dt className="text-xs uppercase text-gray-500">{label}</dt>
            <dd className={cn('text-sm text-gray-900', mono && 'font-mono break-all')}>{value}</dd>
        </div>
    )
}
