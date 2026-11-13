'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Clock, Copy, Loader2, Plus, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { CNAME_TARGET } from '@/lib/custom-domains/domain-rules'
import type { SystemDomainFilter, SystemDomainRow } from '@/lib/custom-domains/group-domains'
import type { ReachabilityResult } from '@/lib/custom-domains/reachability'
import {
    addCustomDomainForGroup, approveCustomDomain, checkCustomDomain, listCustomDomains, rejectCustomDomain,
} from '@/lib/actions/system-custom-domains'

/**
 * /system/custom-domains (mock: .claude/plans/custom-domains-mock.html, part 2). Requests from Group
 * admins on the left; on the right the selected one's setup checklist, a live reachability check, and
 * Approve (only once the check passes) or Reject (with a note). "Add for a group" assigns a domain
 * directly, approved: how the subdomains that predate this page get their workspace.
 */

const TABS: { id: SystemDomainFilter; label: string }[] = [
    { id: 'waiting', label: 'Waiting' },
    { id: 'live', label: 'Live' },
    { id: 'unreachable', label: 'Unreachable' },
    { id: 'all', label: 'All' },
]

const STATUS_CHIP: Record<string, { cls: string; label: string; icon: React.ReactNode }> = {
    REQUESTED: { cls: 'bg-status-waiting-bg text-status-waiting-fg', label: 'Waiting', icon: <Clock /> },
    APPROVED: { cls: 'bg-status-done-bg text-status-done-fg', label: 'Live', icon: <CheckCircle2 /> },
    UNREACHABLE: { cls: 'bg-status-problem-bg text-status-problem-fg', label: 'Unreachable', icon: <AlertTriangle /> },
    REJECTED: { cls: 'bg-surface-muted text-fg-muted', label: 'Not approved', icon: <XCircle /> },
    CANCELLED: { cls: 'bg-surface-muted text-fg-muted', label: 'Cancelled', icon: null },
    REMOVED: { cls: 'bg-surface-muted text-fg-muted', label: 'Removed', icon: null },
}

function chipFor(row: SystemDomainRow) {
    return STATUS_CHIP[row.status === 'APPROVED' && !row.reachable ? 'UNREACHABLE' : row.status] ?? STATUS_CHIP.CANCELLED
}

function when(iso: string | Date | null | undefined): string {
    if (!iso) return ''
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function CopyButton({ text }: { text: string }) {
    const { addToast } = useToast()
    return (
        <button type="button" aria-label={`Copy ${text}`} className="ml-1 align-[-2px] text-fg-subtle hover:text-fg"
            onClick={() => void navigator.clipboard?.writeText(text).then(() => addToast({ type: 'success', title: 'Copied' }), () => undefined)}>
            <Copy className="h-3.5 w-3.5" />
        </button>
    )
}

function steps(row: SystemDomainRow): { title: string; detail: React.ReactNode }[] {
    const own = row.kind === 'CUSTOM'
    const out: { title: string; detail: React.ReactNode }[] = [
        own
            ? { title: "Customer's DNS", detail: <>They add CNAME <span className="font-mono">{row.host} → {CNAME_TARGET}</span> · checked by the reachability check below</> }
            : { title: 'Hostinger DNS', detail: <>CNAME <span className="font-mono">{row.host.split('.')[0]}</span> → <span className="font-mono">{CNAME_TARGET}</span><CopyButton text={CNAME_TARGET} /></> },
        { title: 'Vercel · add domain', detail: <>Project firma-bz · Settings · Domains · add <span className="font-mono">{row.host}</span><CopyButton text={row.host} /> (use the CNAME value Vercel shows, if different)</> },
        { title: 'Google Cloud · authorized JavaScript origin', detail: <><span className="font-mono">https://{row.host}</span><CopyButton text={`https://${row.host}`} /> (Firma Auth app)</> },
    ]
    if (own) {
        out.push({ title: 'Supabase · redirect URL', detail: <><span className="font-mono">https://{row.host}/auth/callback</span><CopyButton text={`https://${row.host}/auth/callback`} /> · own domains only; *.firma.bz is already covered</> })
    }
    return out
}

export default function CustomDomainsPage() {
    const { addToast } = useToast()
    const [tab, setTab] = useState<SystemDomainFilter>('waiting')
    const [rows, setRows] = useState<SystemDomainRow[] | null>(null)
    const [counts, setCounts] = useState<Record<'waiting' | 'live' | 'unreachable', number> | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [check, setCheck] = useState<{ id: string; result: ReachabilityResult | 'checking' } | null>(null)
    const [ticked, setTicked] = useState<Record<string, boolean>>({})
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [adding, setAdding] = useState(false)

    const load = useCallback(async (filter: SystemDomainFilter) => {
        const r = await listCustomDomains(filter)
        if (!r.ok) {
            setError(r.error)
            return
        }
        setError(null)
        setRows(r.data.rows)
        setCounts(r.data.counts)
        setSelectedId((cur) => (cur && r.data.rows.some((x) => x.id === cur) ? cur : r.data.rows[0]?.id ?? null))
    }, [])

    useEffect(() => {
        void load(tab)
    }, [tab, load])

    const selected = rows?.find((r) => r.id === selectedId) ?? null

    const runCheck = useCallback(async (id: string) => {
        setCheck({ id, result: 'checking' })
        const r = await checkCustomDomain(id)
        setCheck({ id, result: r.ok ? r.data : { ok: false, message: r.error } })
    }, [])

    // A waiting request is checked when it's opened, so Approve's state is current.
    useEffect(() => {
        setNote('')
        if (selected?.status === 'REQUESTED') void runCheck(selected.id)
        else setCheck(null)
    }, [selected?.id, selected?.status, runCheck])

    const decide = async (approve: boolean) => {
        if (!selected) return
        setBusy(true)
        const r = approve ? await approveCustomDomain(selected.id, note) : await rejectCustomDomain(selected.id, note)
        setBusy(false)
        if (!r.ok) {
            addToast({ type: 'error', title: r.error })
            return
        }
        addToast({ type: 'success', title: approve ? `${selected.host} approved` : `${selected.host} not approved` })
        await load(tab)
    }

    const checkResult = check && selected && check.id === selected.id ? check.result : null
    const checkPassed = checkResult !== null && checkResult !== 'checking' && checkResult.ok

    return (
        <div className="mx-auto max-w-6xl space-y-4 pb-10">
            <nav className="flex items-center gap-1 text-small text-fg-muted">
                <Link href="/system" className="hover:text-fg">System</Link><ChevronRight className="h-3.5 w-3.5" /><span className="text-fg">Custom domains</span>
            </nav>

            {adding ? <AddForGroup onDone={async (added) => { setAdding(false); if (added) await load(tab) }} /> : null}

            <div className="grid overflow-hidden rounded-card border border-line bg-surface lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <div className="min-w-0 border-line lg:border-r">
                    <div className="border-b border-line px-5 pb-3 pt-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h1 className="text-ui font-semibold text-fg">Custom domains</h1>
                                <p className="text-small text-fg-muted">Requests from Group admins. Set each one up on Vercel, then approve.</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" />Add for a group</Button>
                        </div>
                        <div className="mt-3 flex gap-0.5 overflow-x-auto" role="tablist">
                            {TABS.map((t) => (
                                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                                    className={cn('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-small font-medium',
                                        tab === t.id ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:bg-surface-hover')}>
                                    {t.label}
                                    {t.id !== 'all' && counts ? <span className="tabular-nums text-fg-subtle">{counts[t.id]}</span> : null}
                                </button>
                            ))}
                        </div>
                    </div>
                    {error ? <p className="px-5 py-4 text-small text-danger">{error}</p>
                        : rows === null ? <p className="flex items-center gap-2 px-5 py-4 text-small text-fg-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</p>
                        : rows.length === 0 ? <p className="px-5 py-4 text-small text-fg-muted">Nothing here.</p>
                        : rows.map((r) => (
                            <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                                className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line px-5 py-2.5 text-left',
                                    r.id === selectedId ? 'bg-surface-muted' : 'hover:bg-surface-hover')}>
                                <span className="truncate font-medium text-fg">{r.host}</span>
                                <span className="inline-flex h-5 items-center rounded-control bg-surface-muted px-1.5 text-caption text-fg-muted">{r.kind === 'CUSTOM' ? 'Own domain' : 'Subdomain'}</span>
                                <span className="col-span-2 text-caption font-normal text-fg-muted">
                                    {r.groupName} · {r.plan ?? 'No plan'} · {r.requestedByName ?? r.requestedByEmail ?? 'Unknown'} · {when(r.requestedAt)}
                                    {tab === 'all' ? ` · ${chipFor(r).label}` : ''}
                                </span>
                            </button>
                        ))}
                </div>

                <div className="min-w-0 p-5">
                    {!selected ? <p className="text-small text-fg-muted">Select a domain.</p> : (
                        <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="break-all text-ui font-semibold text-fg">{selected.host}</h2>
                                <span className={cn('inline-flex h-5 items-center gap-1 rounded-control px-1.5 text-caption [&_svg]:h-3.5 [&_svg]:w-3.5', chipFor(selected).cls)}>{chipFor(selected).icon}{chipFor(selected).label}</span>
                            </div>
                            <dl className="my-3 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-small">
                                <dt className="text-fg-muted">Workspace</dt><dd className="min-w-0 break-words text-fg">{selected.groupName} <span className="text-fg-muted">· {selected.groupSlug}</span></dd>
                                <dt className="text-fg-muted">Plan</dt><dd className="text-fg">{selected.plan ?? 'No plan'}</dd>
                                <dt className="text-fg-muted">Requested</dt><dd className="min-w-0 break-words text-fg">{selected.requestedByName ?? selected.requestedByEmail ?? 'Unknown'} · {when(selected.requestedAt)}</dd>
                                {selected.reviewedAt ? <><dt className="text-fg-muted">Reviewed</dt><dd className="text-fg">{when(selected.reviewedAt)}{selected.reviewNote ? ` · "${selected.reviewNote}"` : ''}</dd></> : null}
                                {selected.status === 'APPROVED' ? <><dt className="text-fg-muted">Last check</dt><dd className="text-fg">{when(selected.lastCheckedAt) || 'Not yet'}{selected.lastCheckError ? ` · ${selected.lastCheckError}` : ''}</dd></> : null}
                            </dl>

                            {selected.status === 'REQUESTED' ? (
                                <>
                                    <p className="mb-1.5 text-caption text-fg-muted">Set up · your own checklist, not saved</p>
                                    <ol className="border-t border-line">
                                        {steps(selected).map((s, i) => {
                                            const key = `${selected.id}:${i}`
                                            return (
                                                <li key={key} className="flex items-start gap-2.5 border-b border-line py-2.5 text-small">
                                                    <button type="button" role="checkbox" aria-checked={!!ticked[key]} aria-label={s.title}
                                                        onClick={() => setTicked((t) => ({ ...t, [key]: !t[key] }))}
                                                        className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border', ticked[key] ? 'border-fg bg-fg text-surface' : 'border-line-strong')}>
                                                        {ticked[key] ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                                                    </button>
                                                    <span className="min-w-0"><span className="font-medium text-fg">{s.title}</span><br /><span className="break-words text-fg-muted">{s.detail}</span></span>
                                                </li>
                                            )
                                        })}
                                    </ol>
                                </>
                            ) : null}

                            {selected.status === 'REQUESTED' || selected.status === 'APPROVED' ? (
                                <div className="my-4 flex flex-wrap items-center gap-2 rounded-card border border-line px-3 py-2.5 text-small">
                                    {checkResult === 'checking' ? <><Loader2 className="h-4 w-4 animate-spin text-fg-muted" /><span className="flex-1 text-fg-muted">Checking {selected.host}…</span></>
                                        : checkResult && checkResult.ok ? <><CheckCircle2 className="h-4 w-4 text-status-done-icon" /><span className="flex-1"><span className="font-medium">Reachable.</span> <span className="text-fg-muted">{checkResult.skipped ? 'Skipped outside production.' : `${selected.host} answers from Firma.`}</span></span></>
                                        : checkResult ? <><XCircle className="h-4 w-4 text-danger" /><span className="min-w-[200px] flex-1"><span className="font-medium">Not reachable yet.</span> <span className="text-fg-muted">{checkResult.message}</span></span></>
                                        : <span className="flex-1 text-fg-muted">Check that {selected.host} answers from Firma.</span>}
                                    <Button variant="outline" size="sm" disabled={checkResult === 'checking'} onClick={async () => { await runCheck(selected.id); if (selected.status === 'APPROVED') await load(tab) }}>
                                        <RefreshCw className="h-3.5 w-3.5" />{checkResult ? 'Check again' : 'Check'}
                                    </Button>
                                </div>
                            ) : null}

                            {selected.status === 'REQUESTED' ? (
                                <>
                                    <label htmlFor="domain-note" className="mb-1.5 block text-caption text-fg-muted">Note to the Group admin · required to reject</label>
                                    <textarea id="domain-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional when approving"
                                        className="min-h-16 w-full resize-y rounded-control border border-line-strong bg-surface px-2.5 py-2 text-small text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-action/35" />
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <Button variant="ghost" size="sm" className="text-danger hover:text-danger" disabled={busy || !note.trim()} onClick={() => decide(false)}>Reject</Button>
                                        <span className="flex items-center gap-2">
                                            {!checkPassed ? <span className="text-small text-fg-muted">Approve unlocks once the check passes</span> : null}
                                            <Button disabled={busy || !checkPassed} onClick={() => decide(true)}>Approve</Button>
                                        </span>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function AddForGroup({ onDone }: { onDone: (added: boolean) => void }) {
    const { addToast } = useToast()
    const [slug, setSlug] = useState('')
    const [kind, setKind] = useState<'SUBDOMAIN' | 'CUSTOM'>('SUBDOMAIN')
    const [value, setValue] = useState('')
    const [busy, setBusy] = useState(false)
    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setBusy(true)
        const r = await addCustomDomainForGroup(slug, kind, value)
        setBusy(false)
        if (!r.ok) {
            addToast({ type: 'error', title: r.error })
            return
        }
        addToast({ type: 'success', title: 'Domain added and live' })
        onDone(true)
    }
    const field = 'h-8 rounded-control border border-line-strong bg-surface px-2.5 text-small text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-action/35'
    return (
        <form onSubmit={submit} className="space-y-3 rounded-card border border-line bg-surface p-4">
            <div>
                <h2 className="text-ui font-semibold text-fg">Add a domain for a group</h2>
                <p className="text-small text-fg-muted">Approved at once, no request. Set it up on Vercel first: it must pass the reachability check.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <input className={cn(field, 'w-48')} placeholder="Group slug" value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Group slug" required />
                <select className={field} value={kind} onChange={(e) => setKind(e.target.value as 'SUBDOMAIN' | 'CUSTOM')} aria-label="Kind">
                    <option value="SUBDOMAIN">Subdomain</option>
                    <option value="CUSTOM">Own domain</option>
                </select>
                <input className={cn(field, 'w-56')} placeholder={kind === 'SUBDOMAIN' ? 'datasentry' : 'portal.acme.com'} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Domain" required />
                <Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Add</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onDone(false)}>Cancel</Button>
            </div>
        </form>
    )
}
