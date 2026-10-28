import { NextRequest, NextResponse } from 'next/server'
import { notesAccess } from '@/lib/files/document-notes-access'
import { deleteNote, editNote, isNoteKind, MAX_NOTE_LENGTH, type NoteKind } from '@/lib/files/document-notes'
import { isEngagementLeadRole } from '@/lib/engagement-access'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * PATCH  /api/projects/[projectId]/documents/[documentId]/notes/[noteId] — edit: { kind?, body? }.
 * DELETE /api/projects/[projectId]/documents/[documentId]/notes/[noteId] — remove it.
 *
 * Its author edits a note; its author or the engagement lead removes it. The checks happen in the
 * same UPDATE that makes the change (lib/files/document-notes.ts), so they can't go stale.
 */

const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { params: Promise<{ projectId: string; documentId: string; noteId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { projectId, documentId, noteId } = await params
        if (!NOTE_ID.test(noteId)) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
        const access = await notesAccess(projectId, documentId, { write: true })
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

        const input = await request.json().catch(() => ({}))
        const patch: { kind?: NoteKind; body?: string } = {}
        if (input.body !== undefined) {
            const body = typeof input.body === 'string' ? input.body.trim() : ''
            if (!body) return NextResponse.json({ error: 'A note needs some text' }, { status: 400 })
            if (body.length > MAX_NOTE_LENGTH) {
                return NextResponse.json({ error: `A note can be up to ${MAX_NOTE_LENGTH} characters` }, { status: 400 })
            }
            patch.body = body
        }
        if (input.kind !== undefined) {
            if (!isNoteKind(input.kind)) return NextResponse.json({ error: 'Unknown kind of note' }, { status: 400 })
            patch.kind = input.kind
        }
        if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

        const changed = await editNote(access.documentId, noteId, access.userId, patch)
        if (!changed) return NextResponse.json({ error: 'Only its author can edit a note' }, { status: 404 })

        audit(AUDIT_EVENT.DOCUMENT_NOTE_CHANGED)
            .scope(AUDIT_SCOPE.DOCUMENT)
            .firm(access.firmId)
            .client(access.clientId)
            .engagement(projectId)
            .document(access.documentId)
            .actor(access.userId)
            .meta({ fileName: access.fileName, noteId, ...(patch.kind ? { kind: patch.kind } : {}) })
            .fireAndForget()

        return NextResponse.json({ success: true })
    } catch (e) {
        console.error('PATCH note error', e)
        return NextResponse.json({ error: 'Failed to edit note' }, { status: 500 })
    }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
    try {
        const { projectId, documentId, noteId } = await params
        if (!NOTE_ID.test(noteId)) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
        const access = await notesAccess(projectId, documentId, { write: true })
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

        const removed = await deleteNote(access.documentId, noteId, access.userId, isEngagementLeadRole(access.role))
        if (!removed) return NextResponse.json({ error: 'Only its author or the engagement lead can delete a note' }, { status: 404 })

        audit(AUDIT_EVENT.DOCUMENT_NOTE_DELETED)
            .scope(AUDIT_SCOPE.DOCUMENT)
            .firm(access.firmId)
            .client(access.clientId)
            .engagement(projectId)
            .document(access.documentId)
            .actor(access.userId)
            .meta({ fileName: access.fileName, noteId })
            .fireAndForget()

        return NextResponse.json({ success: true })
    } catch (e) {
        console.error('DELETE note error', e)
        return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
    }
}
