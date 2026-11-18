'use client'

import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { Mail, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { formatFullDate, cn } from '@/lib/utils'
import { failureReason } from '@/lib/files/action-failure'
import {
    MAX_UPDATE_EMAILS,
    MAX_UPDATE_NOTE,
    normalizeEmail,
    type UpdateRecipient,
    type UpdateRecipientsInfo,
    type UpdateSendOutcome,
} from '@/lib/updates/update-send'

/*
 * Emailing the engagement's published update (.claude/plans/publish-and-send-update.md): who it goes
 * to, the sender's note and the PDF. One email form in the app, Email this update
 * (email-update-sheet.tsx), opened from the card's mail icon, the toolbar's Email and Publish & send….
 * Everyone on the engagement is filled in, each removable; any address can be typed in. Someone not
 * on the engagement gets the email only.
 */

export interface UpdateEmailState {
    /** Loaded once; null while loading or after a failed load. */
    info: UpdateRecipientsInfo | null
    loading: boolean
    loadError: string | null
    reload: () => void
    chosenIds: string[]
    setChosenIds: (ids: string[]) => void
    /** Typed addresses that aren't anyone on the engagement. */
    emails: string[]
    setEmails: (emails: string[]) => void
    note: string
    setNote: (note: string) => void
    withPdf: boolean
    setWithPdf: (on: boolean) => void
    /** Everyone it goes to: people chosen plus addresses. */
    count: number
    /** Of them, people on the engagement (they get it in their Inbox too). */
    memberCount: number
    /** Back to everyone, no addresses, no note. */
    reset: () => void
}

/**
 * The block's state. It loads who to send to the first time `active` is true (the /tour passes
 * `demo` recipients instead and loads nothing), and fills everyone in.
 */
export function useUpdateEmail({ projectId, active, demo, pdfByDefault = false }: {
    projectId: string
    active: boolean
    demo?: UpdateRecipientsInfo
    pdfByDefault?: boolean
}): UpdateEmailState {
    const [info, setInfo] = useState<UpdateRecipientsInfo | null>(demo ?? null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const loading = active && !info && !loadError
    const [tick, setTick] = useState(0)
    const [chosenIds, setChosenIds] = useState<string[]>(demo ? demo.recipients.map((r) => r.userId) : [])
    const [emails, setEmails] = useState<string[]>([])
    const [note, setNote] = useState('')
    const [withPdf, setWithPdf] = useState(pdfByDefault)

    useEffect(() => {
        if (!active || demo || info) return
        let cancelled = false
        fetch(`/api/projects/${projectId}/send-update`)
            .then(async (res) => {
                const json = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(json?.error ?? `The server answered ${res.status}. Try again.`)
                return json as UpdateRecipientsInfo
            })
            .then((loaded) => {
                if (cancelled) return
                setInfo(loaded)
                setChosenIds(loaded.recipients.map((r) => r.userId))
            })
            .catch((e) => { if (!cancelled) setLoadError(failureReason(e)) })
        return () => { cancelled = true }
        // `info` is read to load once; a failed load retries through `tick`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, projectId, tick, demo])

    const reset = useCallback(() => {
        setChosenIds(info ? info.recipients.map((r) => r.userId) : [])
        setEmails([])
        setNote('')
        setWithPdf(pdfByDefault)
    }, [info, pdfByDefault])

    const memberCount = chosenIds.length
    return {
        info, loading, loadError, reload: () => { setLoadError(null); setTick((t) => t + 1) },
        chosenIds, setChosenIds, emails, setEmails, note, setNote, withPdf, setWithPdf,
        count: memberCount + emails.length, memberCount, reset,
    }
}

/** "4 people", "1 person". */
export const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

/** The line by the button: what sending does. */
export function sendLine(state: Pick<UpdateEmailState, 'count' | 'memberCount'>): string {
    const { count, memberCount } = state
    if (count === 0) return 'Choose someone to send it to, or add an email address.'
    const inbox = memberCount === 0 ? '' : memberCount === count ? ' They also get it in their Inbox.' : ` The ${memberCount} on this engagement also get it in their Inbox.`
    return `Emails the whole update to ${peopleCount(count)}, from you.${inbox}`
}

function listOf(items: string[]): string {
    if (items.length <= 1) return items[0] ?? ''
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const CHIP = 'inline-flex h-6 max-w-full items-center gap-1 rounded-control pl-2 pr-0.5 text-small text-fg'
const CHIP_X = 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg'

/**
 * To (people chosen, addresses typed), the note, and the PDF. `pdf` shows the PDF option where the
 * Overview can be captured (not on the /tour).
 */
export function UpdateEmailFields({ state, pdf = true }: { state: UpdateEmailState; pdf?: boolean }) {
    const inputId = useId()
    const noteId = useId()
    const [typed, setTyped] = useState('')
    const [typedError, setTypedError] = useState<string | null>(null)
    const { info, loading, loadError, chosenIds, setChosenIds, emails, setEmails } = state
    const people = useMemo(() => info?.recipients ?? [], [info])
    const chosen = people.filter((p) => chosenIds.includes(p.userId))

    const add = (raw: string): boolean => {
        const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)
        if (parts.length === 0) return true
        let nextIds = [...chosenIds]
        let nextEmails = [...emails]
        for (const part of parts) {
            const email = normalizeEmail(part)
            if (!email) {
                setTypedError(`"${part}" isn't an email address.`)
                return false
            }
            const member = people.find((p: UpdateRecipient) => p.email.toLowerCase() === email)
            if (member) {
                if (!nextIds.includes(member.userId)) nextIds = [...nextIds, member.userId]
            } else if (!nextEmails.includes(email)) {
                if (nextEmails.length >= MAX_UPDATE_EMAILS) {
                    setTypedError(`Add up to ${MAX_UPDATE_EMAILS} email addresses at a time.`)
                    return false
                }
                nextEmails = [...nextEmails, email]
            }
        }
        setChosenIds(nextIds)
        setEmails(nextEmails)
        setTypedError(null)
        return true
    }

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && typed.trim())) {
            if (!typed.trim()) return
            e.preventDefault()
            if (add(typed)) setTyped('')
        } else if (e.key === 'Backspace' && !typed && emails.length > 0) {
            setEmails(emails.slice(0, -1))
        }
    }

    if (loading || (!info && !loadError)) {
        return <p className="text-small text-fg-muted">Loading who to send it to…</p>
    }
    if (!info) {
        return (
            <p className="text-small text-danger" role="alert">
                {loadError}{' '}
                <button type="button" onClick={state.reload} className="font-medium underline underline-offset-2">Try again</button>
            </p>
        )
    }

    const removed = people.length - chosen.length
    const last = info.lastSent
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label htmlFor={inputId} className="text-caption text-fg-muted">To</label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-line-strong bg-surface px-1.5 py-1 focus-within:border-action/60 focus-within:ring-2 focus-within:ring-action/20">
                    <ul className="contents" aria-label="Recipients">
                        {chosen.map((p) => (
                            <li key={p.userId} className={cn(CHIP, 'bg-surface-muted')}>
                                <span className="truncate">{p.name} · {p.role}</span>
                                <button type="button" onClick={() => setChosenIds(chosenIds.filter((id) => id !== p.userId))} className={CHIP_X} aria-label={`Remove ${p.name}`}>
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            </li>
                        ))}
                        {emails.map((email) => (
                            <li key={email} className={cn(CHIP, 'border border-dashed border-line-strong bg-surface')}>
                                <Mail className="h-3 w-3 shrink-0 text-fg-muted" aria-hidden />
                                <span className="truncate">{email}</span>
                                <span className="shrink-0 text-caption text-fg-muted">· email only</span>
                                <button type="button" onClick={() => setEmails(emails.filter((x) => x !== email))} className={CHIP_X} aria-label={`Remove ${email}`}>
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            </li>
                        ))}
                    </ul>
                    <input
                        id={inputId}
                        type="email"
                        value={typed}
                        onChange={(e) => { setTyped(e.target.value); if (typedError) setTypedError(null) }}
                        onKeyDown={onKeyDown}
                        onBlur={() => { if (typed.trim() && add(typed)) setTyped('') }}
                        onPaste={(e) => {
                            const text = e.clipboardData.getData('text')
                            if (/[\s,;]/.test(text.trim())) {
                                e.preventDefault()
                                if (add(text)) setTyped('')
                            }
                        }}
                        placeholder="Add an email address"
                        aria-describedby={`${inputId}-help`}
                        className="h-6 min-w-[10rem] flex-1 bg-transparent px-1 text-small text-fg outline-none placeholder:text-fg-subtle"
                    />
                </div>
                {typedError && <p className="text-caption text-danger" role="alert">{typedError}</p>}
                <p id={`${inputId}-help`} className="text-caption text-fg-muted">
                    {people.length === 0
                        ? 'No one else is on this engagement yet. Add an email address to send it.'
                        : 'Everyone on the engagement is filled in; remove anyone who shouldn’t get it.'}
                    {removed > 0 && (
                        <>
                            {' '}
                            <button type="button" onClick={() => setChosenIds(people.map((p) => p.userId))} className="underline-offset-2 hover:text-fg hover:underline">
                                Add everyone back
                            </button>
                        </>
                    )}
                    {last && <> Last emailed {formatFullDate(last.sentAt)} to {listOf(last.to.slice(0, 3))}{last.to.length > 3 ? ` and ${last.to.length - 3} more` : ''}.</>}
                </p>
                {emails.length > 0 && (
                    <p className="text-caption text-fg-muted">
                        {listOf(emails)} {emails.length === 1 ? 'isn’t' : 'aren’t'} on this engagement: they get the email only, with no Inbox and no link into Firma. Replies come to you.
                    </p>
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <label htmlFor={noteId} className="text-caption text-fg-muted">A note from you, above the update (optional)</label>
                <textarea
                    id={noteId}
                    value={state.note}
                    onChange={(e) => state.setNote(e.target.value.slice(0, MAX_UPDATE_NOTE))}
                    rows={2}
                    placeholder="A line in your own words. The update follows it as published."
                    className="w-full resize-y rounded-control border border-line-strong bg-surface px-2.5 py-2 text-small leading-relaxed text-fg placeholder:text-fg-subtle focus:border-action/60 focus:outline-none focus:ring-2 focus:ring-action/20"
                />
            </div>
            {pdf && (
                <label className="flex w-fit items-center gap-2 text-small text-fg">
                    <Checkbox checked={state.withPdf} onCheckedChange={(v) => state.setWithPdf(v === true)} />
                    Attach the Overview as a PDF
                </label>
            )}
        </div>
    )
}

/**
 * Sends the published update (POST /api/projects/[id]/send-update). Throws with the server's words
 * when nothing went; answers what each send did otherwise.
 */
export async function sendPublishedUpdate(projectId: string, state: UpdateEmailState, pdfBase64?: string | null): Promise<UpdateSendOutcome> {
    const res = await fetch(`/api/projects/${projectId}/send-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: state.chosenIds, emails: state.emails, note: state.note, ...(pdfBase64 ? { pdfBase64 } : {}) }),
    })
    const json = await res.json().catch(() => ({})) as Partial<UpdateSendOutcome> & { error?: string }
    if (!res.ok && !(typeof json.sent === 'number' && json.sent > 0)) {
        if (typeof json.sent === 'number') return { sent: json.sent, total: json.total ?? state.count, failed: json.failed ?? [] }
        throw new Error(json.error ?? `The server answered ${res.status}. Try again.`)
    }
    return { sent: json.sent ?? 0, total: json.total ?? state.count, failed: json.failed ?? [] }
}
