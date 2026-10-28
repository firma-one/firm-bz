import 'server-only'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'

/**
 * A document's notes: the firm's own running log on a file (Details → Info), in
 * `engagement_documents.settings.notes` (.claude/plans/engagement-assets-details.md, §2.1).
 *
 * Internal-only. The notes routes refuse external roles, and every response that sends a
 * document's settings to the browser leaves `notes` out (settingsForBrowser in
 * lib/sharing-settings.ts) — the notes routes are the one way to read them.
 *
 * Every write is a single UPDATE that changes `notes` in place, so two people adding a note at the
 * same moment both land. A read-then-write in JS would let one overwrite the other.
 */

export const NOTE_KINDS = ['note', 'decision', 'client_request', 'risk'] as const
export type NoteKind = typeof NOTE_KINDS[number]

/** Caps on what one file keeps: its settings are read with every Files listing. */
export const MAX_NOTES_PER_DOCUMENT = 50
export const MAX_NOTE_LENGTH = 1000

export interface DocumentNote {
    id: string
    kind: NoteKind
    body: string
    authorUserId: string
    createdAt: string
    editedAt?: string
}

export function isNoteKind(value: unknown): value is NoteKind {
    return typeof value === 'string' && (NOTE_KINDS as readonly string[]).includes(value)
}

/** The notes as stored, well-formed ones only, newest first. */
export function notesOf(settings: unknown): DocumentNote[] {
    const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).notes : undefined
    if (!Array.isArray(raw)) return []
    return raw
        .filter((n): n is DocumentNote =>
            !!n && typeof n === 'object'
            && typeof (n as DocumentNote).id === 'string'
            && typeof (n as DocumentNote).body === 'string'
            && typeof (n as DocumentNote).authorUserId === 'string'
            && typeof (n as DocumentNote).createdAt === 'string'
            && isNoteKind((n as DocumentNote).kind))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function listNotes(documentId: string): Promise<DocumentNote[]> {
    const doc = await prisma.engagementDocument.findUnique({ where: { id: documentId }, select: { settings: true } })
    return notesOf(doc?.settings)
}

/** Adds a note, or returns null when the document already holds MAX_NOTES_PER_DOCUMENT. */
export async function addNote(documentId: string, authorUserId: string, input: { kind: NoteKind; body: string }): Promise<DocumentNote | null> {
    const note: DocumentNote = {
        id: randomUUID(),
        kind: input.kind,
        body: input.body,
        authorUserId,
        createdAt: new Date().toISOString(),
    }
    const updated = await prisma.$executeRaw`
        UPDATE platform.engagement_documents
        SET "settings" = jsonb_set(
                COALESCE("settings", '{}'::jsonb), '{notes}',
                COALESCE("settings"->'notes', '[]'::jsonb) || ${JSON.stringify([note])}::jsonb
            ),
            "updatedAt" = NOW(),
            "updatedBy" = ${authorUserId}::uuid
        WHERE id = ${documentId}::uuid
          AND jsonb_array_length(COALESCE("settings"->'notes', '[]'::jsonb)) < ${MAX_NOTES_PER_DOCUMENT}`
    return updated === 1 ? note : null
}

/** Changes a note's text or kind. Only its author may; returns false when it isn't theirs or is gone. */
export async function editNote(documentId: string, noteId: string, userId: string, patch: { kind?: NoteKind; body?: string }): Promise<boolean> {
    const changes = JSON.stringify({ ...patch, editedAt: new Date().toISOString() })
    const updated = await prisma.$executeRaw`
        UPDATE platform.engagement_documents
        SET "settings" = jsonb_set("settings", '{notes}', (
                SELECT jsonb_agg(CASE WHEN n->>'id' = ${noteId} THEN n || ${changes}::jsonb ELSE n END ORDER BY ord)
                FROM jsonb_array_elements("settings"->'notes') WITH ORDINALITY AS t(n, ord)
            )),
            "updatedAt" = NOW(),
            "updatedBy" = ${userId}::uuid
        WHERE id = ${documentId}::uuid
          AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE("settings"->'notes', '[]'::jsonb)) AS n
              WHERE n->>'id' = ${noteId} AND n->>'authorUserId' = ${userId}
          )`
    return updated === 1
}

/**
 * Removes a note outright — deleting it means its text is gone, not hidden. Its author may, and so
 * may the engagement lead. The audit trail records that it happened, never what it said.
 */
export async function deleteNote(documentId: string, noteId: string, userId: string, isLead: boolean): Promise<boolean> {
    const updated = await prisma.$executeRaw`
        UPDATE platform.engagement_documents
        SET "settings" = jsonb_set("settings", '{notes}', COALESCE((
                SELECT jsonb_agg(n ORDER BY ord)
                FROM jsonb_array_elements("settings"->'notes') WITH ORDINALITY AS t(n, ord)
                WHERE n->>'id' <> ${noteId}
            ), '[]'::jsonb)),
            "updatedAt" = NOW(),
            "updatedBy" = ${userId}::uuid
        WHERE id = ${documentId}::uuid
          AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE("settings"->'notes', '[]'::jsonb)) AS n
              WHERE n->>'id' = ${noteId} AND (n->>'authorUserId' = ${userId} OR ${isLead}::boolean)
          )`
    return updated === 1
}
