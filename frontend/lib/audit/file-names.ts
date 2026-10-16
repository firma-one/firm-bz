import 'server-only'

import { prisma } from '@/lib/prisma'

/**
 * Names for file events recorded without one.
 *
 * Until 2026-10-16 a file opened through the preview route was recorded with only its ids
 * (`{ externalId, mimeType }`, no document link), and the download-share route named the file
 * under `filename` rather than `fileName`. The Audit page had no name to show and printed the
 * metadata as raw JSON. New events carry `fileName`; this fills it in for the older ones when the
 * audit list is read. The stored rows are not changed.
 *
 * A lookup only matches documents in the event's own engagement (and firm, when given), so a
 * stored id can never surface another engagement's file name.
 */

type EventForNames = {
    engagementId: string | null
    projectDocumentId: string | null
    metadata: unknown
}

/** The file name an event's metadata records, under either key routes have used. */
export function recordedFileName(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object') return null
    const m = metadata as Record<string, unknown>
    if (typeof m.fileName === 'string' && m.fileName) return m.fileName
    if (typeof m.filename === 'string' && m.filename) return m.filename
    return null
}

function externalIdOf(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object') return null
    const id = (metadata as Record<string, unknown>).externalId
    return typeof id === 'string' && id ? id : null
}

export async function withResolvedFileNames<T extends EventForNames>(events: T[], firmId?: string | null): Promise<T[]> {
    const missing = events.filter(
        (e) => e.engagementId && !recordedFileName(e.metadata) && (e.projectDocumentId || externalIdOf(e.metadata))
    )
    if (missing.length === 0) return events

    const engagementIds = Array.from(new Set(missing.map((e) => e.engagementId!)))
    const documentIds = Array.from(new Set(missing.map((e) => e.projectDocumentId).filter((v): v is string => Boolean(v))))
    const externalIds = Array.from(new Set(missing.map((e) => externalIdOf(e.metadata)).filter((v): v is string => Boolean(v))))

    const docs = await prisma.engagementDocument.findMany({
        where: {
            engagementId: { in: engagementIds },
            ...(firmId ? { firmId } : {}),
            OR: [
                ...(documentIds.length ? [{ id: { in: documentIds } }] : []),
                ...(externalIds.length ? [{ externalId: { in: externalIds } }] : []),
            ],
        },
        select: { id: true, externalId: true, engagementId: true, fileName: true },
    })

    const byId = new Map(docs.map((d) => [`${d.engagementId}:${d.id}`, d.fileName]))
    const byExternalId = new Map(docs.map((d) => [`${d.engagementId}:${d.externalId}`, d.fileName]))

    return events.map((e) => {
        if (!e.engagementId || recordedFileName(e.metadata)) return e
        const externalId = externalIdOf(e.metadata)
        const name =
            (e.projectDocumentId && byId.get(`${e.engagementId}:${e.projectDocumentId}`)) ||
            (externalId && byExternalId.get(`${e.engagementId}:${externalId}`)) ||
            null
        if (!name) return e
        const metadata = { ...((e.metadata as Record<string, unknown> | null) ?? {}), fileName: name }
        return { ...e, metadata }
    })
}
