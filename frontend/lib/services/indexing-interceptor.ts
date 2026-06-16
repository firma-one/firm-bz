import { NextRequest } from 'next/server'
import { safeInngestSend } from '../inngest/client'
import { assertWithinDocumentCap } from '@/lib/billing/effective-billing-caps'

export class IndexingInterceptor {
    /**
     * Intercepts a single file operation for indexing by sending an Inngest event.
     */
    static async indexSingle(_request: NextRequest, params: {
        organizationId: string
        clientId?: string
        projectId?: string
        externalId: string
        fileName: string
        parentId?: string
        actorId?: string | null
    }) {
        await assertWithinDocumentCap(params.organizationId, 1)
        await safeInngestSend('file.index.requested', params)
    }

    /**
     * Intercepts a batch of file operations for indexing by sending an Inngest event.
     * Entire batch is rejected upfront if it would exceed the cap.
     */
    static async indexBatch(_request: NextRequest, params: {
        organizationId: string
        clientId?: string
        projectId?: string
        files: { externalId: string; fileName: string; parentId?: string }[]
        actorId?: string | null
    }) {
        if (!params.files.length) return

        await assertWithinDocumentCap(params.organizationId, params.files.length)
        await safeInngestSend('file.index.batch.requested', params)
    }
}
