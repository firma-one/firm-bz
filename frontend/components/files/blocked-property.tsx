'use client'

import React from 'react'
import { Ban, Check, Loader2 } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { BlockedTag } from '@/components/files/blocked-tag'
import { BLOCKED_NOTE_MAX, BLOCKED_REASONS, BLOCKED_REASON_LABEL, type BlockedFlag, type BlockedReason } from '@/lib/files/blocked'
import { cn } from '@/lib/utils'

/**
 * The Details pane's Blocked row (.claude/plans/deliverable-stages-blocked.md, section 3): what the
 * document waits on, picked from three reasons, with an optional note saved when you leave it. The
 * firm's own, so it's only offered to firm roles; a client is never sent it.
 */
export function BlockedProperty({
    projectId,
    documentId,
    value,
    canEdit,
    onSaved,
    onError,
}: {
    projectId: string
    documentId: string
    value: BlockedFlag | null
    canEdit: boolean
    onSaved: (next: BlockedFlag | null) => void
    onError: (message: string) => void
}) {
    const [blocked, setBlocked] = React.useState<BlockedFlag | null>(value)
    const [note, setNote] = React.useState(value?.note ?? '')
    const [saving, setSaving] = React.useState(false)
    React.useEffect(() => { setBlocked(value); setNote(value?.note ?? '') }, [value])

    const save = async (body: { reason: BlockedReason; note?: string } | { blocked: null }) => {
        setSaving(true)
        try {
            const { getSession } = await import('@/lib/supabase')
            const session = await getSession()
            const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/blocked`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                onError(data.error ?? 'Please try again.')
                return
            }
            setBlocked(data.blocked ?? null)
            setNote(data.blocked?.note ?? '')
            onSaved(data.blocked ?? null)
        } finally {
            setSaving(false)
        }
    }

    if (!canEdit) {
        return blocked
            ? <span className="inline-flex h-7 items-center gap-1.5 px-1.5"><BlockedTag blocked={blocked} /><span className="truncate text-small text-fg-muted">{blocked.note ?? BLOCKED_REASON_LABEL[blocked.reason]}</span></span>
            : <span className="inline-flex h-7 items-center px-1.5 text-fg-subtle">Not blocked</span>
    }

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-1">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            disabled={saving}
                            aria-label="Blocked"
                            className="inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 text-small text-fg-muted transition-colors hover:bg-surface-hover data-[state=open]:bg-surface-hover"
                        >
                            {blocked ? (
                                <>
                                    <BlockedTag blocked={blocked} />
                                    <span className="text-fg">{BLOCKED_REASON_LABEL[blocked.reason]}</span>
                                </>
                            ) : (
                                <span className="text-fg-subtle">Not blocked</span>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                        {BLOCKED_REASONS.map((reason) => (
                            <DropdownMenuItem
                                key={reason}
                                onClick={() => { if (blocked?.reason !== reason) void save({ reason, ...(note.trim() ? { note: note.trim() } : {}) }) }}
                                className="flex cursor-pointer items-center gap-2"
                            >
                                <Ban className="h-3.5 w-3.5 text-tag-red-fg" />
                                {BLOCKED_REASON_LABEL[reason]}
                                {blocked?.reason === reason && <Check className="ml-auto h-3.5 w-3.5 text-fg-muted" />}
                            </DropdownMenuItem>
                        ))}
                        {blocked && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => void save({ blocked: null })} className="cursor-pointer">
                                    Not blocked
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                {saving && <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" />}
            </div>
            {blocked && (
                <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() => { if (note.trim() !== (blocked.note ?? '')) void save({ reason: blocked.reason, note: note.trim() }) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    maxLength={BLOCKED_NOTE_MAX}
                    placeholder="Add a note: what it waits on"
                    aria-label="Blocked note"
                    className={cn('h-7 border-transparent bg-transparent px-1.5 text-small shadow-none hover:bg-surface-hover focus-visible:bg-surface')}
                />
            )}
        </div>
    )
}
