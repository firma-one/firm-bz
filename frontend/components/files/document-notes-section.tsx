"use client"

import { useEffect, useState } from "react"
import { Loader2, Lock, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tag } from "@/components/ui/tag"
import { PersonAvatar } from "@/components/ui/property-cells"
import { PROPERTY_TEXTAREA_CLASS } from "@/components/ui/property-list"
import { RelativeDateTime } from "@/components/ui/relative-date-time"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import type { TagColor } from "@/lib/ui/status-colors"

/**
 * A file's notes in the Details pane's Info tab: the firm's own running log, newest first, with a
 * composer. Internal-only — the pane leaves this out for external users, and the notes routes
 * refuse them (lib/files/document-notes.ts).
 */

export type NoteKind = 'note' | 'decision' | 'client_request' | 'risk'

export interface NoteRow {
    id: string
    kind: NoteKind
    body: string
    authorUserId: string
    createdAt: string
    editedAt?: string
}

export interface NoteAuthor {
    userId: string
    name: string | null
    email: string | null
    avatarUrl: string | null
}

const KINDS: { value: NoteKind; label: string; color: TagColor }[] = [
    { value: 'note', label: 'Note', color: 'gray' },
    { value: 'decision', label: 'Decision', color: 'blue' },
    { value: 'client_request', label: 'Client request', color: 'purple' },
    { value: 'risk', label: 'Risk', color: 'red' },
]
const KIND = Object.fromEntries(KINDS.map((k) => [k.value, k])) as Record<NoteKind, (typeof KINDS)[number]>

const MAX_LENGTH = 1000

async function authHeaders(): Promise<Record<string, string>> {
    const { getSession } = await import('@/lib/supabase')
    const session = await getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

function KindPicker({ value, onChange }: { value: NoteKind; onChange: (next: NoteKind) => void }) {
    return (
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Kind of note">
            {KINDS.map((k) => (
                <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={value === k.value}
                    onClick={() => onChange(k.value)}
                    className={cn('rounded-full transition-opacity', value === k.value ? 'opacity-100' : 'opacity-45 hover:opacity-80')}
                >
                    <Tag color={k.color}>{k.label}</Tag>
                </button>
            ))}
        </div>
    )
}

export function DocumentNotesSection({ projectId, documentId, members, currentUserId, isLead }: {
    projectId: string
    /** The document's own row id (engagement_documents.id). */
    documentId: string
    members: NoteAuthor[]
    currentUserId: string | undefined
    /** The engagement lead may delete anyone's note; everyone else, their own. */
    isLead: boolean
}) {
    const { addToast } = useToast()
    const [notes, setNotes] = useState<NoteRow[]>([])
    const [loading, setLoading] = useState(true)
    const [draft, setDraft] = useState('')
    const [kind, setKind] = useState<NoteKind>('note')
    const [saving, setSaving] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editDraft, setEditDraft] = useState('')
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/notes`, { headers: await authHeaders() })
            if (cancelled) return
            if (res.ok) setNotes((await res.json()).notes ?? [])
        })().catch(() => {}).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [projectId, documentId])

    const failed = async (res: Response, title: string) => {
        const err = await res.json().catch(() => ({}))
        addToast({ type: 'error', title, message: err.error ?? 'Please try again.' })
    }

    const add = async () => {
        const body = draft.trim()
        if (!body || saving) return
        setSaving(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
                body: JSON.stringify({ kind, body }),
            })
            if (!res.ok) return failed(res, "Couldn't add the note")
            const { note } = await res.json()
            setNotes((prev) => [note, ...prev])
            setDraft('')
            setKind('note')
        } finally {
            setSaving(false)
        }
    }

    const saveEdit = async (note: NoteRow) => {
        const body = editDraft.trim()
        if (!body) return
        const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/notes/${note.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ body }),
        })
        if (!res.ok) return failed(res, "Couldn't save the note")
        setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, body, editedAt: new Date().toISOString() } : n)))
        setEditingId(null)
    }

    const remove = async (note: NoteRow) => {
        const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/notes/${note.id}`, {
            method: 'DELETE',
            headers: await authHeaders(),
        })
        setConfirmDeleteId(null)
        if (!res.ok) return failed(res, "Couldn't delete the note")
        setNotes((prev) => prev.filter((n) => n.id !== note.id))
    }

    const authorOf = (userId: string) => {
        const m = members.find((x) => x.userId === userId)
        return { name: m?.name ?? m?.email ?? 'Former member', avatarUrl: m?.avatarUrl ?? null }
    }

    return (
        <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-small font-medium text-fg-muted">
                Notes
                <span className="inline-flex items-center gap-1 text-caption font-normal text-fg-subtle">
                    <Lock className="h-3 w-3" aria-hidden /> Only the firm&apos;s team sees these
                </span>
            </div>

            <div className="space-y-2">
                <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void add() } }}
                    placeholder="Add a note — a decision, a client request, a risk…"
                    aria-label="New note"
                    className={cn(PROPERTY_TEXTAREA_CLASS, '-mx-2 w-[calc(100%+1rem)] resize-none')}
                />
                <div className="flex items-center justify-between gap-2">
                    <KindPicker value={kind} onChange={setKind} />
                    <Button type="button" size="sm" onClick={add} disabled={!draft.trim() || saving}>
                        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                        Add note
                    </Button>
                </div>
            </div>

            <div className="mt-3 space-y-2">
                {loading ? (
                    <div className="h-12 animate-pulse rounded-card bg-surface-muted" />
                ) : notes.length === 0 ? (
                    <p className="text-caption text-fg-subtle">No notes yet.</p>
                ) : notes.map((note) => {
                    const author = authorOf(note.authorUserId)
                    const mine = note.authorUserId === currentUserId
                    return (
                        <div key={note.id} className="group rounded-card border border-line bg-surface px-3 py-2.5">
                            <div className="mb-1.5 flex items-center gap-2">
                                <Tag color={KIND[note.kind]?.color ?? 'gray'}>{KIND[note.kind]?.label ?? 'Note'}</Tag>
                                <span className="inline-flex min-w-0 items-center gap-1.5 text-caption text-fg-muted">
                                    <PersonAvatar person={author} size={16} />
                                    <span className="truncate">{author.name}</span>
                                    <span className="text-fg-subtle">·</span>
                                    <RelativeDateTime date={note.createdAt} textClassName="text-caption text-fg-subtle" tooltipSide="top" />
                                    {note.editedAt && <span className="text-fg-subtle">· edited</span>}
                                </span>
                                <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                                    {mine && editingId !== note.id && (
                                        <button type="button" aria-label="Edit note" onClick={() => { setEditingId(note.id); setEditDraft(note.body) }} className="rounded-control p-1 text-fg-subtle hover:bg-surface-hover hover:text-fg">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    {(mine || isLead) && (
                                        <button type="button" aria-label="Delete note" onClick={() => setConfirmDeleteId(note.id)} className="rounded-control p-1 text-fg-subtle hover:bg-surface-hover hover:text-danger">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </span>
                            </div>
                            {editingId === note.id ? (
                                <div className="space-y-2">
                                    <Textarea
                                        value={editDraft}
                                        onChange={(e) => setEditDraft(e.target.value.slice(0, MAX_LENGTH))}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveEdit(note) } }}
                                        aria-label="Edit note"
                                        className={cn(PROPERTY_TEXTAREA_CLASS, 'resize-none')}
                                    />
                                    <div className="flex justify-end gap-1.5">
                                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                        <Button type="button" size="sm" onClick={() => saveEdit(note)} disabled={!editDraft.trim()}>Save</Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="whitespace-pre-wrap text-ui leading-relaxed text-fg">{note.body}</p>
                            )}
                            {confirmDeleteId === note.id && (
                                <div className="mt-2 flex items-center justify-end gap-1.5 text-caption text-fg-muted">
                                    Delete this note? Its text is gone for good.
                                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>Keep</Button>
                                    <Button type="button" size="sm" variant="destructive" onClick={() => remove(note)}>Delete</Button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
