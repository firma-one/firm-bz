'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Pencil, RotateCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { EntitlementView, OverridableEntitlement } from '@/lib/billing/entitlement-resync'

/**
 * System-admin entitlement panel for one billing group.
 *
 * Exists because entitlements in `platform.subscriptions.settings.metadata` are a point-in-time
 * snapshot: Polar sends no webhook when a product's metadata is edited, so a dashboard change never
 * reaches existing subscribers on its own. This surfaces the drift and lets an admin resync it.
 *
 * Every value is labelled by ORIGIN — synced / overridden / missing — because an override that
 * looks like a synced value is how the next person loses an hour. A missing published entitlement
 * is called out loudly: those fail OPEN (an unset allowance means "unknown", which the credit cap
 * treats as uncapped), so the dangerous state looks identical to the healthy one in raw data.
 */

type ApiResponse = {
    view?: EntitlementView
    overridable?: readonly string[]
    resync?: {
        status: 'synced' | 'no-subscription' | 'no-product'
        changed: Array<{ key: string; from: unknown; to: unknown }>
        message: string
    }
    error?: string
}

const LABELS: Record<string, string> = {
    entitledFirms: 'Firm workspaces',
    entitledClients: 'Clients',
    entitledClientContacts: 'Client contacts',
    entitledEngagements: 'Engagements',
    entitledDeliverables: 'Deliverables',
    entitledDocuments: 'Documents',
    entitledAuditDays: 'Audit history (days)',
    entitledCommentHistoryDays: 'Comment history (days)',
    entitledAiCredits: 'AI credits',
}

/** Advertised on the pricing page; absence is a finding, not a warning. Mirrors the server list. */
const PUBLISHED = new Set(['entitledClients', 'entitledAiCredits', 'entitledAuditDays', 'entitledCommentHistoryDays'])

function relativeAge(iso: string | null): string {
    if (!iso) return 'never'
    const ms = Date.now() - new Date(iso).getTime()
    const days = Math.floor(ms / 86_400_000)
    if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`
    const hours = Math.floor(ms / 3_600_000)
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    return 'just now'
}

export function EntitlementsPanel({ groupId }: { groupId: string }) {
    const [view, setView] = useState<EntitlementView | null>(null)
    const [keys, setKeys] = useState<readonly string[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState<Record<string, string>>({})
    const [note, setNote] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/system/entitlements?groupId=${encodeURIComponent(groupId)}`, {
                cache: 'no-store',
            })
            const body = (await res.json().catch(() => ({}))) as ApiResponse
            if (!res.ok || !body.view) {
                setError(body.error ?? 'Could not load entitlements')
                return
            }
            setView(body.view)
            setKeys(body.overridable ?? [])
        } catch {
            setError('Could not load entitlements')
        } finally {
            setLoading(false)
        }
    }, [groupId])

    useEffect(() => { void load() }, [load])

    const resync = useCallback(async () => {
        setBusy(true)
        setMessage(null)
        setError(null)
        try {
            const res = await fetch('/api/system/entitlements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId }),
            })
            const body = (await res.json().catch(() => ({}))) as ApiResponse
            if (!res.ok || !body.view) {
                setError(body.error ?? 'Resync failed')
                return
            }
            setView(body.view)
            // Name the keys that moved — "updated 1 entitlement" without saying which is the kind
            // of message that makes an admin re-check by hand.
            const changed = body.resync?.changed ?? []
            setMessage(
                changed.length === 0
                    ? (body.resync?.message ?? 'Already up to date.')
                    : `${body.resync?.message} ${changed.map((c) => `${LABELS[c.key] ?? c.key}: ${String(c.from ?? '—')} → ${String(c.to ?? '—')}`).join('; ')}`,
            )
        } catch {
            setError('Resync failed')
        } finally {
            setBusy(false)
        }
    }, [groupId])

    const startEditing = useCallback(() => {
        // Prefill with the EFFECTIVE value — what enforcement uses right now — not just the
        // existing override. Starting from empty boxes left the admin editing blind: they could
        // see "synced: 3" in a label but had no sense of what the field currently means, and a
        // value typed next to a blank neighbour looked like the only setting that mattered.
        //
        // The consequence is that saving re-sends values equal to the synced one. Those are
        // dropped rather than stored as overrides (see `changedFrom` below), so prefilling does
        // not silently convert every synced value into a pinned override.
        const current: Record<string, string> = {}
        for (const k of keys) {
            const v = view?.effective?.[k]
            current[k] = v != null && v !== '' ? String(v) : ''
        }
        setDraft(current)
        setNote(view?.overrides?.note ?? '')
        setEditing(true)
        setMessage(null)
        setError(null)
    }, [keys, view])

    const saveOverrides = useCallback(async () => {
        setBusy(true)
        setMessage(null)
        setError(null)
        try {
            // Only values that DIFFER from the synced one become overrides. The form is prefilled
            // with the effective values so the admin can see what they are changing, which means
            // most fields come back untouched — storing those would pin every entitlement and
            // make the next Polar change silently ineffective.
            //
            // null means "no override": either the field was cleared, or it matches the synced
            // value and needs no pinning.
            const values: Record<string, string | null> = {}
            for (const k of keys) {
                const typed = draft[k]?.trim() ?? ''
                const synced = view?.synced?.[k]
                const syncedStr = synced != null ? String(synced) : ''
                values[k] = typed === '' || typed === syncedStr ? null : typed
            }

            const res = await fetch('/api/system/entitlements', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId, values, note }),
            })
            const body = (await res.json().catch(() => ({}))) as ApiResponse
            if (!res.ok || !body.view) {
                setError(body.error ?? 'Could not save overrides')
                return
            }
            setView(body.view)
            setEditing(false)
            setMessage('Overrides saved and resynced from Polar.')
        } catch {
            setError('Could not save overrides')
        } finally {
            setBusy(false)
        }
    }, [groupId, keys, draft, note, view])

    if (loading) {
        return <p className="mt-2 text-xs text-gray-500">Loading entitlements…</p>
    }

    if (!view?.hasActiveSubscription) {
        return (
            <p className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                No active subscription for this billing group — nothing to sync or override.
            </p>
        )
    }

    const overrideKeys = new Set(Object.keys(view.overrides?.values ?? {}))

    // How many fields currently diverge from Polar — drives both the button label and whether a
    // note is required. Computed from the same rule the save uses, so the count cannot disagree
    // with what is actually stored.
    const pendingOverrideCount = keys.filter((k) => {
        const typed = draft[k]?.trim() ?? ''
        const synced = view.synced[k]
        const syncedStr = synced != null ? String(synced) : ''
        return typed !== '' && typed !== syncedStr
    }).length

    return (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Entitlements
                </p>
                <span className="text-xs text-gray-500">
                    {view.plan ?? 'unknown plan'} · {view.isPaid ? 'paid' : 'free'} · snapshot {relativeAge(view.snapshotUpdatedAt)}
                </span>
                <div className="ml-auto flex gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void resync()}>
                        <RotateCw className={cn('mr-2 h-3.5 w-3.5', busy && 'animate-spin')} />
                        {busy ? 'Working…' : 'Resync from Polar'}
                    </Button>
                    {editing ? (
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
                            <X className="mr-2 h-3.5 w-3.5" />
                            Cancel
                        </Button>
                    ) : (
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={startEditing}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Override
                        </Button>
                    )}
                </div>
            </div>

            {view.missingPublished.length > 0 ? (
                <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        <strong>Not enforced:</strong>{' '}
                        {view.missingPublished.map((k) => LABELS[k] ?? k).join(', ')} missing from this
                        subscription. An unset allowance reads as &ldquo;unknown&rdquo;, which fails
                        open — so this is currently uncapped. Resync from Polar to populate it.
                    </span>
                </p>
            ) : null}

            {/* A key that looks like an entitlement but is not one is being ignored outright, so
                whatever it was meant to cap is uncapped. The parsers used to silently accept a few
                known misspellings; they no longer do, which makes reporting them essential. */}
            {view.unknownKeys.length > 0 ? (
                <p className="mt-2 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        <strong>Misspelled key{view.unknownKeys.length === 1 ? '' : 's'}:</strong>{' '}
                        {view.unknownKeys.map((k, i) => (
                            <span key={k}>
                                {i > 0 ? ', ' : ''}
                                <code className="font-mono">{k}</code>
                            </span>
                        ))}
                        . Enforcement ignores these, so whatever they were meant to limit is
                        uncapped. Fix the spelling in the Polar product, then resync.
                    </span>
                </p>
            ) : null}

            {/* Not an error: the view resolves the product id from metadata only, to avoid a Polar
                round-trip on every render. Resync has a further fallback that reads the Polar
                subscription, so this is informational — it explains WHY a resync is needed. */}
            {view.productIdSource === 'none' ? (
                <p className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    No product id stored on this subscription — it was written before the snapshot
                    carried one. Resync will recover it from the Polar subscription and store it.
                </p>
            ) : null}

            {message ? (
                <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    {message}
                </p>
            ) : null}
            {error ? (
                <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </p>
            ) : null}

            {editing ? (
                <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {keys.map((k) => {
                            const synced = view.synced[k]
                            const syncedStr = synced != null && synced !== '' ? String(synced) : ''
                            const typed = draft[k]?.trim() ?? ''
                            // Flag only a real divergence, so the admin can see at a glance which
                            // fields they have actually altered in this sitting.
                            const willOverride = typed !== '' && typed !== syncedStr
                            return (
                                <label key={k} className="flex flex-col gap-1">
                                    <span className="flex items-baseline gap-1.5 text-[11px] text-gray-600">
                                        {LABELS[k] ?? k}
                                        {willOverride ? (
                                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 text-[10px] text-indigo-700">
                                                override
                                            </span>
                                        ) : null}
                                    </span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={draft[k] ?? ''}
                                        placeholder={syncedStr ? `${syncedStr} (from Polar)` : 'not set — uncapped'}
                                        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                                        className={cn(
                                            'rounded border px-2 py-1 text-sm',
                                            willOverride ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300',
                                        )}
                                    />
                                    <span className="text-[10px] text-gray-400">
                                        {/* -1 is Polar's "unlimited" convention and reads as a bug
                                            otherwise; spell it out rather than showing a bare -1. */}
                                        Polar: {syncedStr === '-1' ? 'unlimited (-1)' : syncedStr || 'not set'}
                                    </span>
                                </label>
                            )
                        })}
                    </div>
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-gray-600">
                            Note{' '}
                            <span className="text-gray-400">
                                {pendingOverrideCount > 0
                                    ? '(required — why this exception exists)'
                                    : '(not needed — nothing is overridden)'}
                            </span>
                        </span>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g. Pilot customer — agreed 1000 credits/mo for 3 months"
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                    </label>
                    <p className="text-[11px] text-gray-500">
                        Fields start at the value enforcement uses today. Change one to override it;
                        leave it alone — or clear it — and Polar stays authoritative. Use <code>-1</code> for
                        unlimited. Saving resyncs from Polar, so the values shown afterwards are what
                        enforcement will actually use.
                    </p>
                    {/* The note is only required when something is actually being overridden —
                        demanding one to CLEAR every override would be a dead end. */}
                    <Button
                        type="button"
                        size="sm"
                        disabled={busy || (pendingOverrideCount > 0 && !note.trim())}
                        onClick={() => void saveOverrides()}
                    >
                        {busy
                            ? 'Saving…'
                            : pendingOverrideCount === 0
                                ? 'Clear overrides and resync'
                                : `Save ${pendingOverrideCount} override${pendingOverrideCount === 1 ? '' : 's'} and resync`}
                    </Button>
                </div>
            ) : (
                <>
                    <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                        {keys.map((k) => {
                            const value = view.effective[k]
                            const isMissing = value === undefined || value === null || value === ''
                            const isOverridden = overrideKeys.has(k)
                            return (
                                <div key={k} className="min-w-0">
                                    <dt className="text-[11px] uppercase text-gray-500">{LABELS[k] ?? k}</dt>
                                    <dd className="flex items-baseline gap-1.5 text-sm">
                                        <span
                                            className={cn(
                                                'font-medium tabular-nums',
                                                isMissing && PUBLISHED.has(k) ? 'text-amber-700' : 'text-gray-900',
                                            )}
                                        >
                                            {isMissing ? 'not set' : String(value) === '-1' ? 'unlimited' : String(value)}
                                        </span>
                                        {isOverridden ? (
                                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 text-[10px] text-indigo-700">
                                                override
                                            </span>
                                        ) : isMissing ? (
                                            <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700">
                                                uncapped
                                            </span>
                                        ) : null}
                                    </dd>
                                </div>
                            )
                        })}
                    </dl>
                    {view.overrides ? (
                        <p className="mt-2 text-[11px] text-gray-500">
                            Overridden {relativeAge(view.overrides.setAt)}
                            {view.overrides.note ? ` — ${view.overrides.note}` : ''}
                        </p>
                    ) : null}
                </>
            )}
        </div>
    )
}
