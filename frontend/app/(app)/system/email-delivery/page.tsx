'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ChevronRight, Monitor, Search, Send, Shield, Smartphone } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { EMAIL_DELIVERY_BATCH_SIZE, parseEmailList } from '@/lib/system/email-recipients'

/**
 * Email Delivery: pick a designed template, preview it, choose who gets it, send.
 *
 * Templates are code, not content (see lib/email-templates/campaigns/index.ts), so there is no editor
 * here. Sending is one click by request, so the button always states the count it will send to. The
 * page sends in small batches: a long list can't outrun a request time limit, and if a request fails
 * the page still knows the outcome of everything before it.
 *
 * After a send, whoever got the email is deselected and whoever didn't stays selected. A second click
 * therefore retries the failures rather than mailing everyone again.
 */

type Template = { id: string; name: string; description: string; createdAt: string; subject: string; preheader: string }
type User = { id: string; email: string; firstName: string | null; lastName: string | null; createdAt: string; lastSignInAt: string | null }
type LoadResponse = { templates: Template[]; users: User[]; email: { configured: boolean; from: string } }
type Preview = { html: string }
type SendResult = { email: string; ok: boolean; error?: string }
type Outcome = { sent: number; failed: { email: string; error: string }[] }

const fullName = (user: User) => [user.firstName, user.lastName].filter(Boolean).join(' ')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Opens the preview's links in a new tab; the frame is sandboxed and can't navigate itself. */
const withLinksInNewTab = (html: string) => html.replace('<head>', '<head><base target="_blank" />')

async function fetchPreview(templateId: string): Promise<Preview> {
    const res = await fetch(`/api/system/email-delivery/preview?templateId=${encodeURIComponent(templateId)}`, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
    return body as Preview
}

function Panel({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
                {aside}
            </div>
            {children}
        </section>
    )
}

export default function EmailDeliveryPage() {
    const { addToast } = useToast()
    const [data, setData] = useState<LoadResponse | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)

    const [templateId, setTemplateId] = useState<string | null>(null)
    const [previews, setPreviews] = useState<Record<string, Preview>>({})
    const [previewError, setPreviewError] = useState<string | null>(null)
    const [previewSize, setPreviewSize] = useState<'desktop' | 'mobile'>('desktop')

    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [extra, setExtra] = useState('')

    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
    const [outcome, setOutcome] = useState<Outcome | null>(null)

    useEffect(() => {
        let cancelled = false
        fetch('/api/system/email-delivery', { cache: 'no-store' })
            .then(async (res) => {
                const body = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
                return body as LoadResponse
            })
            .then((body) => {
                if (cancelled) return
                setData(body)
                setTemplateId(body.templates[0]?.id ?? null)
            })
            .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load') })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!templateId || previews[templateId]) return
        let cancelled = false
        setPreviewError(null)
        fetchPreview(templateId)
            .then((preview) => { if (!cancelled) setPreviews((prev) => ({ ...prev, [templateId]: preview })) })
            .catch((error) => { if (!cancelled) setPreviewError(error instanceof Error ? error.message : 'Could not load the preview') })
        return () => { cancelled = true }
    }, [templateId, previews])

    // Closing the tab mid-send would silently drop the batches not yet sent.
    const sending = progress !== null
    useEffect(() => {
        if (!sending) return
        const warn = (event: BeforeUnloadEvent) => event.preventDefault()
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [sending])

    const template = data?.templates.find((t) => t.id === templateId) ?? null
    const preview = templateId ? previews[templateId] : undefined
    const users = useMemo(() => data?.users ?? [], [data])

    const visibleUsers = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return users
        return users.filter((u) => u.email.toLowerCase().includes(term) || fullName(u).toLowerCase().includes(term))
    }, [users, search])

    const allVisibleSelected = visibleUsers.length > 0 && visibleUsers.every((u) => selected.has(u.email))
    const someVisibleSelected = visibleUsers.some((u) => selected.has(u.email))

    const extras = useMemo(() => parseEmailList(extra), [extra])
    const recipients = useMemo(
        () => Array.from(new Set([...Array.from(selected).map((e) => e.toLowerCase()), ...extras.valid])),
        [selected, extras.valid],
    )

    const toggleUser = (email: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(email)) next.delete(email)
            else next.add(email)
            return next
        })
    }

    const toggleVisible = () => {
        setSelected((prev) => {
            const next = new Set(prev)
            for (const u of visibleUsers) {
                if (allVisibleSelected) next.delete(u.email)
                else next.add(u.email)
            }
            return next
        })
    }

    const send = async () => {
        if (!template) return
        const total = recipients.length
        const batches: string[][] = []
        for (let i = 0; i < total; i += EMAIL_DELIVERY_BATCH_SIZE) batches.push(recipients.slice(i, i + EMAIL_DELIVERY_BATCH_SIZE))

        setOutcome(null)
        setProgress({ done: 0, total })
        const results: SendResult[] = []
        for (const batch of batches) {
            try {
                const res = await fetch('/api/system/email-delivery', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ templateId: template.id, recipients: batch }),
                })
                const body = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
                results.push(...(body.results as SendResult[]))
            } catch (error) {
                // A dropped response leaves the batch unknown: it may have gone out before the failure.
                const reason = error instanceof TypeError
                    ? 'No response from the server, so this may or may not have gone out.'
                    : error instanceof Error ? error.message : 'Could not send'
                results.push(...batch.map((email) => ({ email, ok: false, error: reason })))
            }
            setProgress({ done: results.length, total })
        }
        setProgress(null)

        const failed = results.filter((r) => !r.ok).map((r) => ({ email: r.email, error: r.error ?? 'Could not send' }))
        const sent = results.length - failed.length
        setOutcome({ sent, failed })

        const delivered = new Set(results.filter((r) => r.ok).map((r) => r.email))
        setSelected((prev) => new Set(Array.from(prev).filter((email) => !delivered.has(email.toLowerCase()))))
        setExtra(extras.valid.filter((email) => !delivered.has(email)).join(', '))

        if (failed.length === 0) {
            addToast({ type: 'success', title: `Sent to ${plural(sent, 'recipient')}`, message: template.name })
        } else {
            addToast({ type: 'error', title: `${failed.length} ${failed.length === 1 ? 'address' : 'addresses'} failed`, message: `Sent to ${sent} of ${results.length}. Whoever failed is still selected.` })
        }
    }

    const emailReady = data?.email.configured ?? false
    const canSend = Boolean(template) && recipients.length > 0 && extras.invalid.length === 0 && emailReady && !sending

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex flex-col space-y-4">
                <nav className="flex items-center text-sm text-gray-500">
                    <Link href="/system" className="flex items-center transition-colors hover:text-gray-900">
                        <Shield className="h-4 w-4" />
                    </Link>
                    <ChevronRight className="mx-2 h-4 w-4" />
                    <span className="font-medium text-gray-900">Email Delivery</span>
                </nav>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Email Delivery</h1>
                    <p className="mt-1 text-gray-500">Choose a designed email, check how it looks, and send it to the people you pick.</p>
                </div>
            </div>

            {loadError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>}

            {!data && !loadError && (
                <div className="flex items-center justify-center py-24"><LoadingSpinner size="md" /></div>
            )}

            {data && (
                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
                    <div className="flex min-w-0 flex-col gap-4">
                        {/* Locked during a send: the outcome is written back to these fields when it ends. */}
                        <fieldset disabled={sending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
                        <Panel title="Template">
                            {data.templates.length === 0 ? (
                                <p className="px-4 py-6 text-sm text-gray-500">No templates yet.</p>
                            ) : (
                                <div role="radiogroup" aria-label="Template" className="divide-y divide-gray-100">
                                    {data.templates.map((t) => (
                                        <label key={t.id} className={cn('flex cursor-pointer gap-3 px-4 py-3 transition-colors', t.id === templateId ? 'bg-gray-50' : 'hover:bg-gray-50')}>
                                            <input
                                                type="radio"
                                                name="template"
                                                checked={t.id === templateId}
                                                onChange={() => setTemplateId(t.id)}
                                                className="mt-0.5 h-4 w-4 shrink-0 accent-gray-900"
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-gray-900">{t.name}</span>
                                                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{t.description}</span>
                                                <span className="mt-1 block text-xs text-gray-400">{t.createdAt}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </Panel>

                        <Panel
                            title="Recipients"
                            aside={<span className="text-xs tabular-nums text-gray-500">{selected.size} of {users.length} selected</span>}
                        >
                            <div className="border-b border-gray-100 p-3">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="search"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search name or email"
                                        aria-label="Search users"
                                        className="h-8 w-full rounded-md border border-gray-200 pl-8 pr-2 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                                    />
                                </div>
                            </div>
                            <label className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected }}
                                    onChange={toggleVisible}
                                    disabled={visibleUsers.length === 0}
                                    className="h-4 w-4 accent-gray-900"
                                />
                                {search.trim() ? `Select all ${visibleUsers.length} matching` : `Select all ${users.length}`}
                            </label>
                            <div className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
                                {visibleUsers.length === 0 && (
                                    <p className="px-4 py-6 text-center text-sm text-gray-500">{users.length === 0 ? 'No accounts to email.' : 'No matches.'}</p>
                                )}
                                {visibleUsers.map((user) => (
                                    <label key={user.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-gray-50">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(user.email)}
                                            onChange={() => toggleUser(user.email)}
                                            className="h-4 w-4 shrink-0 accent-gray-900"
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-gray-900">{fullName(user) || user.email}</span>
                                            <span className="block truncate text-xs text-gray-500">
                                                {fullName(user) ? `${user.email} · ` : ''}
                                                {user.lastSignInAt
                                                    ? `Signed in ${formatDistanceToNow(new Date(user.lastSignInAt), { addSuffix: true })}`
                                                    : 'Never signed in'}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <div className="border-t border-gray-100 p-3">
                                <label htmlFor="extra-emails" className="mb-1.5 block text-xs font-medium text-gray-600">Additional emails, comma separated</label>
                                <textarea
                                    id="extra-emails"
                                    value={extra}
                                    onChange={(e) => setExtra(e.target.value)}
                                    rows={2}
                                    placeholder="pat@example.com, sam@example.com"
                                    className="w-full resize-y rounded-md border border-gray-200 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                                />
                                {extras.invalid.length > 0 && (
                                    <p className="mt-1.5 break-words text-xs text-red-600">Not valid: {extras.invalid.join(', ')}</p>
                                )}
                            </div>
                        </Panel>
                        </fieldset>

                        <section className="rounded-xl border border-gray-200 bg-white p-4">
                            {!emailReady && (
                                <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800">
                                    SMTP isn&apos;t configured on this server, so nothing can be sent from here.
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={send}
                                disabled={!canSend}
                                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {progress ? <LoadingSpinner size="sm" /> : <Send className="h-4 w-4" />}
                                {progress
                                    ? `Sending ${progress.done} of ${progress.total}`
                                    : recipients.length === 0 ? 'Choose recipients to send' : `Send to ${plural(recipients.length, 'recipient')}`}
                            </button>
                            {extras.invalid.length > 0 && (
                                <p className="mt-2 text-center text-xs text-gray-500">Fix or remove the invalid addresses to send.</p>
                            )}
                            {outcome && (
                                <div className="mt-3 text-xs leading-relaxed" role="status">
                                    {outcome.sent > 0 && <p className="text-gray-700">Sent to {plural(outcome.sent, 'recipient')}.</p>}
                                    {outcome.failed.length > 0 && (
                                        <>
                                            <p className="font-medium text-red-700">Not sent to {outcome.failed.length}. They&apos;re still selected, so sending again retries only them.</p>
                                            <ul className="mt-1 space-y-0.5 text-red-700">
                                                {outcome.failed.map((f) => <li key={f.email} className="break-words">{f.email} · {f.error}</li>)}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="min-w-0 lg:sticky lg:top-20">
                        <Panel
                            title="Preview"
                            aside={
                                <div role="radiogroup" aria-label="Preview size" className="flex items-center gap-0.5 rounded-md bg-gray-100 p-0.5">
                                    {([['desktop', Monitor, 'Desktop'], ['mobile', Smartphone, 'Mobile']] as const).map(([size, Icon, label]) => (
                                        <button
                                            key={size}
                                            type="button"
                                            role="radio"
                                            aria-checked={previewSize === size}
                                            onClick={() => setPreviewSize(size)}
                                            className={cn('inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors', previewSize === size ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            }
                        >
                            {template && (
                                <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-gray-100 px-4 py-3 text-xs">
                                    <dt className="text-gray-400">From</dt>
                                    <dd className="truncate text-gray-700">{data.email.from}</dd>
                                    <dt className="text-gray-400">Subject</dt>
                                    <dd className="font-medium text-gray-900">{template.subject}</dd>
                                    <dt className="text-gray-400">Preview line</dt>
                                    <dd className="text-gray-600">{template.preheader}</dd>
                                </dl>
                            )}
                            <div className="flex justify-center overflow-hidden rounded-b-xl bg-gray-50">
                                {previewError ? (
                                    <p className="p-6 text-sm text-red-700">{previewError}</p>
                                ) : templateId && preview ? (
                                    <iframe
                                        key={templateId}
                                        title="Email preview"
                                        srcDoc={withLinksInNewTab(preview.html)}
                                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                                        className={cn('h-[calc(100vh-15rem)] min-h-[520px] border-0 bg-white transition-[width] duration-200', previewSize === 'desktop' ? 'w-full' : 'w-[390px] max-w-full')}
                                    />
                                ) : (
                                    <div className="flex h-96 items-center justify-center"><LoadingSpinner size="md" /></div>
                                )}
                            </div>
                        </Panel>
                    </div>
                </div>
            )}
        </div>
    )
}
