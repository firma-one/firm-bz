'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Copy, ExternalLink, Globe, Loader2, Lock, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { getPlatformBrandDomain } from '@/config/platform-domain'
import { CNAME_TARGET, type DomainKind } from '@/lib/custom-domains/domain-rules'
import {
    cancelCustomDomainRequest, checkCustomDomainName, getCustomDomainState, removeCustomDomain, requestCustomDomain,
    type CustomDomainView,
} from '@/lib/actions/custom-domains'

/**
 * Billing → Custom domain (.claude/plans/branded-host-email-links.md, mock
 * .claude/plans/custom-domains-mock.html). A Group admin asks for acme.firma.bz (Pro and up) or their
 * own domain (Enterprise); a System Admin approves it in /system/custom-domains. Renders nothing for
 * anyone else. Neutral, with color only for state: done (live, available), waiting, problem.
 */

const SECTION_HEADING_CLASS = 'text-h3 text-fg'

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'ok'; host: string } | { state: 'bad'; message: string }

function shortDate(iso: string | Date | null | undefined): string {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CheckLine({ check }: { check: Check }) {
    if (check.state === 'idle') return null
    if (check.state === 'checking') {
        return <p className="mt-1.5 flex items-center gap-1.5 text-small text-fg-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking…</p>
    }
    if (check.state === 'ok') {
        return <p className="mt-1.5 flex items-center gap-1.5 text-small text-status-done-fg"><CheckCircle2 className="h-3.5 w-3.5" />{check.host} is available</p>
    }
    return <p className="mt-1.5 flex items-center gap-1.5 text-small text-danger"><XCircle className="h-3.5 w-3.5" />{check.message}</p>
}

const CHIP_TONE = {
    done: 'bg-status-done-bg text-status-done-fg',
    waiting: 'bg-status-waiting-bg text-status-waiting-fg',
    problem: 'bg-status-problem-bg text-status-problem-fg',
} as const

function Chip({ tone, icon, children }: { tone: keyof typeof CHIP_TONE; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <span className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-control px-1.5 text-caption [&_svg]:h-3.5 [&_svg]:w-3.5', CHIP_TONE[tone])}>
            {icon}{children}
        </span>
    )
}

export function CustomDomainSection({ firmId }: { firmId: string }) {
    const { addToast } = useToast()
    const [view, setView] = useState<CustomDomainView | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [kind, setKind] = useState<DomainKind>('SUBDOMAIN')
    const [value, setValue] = useState('')
    const [check, setCheck] = useState<Check>({ state: 'idle' })
    const [busy, setBusy] = useState(false)
    const [confirmRemove, setConfirmRemove] = useState(false)
    const checkSeq = useRef(0)

    const load = useCallback(async () => {
        const r = await getCustomDomainState(firmId)
        if (r.ok) {
            setView(r.data)
            setLoadError(null)
        } else {
            setLoadError(r.error)
        }
    }, [firmId])

    useEffect(() => {
        void load()
    }, [load])

    // Availability, checked after a short pause while typing.
    useEffect(() => {
        const v = value.trim()
        if (!v) {
            setCheck({ state: 'idle' })
            return
        }
        const seq = ++checkSeq.current
        setCheck({ state: 'checking' })
        const t = setTimeout(async () => {
            const r = await checkCustomDomainName(firmId, kind, v)
            if (seq !== checkSeq.current) return
            if (!r.ok) setCheck({ state: 'bad', message: r.error })
            else if (r.data.ok) setCheck({ state: 'ok', host: r.data.host })
            else setCheck({ state: 'bad', message: r.data.message })
        }, 400)
        return () => clearTimeout(t)
    }, [value, kind, firmId])

    const run = async (what: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
        setBusy(true)
        const r = await what()
        setBusy(false)
        if (!r.ok) {
            addToast({ type: 'error', title: r.error })
            return
        }
        addToast({ type: 'success', title: done })
        setValue('')
        await load()
    }

    if (loadError) {
        return (
            <section aria-labelledby="billing-domain-heading" className="space-y-2 border-t border-line pt-6">
                <h2 id="billing-domain-heading" className={SECTION_HEADING_CLASS}>Custom domain</h2>
                <p className="text-small text-danger">{loadError}</p>
            </section>
        )
    }
    if (!view || !view.canManage) return null

    const brand = getPlatformBrandDomain()
    const live = view.live
    const intro = 'Open your workspace at your own address. Emails and sign-in take people there.'

    return (
        <section aria-labelledby="billing-domain-heading" className="space-y-4 border-t border-line pt-6">
            <div className="space-y-0.5">
                <h2 id="billing-domain-heading" className={SECTION_HEADING_CLASS}>Custom domain</h2>
                <p className="text-small text-fg-muted">{intro}</p>
            </div>

            {live ? (
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-subtle px-3 py-2.5">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <Globe className="h-4 w-4 shrink-0 text-fg-subtle" />
                            {live.status === 'APPROVED' ? (
                                <a href={`https://${live.host}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-fg hover:underline">
                                    {live.host}<ExternalLink className="h-3.5 w-3.5 text-fg-subtle" />
                                </a>
                            ) : (
                                <span className="font-medium text-fg">{live.host}</span>
                            )}
                            {live.status === 'REQUESTED' ? <Chip tone="waiting" icon={<Clock />}>Waiting for approval</Chip>
                                : live.reachable ? <Chip tone="done" icon={<CheckCircle2 />}>Live</Chip>
                                : <Chip tone="problem" icon={<AlertTriangle />}>Unreachable</Chip>}
                        </span>
                        {live.status === 'REQUESTED' ? (
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => cancelCustomDomainRequest(firmId), 'Request cancelled')}>Cancel request</Button>
                        ) : (
                            <Button variant="ghost" size="sm" className="text-danger hover:text-danger" disabled={busy}
                                onClick={() => setConfirmRemove(true)}>Remove</Button>
                        )}
                    </div>
                    <p className="text-small text-fg-muted">
                        {live.status === 'REQUESTED'
                            ? `Requested${live.requestedByName ? ` by ${live.requestedByName}` : ''} · ${shortDate(live.requestedAt)}. We email you when it's ready.`
                            : live.reachable
                                ? `Approved ${shortDate(live.reviewedAt)}. Removing it sends everyone back to www.${brand} and frees the name.`
                                : `Not reachable since ${shortDate(live.lastCheckedAt)}${live.lastCheckError ? ` · ${live.lastCheckError}` : ''}. Until it is, people use www.${brand}.`}
                    </p>
                    {live.status === 'REQUESTED' && live.kind === 'CUSTOM' ? <DnsRecord host={live.host} /> : null}
                    <ConfirmDialog
                        open={confirmRemove}
                        onOpenChange={setConfirmRemove}
                        icon={<Trash2 className="h-4 w-4" />}
                        title={`Remove ${live.host}?`}
                        description={`Sign-in and email links go back to www.${brand} at once, and the name is freed for anyone to request.`}
                        confirmLabel="Remove"
                        loading={busy}
                        onCancel={() => setConfirmRemove(false)}
                        onConfirm={async () => {
                            await run(() => removeCustomDomain(firmId), `${live.host} removed`)
                            setConfirmRemove(false)
                        }}
                    />
                </div>
            ) : !view.allowed.SUBDOMAIN && !view.allowed.CUSTOM ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-subtle px-3 py-2 text-small text-fg-muted">
                    <span className="flex items-center gap-2"><Lock className="h-3.5 w-3.5" />
                        Available on {view.lowestPlan.SUBDOMAIN ?? 'a higher plan'} and up. Your own domain is on {view.lowestPlan.CUSTOM ?? 'a higher plan'}.
                    </span>
                    <Button asChild variant="outline" size="sm"><Link href="/pricing">See plans</Link></Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {view.lastRejected ? (
                        <div className="flex items-start gap-2 rounded-card border border-line bg-surface-subtle px-3 py-2 text-small text-fg-muted">
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                            <span><span className="font-medium text-fg">{view.lastRejected.host} wasn&apos;t approved.</span>
                                {view.lastRejected.reviewNote ? ` "${view.lastRejected.reviewNote}"` : ''} · Firma, {shortDate(view.lastRejected.reviewedAt)}</span>
                        </div>
                    ) : null}
                    <div className="inline-flex max-w-full overflow-hidden rounded-control border border-line-strong" role="radiogroup" aria-label="Kind of address">
                        {(['SUBDOMAIN', 'CUSTOM'] as const).map((k) => {
                            const allowed = view.allowed[k]
                            return (
                                <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={!allowed}
                                    onClick={() => { setKind(k); setValue('') }}
                                    className={cn('inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap px-3 text-small font-medium',
                                        k === 'CUSTOM' && 'border-l border-line-strong',
                                        kind === k ? 'bg-surface-muted text-fg' : 'bg-surface text-fg-muted',
                                        !allowed && 'cursor-not-allowed text-fg-subtle')}>
                                    {!allowed ? <Lock className="h-3.5 w-3.5" /> : null}
                                    {k === 'SUBDOMAIN' ? 'Firma subdomain' : 'Your own domain'}
                                    {!allowed && view.lowestPlan[k] ? ` · ${view.lowestPlan[k]}` : ''}
                                </button>
                            )
                        })}
                    </div>
                    <div>
                        <label className="flex h-[34px] items-center overflow-hidden rounded-control border border-line-strong bg-surface focus-within:ring-2 focus-within:ring-action/35">
                            <input value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} autoComplete="off"
                                aria-label={kind === 'SUBDOMAIN' ? 'Subdomain' : 'Your domain'}
                                placeholder={kind === 'SUBDOMAIN' ? 'yourcompany' : 'portal.yourcompany.com'}
                                className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-ui text-fg outline-none placeholder:text-fg-subtle" />
                            {kind === 'SUBDOMAIN' ? <span className="flex h-full items-center border-l border-line bg-surface-subtle px-2.5 text-small text-fg-muted">.{brand}</span> : null}
                        </label>
                        <CheckLine check={check} />
                    </div>
                    {kind === 'CUSTOM' && check.state === 'ok' ? <DnsRecord host={check.host} /> : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-small text-fg-muted">
                            {kind === 'SUBDOMAIN' ? 'A Firma admin sets it up, usually within one business day.' : 'Use a subdomain of your site, not the bare domain.'}
                        </span>
                        <Button disabled={busy || check.state !== 'ok'}
                            onClick={() => check.state === 'ok' && run(() => requestCustomDomain(firmId, kind, value), `Requested ${check.host}`)}>
                            {check.state === 'ok' ? `Request ${check.host}` : 'Request'}
                        </Button>
                    </div>
                </div>
            )}
        </section>
    )
}

function DnsRecord({ host }: { host: string }) {
    const { addToast } = useToast()
    const copy = (text: string) => {
        void navigator.clipboard?.writeText(text).then(() => addToast({ type: 'success', title: 'Copied' }), () => undefined)
    }
    return (
        <div className="rounded-card border border-line bg-surface-subtle px-3 py-2 text-small text-fg-muted">
            At your DNS provider, add this record. Firma approves once it resolves.
            <div className="mt-2 overflow-x-auto">
                <table className="w-full text-small">
                    <thead><tr className="text-left text-caption text-fg-muted"><th className="py-1 pr-4 font-medium">Type</th><th className="py-1 pr-4 font-medium">Name</th><th className="py-1 font-medium">Value</th></tr></thead>
                    <tbody>
                        <tr className="border-t border-line text-fg">
                            <td className="py-1.5 pr-4">CNAME</td>
                            <td className="py-1.5 pr-4 font-mono text-[12.5px]">{host}</td>
                            <td className="py-1.5 font-mono text-[12.5px]">
                                {CNAME_TARGET}
                                <button type="button" aria-label="Copy value" onClick={() => copy(CNAME_TARGET)} className="ml-1.5 align-[-2px] text-fg-subtle hover:text-fg"><Copy className="h-3.5 w-3.5" /></button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}
