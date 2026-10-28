import { NextRequest, NextResponse } from 'next/server'
import { notesAccess } from '@/lib/files/document-notes-access'
import { addNote, isNoteKind, listNotes, MAX_NOTE_LENGTH, MAX_NOTES_PER_DOCUMENT } from '@/lib/files/document-notes'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * GET  /api/projects/[projectId]/documents/[documentId]/notes — the file's notes, newest first.
 * POST /api/projects/[projectId]/documents/[documentId]/notes — add one: { kind?, body }.
 *
 * The firm's own notes on a file (lib/files/document-notes.ts): its engagement's members in firm
 * roles only, never clients. The audit trail records a note was added, never its text.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
    try {
        const { projectId, documentId } = await params
        const access = await notesAccess(projectId, documentId, { write: false })
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
        const notes = await listNotes(access.documentId)
        return NextResponse.json({ notes, limits: { maxNotes: MAX_NOTES_PER_DOCUMENT, maxLength: MAX_NOTE_LENGTH } })
    } catch (e) {
        console.error('GET notes error', e)
        return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
    try {
        const { projectId, documentId } = await params
        const access = await notesAccess(projectId, documentId, { write: true })
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

        const input = await request.json().catch(() => ({}))
        const body = typeof input.body === 'string' ? input.body.trim() : ''
        if (!body) return NextResponse.json({ error: 'A note needs some text' }, { status: 400 })
        if (body.length > MAX_NOTE_LENGTH) {
            return NextResponse.json({ error: `A note can be up to ${MAX_NOTE_LENGTH} characters` }, { status: 400 })
        }
        const kind = input.kind === undefined ? 'note' : input.kind
        if (!isNoteKind(kind)) return NextResponse.json({ error: 'Unknown kind of note' }, { status: 400 })

        const note = await addNote(access.documentId, access.userId, { kind, body })
        if (!note) {
            return NextResponse.json(
                { error: `This file keeps up to ${MAX_NOTES_PER_DOCUMENT} notes. Delete one to add another.` },
                { status: 409 },
            )
        }

        audit(AUDIT_EVENT.DOCUMENT_NOTE_CREATED)
            .scope(AUDIT_SCOPE.DOCUMENT)
            .firm(access.firmId)
            .client(access.clientId)
            .engagement(projectId)
            .document(access.documentId)
            .actor(access.userId)
            .meta({ fileName: access.fileName, noteId: note.id, kind: note.kind })
            .fireAndForget()

        return NextResponse.json({ note }, { status: 201 })
    } catch (e) {
        console.error('POST notes error', e)
        return NextResponse.json({ error: 'Failed to add note' }, { status: 500 })
    }
}
