'use client'

import { useId, useRef, useState } from 'react'
import { Loader2, Paperclip, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tag } from '@/components/ui/tag'
import { failureReason } from '@/lib/files/action-failure'
import { parseVtt } from '@/lib/memos/vtt'
import { MEMO_DEFAULT_TITLE, MEMO_MAX_CHARS, MEMO_TITLE_MAX, type MemoSource } from '@/lib/memos/memo-shared'

/** What the sheet hands over to be saved. */
export interface AddMemoInput {
    title: string
    /** YYYY-MM-DD */
    date: string
    body: string
    source: MemoSource
    durationMinutes: number | null
    speakers: number | null
}

export type AddMemoOutcome = { ok: true } | { ok: false; error: string }

interface Attached {
    name: string
    source: MemoSource
    durationMinutes: number | null
    speakers: number
    /** What the field held before, back when the file is removed. */
    before: string
}

/** A file read in the browser, never uploaded: larger than this isn't a memo. */
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ACCEPT = '.txt,.md,.vtt,text/plain,text/markdown,text/vtt'

/** A file's text, read here in the browser. FileReader where Blob.text isn't there. */
function readFileText(file: File): Promise<string> {
    if (typeof file.text === 'function') return file.text()
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error ?? new Error("The browser couldn't read it."))
        reader.readAsText(file)
    })
}

/** The person's own calendar day. */
export function localDay(now = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** "transcript, 42 min · 3 speakers", or "notes": what the chip says about an attached file. */
export function attachmentSummary(a: Pick<Attached, 'source' | 'durationMinutes' | 'speakers'>): string {
    if (a.source !== 'transcript') return 'notes'
    const parts = [a.durationMinutes ? `transcript, ${a.durationMinutes} min` : 'transcript']
    if (a.speakers > 0) parts.push(`${a.speakers} speaker${a.speakers === 1 ? '' : 's'}`)
    return parts.join(' · ')
}

/**
 * "Add internal memo" (.claude/plans/brio-features-round-2.md, §8): a title, the day of the call, and
 * the notes, pasted or read from an attached .txt, .md or .vtt. A transcript is turned into "Speaker:
 * text" lines here, in the browser (lib/memos/vtt.ts), and stays editable. `onSave` stores it; the
 * sheet closes when it answers ok and shows its reason when not.
 *
 * Shared by the app's Overview card and /tour's, which saves to a list in memory.
 */
export function AddMemoSheet({
    open,
    onOpenChange,
    onSave,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: (input: AddMemoInput) => Promise<AddMemoOutcome>
}) {
    const ids = { title: useId(), date: useId(), body: useId() }
    const fileRef = useRef<HTMLInputElement>(null)
    const [title, setTitle] = useState(MEMO_DEFAULT_TITLE)
    const [date, setDate] = useState(() => localDay())
    const [body, setBody] = useState('')
    const [attached, setAttached] = useState<Attached | null>(null)
    const [fileError, setFileError] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    // Closing it, saved or not, leaves a new memo for the next opening.
    const close = () => {
        setTitle(MEMO_DEFAULT_TITLE)
        setDate(localDay())
        setBody('')
        setAttached(null)
        setFileError(null)
        setSaveError(null)
        onOpenChange(false)
    }

    const attach = async (file: File | undefined) => {
        setFileError(null)
        if (!file) return
        const ext = file.name.toLowerCase().split('.').pop()
        if (ext !== 'txt' && ext !== 'md' && ext !== 'vtt') {
            setFileError('Attach a .txt, .md or .vtt file.')
            return
        }
        if (file.size > MAX_FILE_BYTES) {
            setFileError('This file is too large to be a memo. Attach one under 5 MB.')
            return
        }
        let raw: string
        try {
            raw = await readFileText(file)
        } catch (e) {
            setFileError(`This file couldn't be read. ${failureReason(e)}`)
            return
        }
        const before = attached ? attached.before : body
        if (ext === 'vtt') {
            const parsed = parseVtt(raw)
            setBody(parsed.text)
            setAttached({ name: file.name, source: 'transcript', durationMinutes: parsed.durationMinutes, speakers: parsed.speakers, before })
        } else {
            setBody(raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim())
            setAttached({ name: file.name, source: 'notes', durationMinutes: null, speakers: 0, before })
        }
    }

    const detach = () => {
        if (!attached) return
        setBody(attached.before)
        setAttached(null)
        setFileError(null)
    }

    const length = body.length
    const tooLong = length > MEMO_MAX_CHARS
    const canSave = !saving && !!title.trim() && !!date && !!body.trim() && !tooLong

    const save = async () => {
        if (!canSave) return
        setSaving(true)
        setSaveError(null)
        try {
            const outcome = await onSave({
                title: title.trim(),
                date,
                body,
                source: attached?.source ?? 'notes',
                durationMinutes: attached?.durationMinutes ?? null,
                speakers: attached?.source === 'transcript' ? attached.speakers : null,
            })
            if (!outcome.ok) {
                setSaveError(outcome.error)
                return
            }
            close()
        } catch (e) {
            setSaveError(failureReason(e))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={(next) => { if (saving) return; if (next) onOpenChange(true); else close() }}>
            <SheetContent side="right" className="flex w-full flex-col sm:max-w-[560px]">
                <div className="flex items-center gap-2 border-b border-line px-4 pb-3 pt-4">
                    <SheetTitle className="text-h3 text-fg">Add internal memo</SheetTitle>
                    <Tag color="gray">Internal only</Tag>
                </div>
                <SheetDescription className="sr-only">
                    Notes from a call or meeting, saved as a Markdown file in the engagement&apos;s Internal Memos folder. Only Leads and Full Access contributors see it.
                </SheetDescription>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label htmlFor={ids.title} className="text-caption text-fg-muted">Title</label>
                            <Input id={ids.title} value={title} maxLength={MEMO_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor={ids.date} className="text-caption text-fg-muted">Date</label>
                            <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[150px]" />
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                            <label htmlFor={ids.body} className="text-caption text-fg-muted">Notes or transcript</label>
                            <span className="flex-1" />
                            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={saving}>
                                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                                Attach .txt, .md or .vtt
                            </Button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept={ACCEPT}
                                className="hidden"
                                aria-label="Attach a .txt, .md or .vtt file"
                                onChange={(e) => {
                                    void attach(e.target.files?.[0])
                                    // The same file can be attached again after it's removed.
                                    e.target.value = ''
                                }}
                            />
                        </div>

                        {attached && (
                            <div className="flex">
                                <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-control bg-surface-muted pl-2 pr-1 text-small text-fg" data-testid="memo-attachment">
                                    <span className="truncate">{attached.name} · {attachmentSummary(attached)}</span>
                                    <button
                                        type="button"
                                        onClick={detach}
                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg"
                                        aria-label={`Remove ${attached.name}`}
                                    >
                                        <X className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                </span>
                            </div>
                        )}

                        <Textarea
                            id={ids.body}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={14}
                            placeholder="Paste notes, Markdown or a transcript"
                            className="min-h-[280px] flex-1 resize-y text-ui leading-[22px]"
                        />
                        {attached?.source === 'transcript' && (
                            <p className="text-small text-fg-muted">Timestamps and cue numbers are removed; each speaker&apos;s lines are joined.</p>
                        )}
                        {tooLong && (
                            <p className="text-small text-danger" role="alert">
                                This memo is {length.toLocaleString('en-US')} characters. Keep it under {MEMO_MAX_CHARS.toLocaleString('en-US')} to save it.
                            </p>
                        )}
                        {fileError && <p className="text-small text-danger" role="alert">{fileError}</p>}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                    <span className="text-caption font-normal text-fg-muted">Saved as a Markdown file in Internal Memos, internal only.</span>
                    <span className="flex-1" />
                    {saveError && <span className="w-full text-small text-danger" role="alert">{saveError}</span>}
                    <Button type="button" variant="ghost" size="sm" onClick={close} disabled={saving}>
                        Cancel
                    </Button>
                    <Button type="button" size="sm" onClick={save} disabled={!canSave}>
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        Save memo
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
