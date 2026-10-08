import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectManage } from '@/lib/api/engagement-auth'
import { isAiConfigured } from '@/lib/ai/client'
import { aiCreditStatus } from '@/lib/ai/credit-cap'
import { aiLimitResponse } from '@/lib/ai/guarded-client'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { runFilesReview } from '@/lib/ai/files-agent/run'
import { canAffordRun, estimateRunCredits } from '@/lib/ai/files-agent/budget'
import { issueApprovalToken } from '@/lib/ai/files-agent/approval'
import type { FileNode } from '@/lib/ai/files-agent/analyse'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/projects/[projectId]/files-agent
 *
 * Reviews an engagement's file tree and returns proposed fixes for human approval. Mutates
 * nothing — the returned token is what lets the apply route act on these proposals, and only
 * these.
 *
 * ## Why `requireProjectManage`
 *
 * `project:can_manage` is eng_admin-only, with a firm_admin fallback already inside
 * `checkProjectPermission` — exactly the Engagement-Lead-or-firm-admin boundary this needs. The
 * weaker `can_edit` would include eng_member and external collaborators, who should not be
 * restructuring an engagement they do not lead.
 *
 * The file tree is read server-side from `EngagementDocument` rather than accepted from the
 * client, for the same reason the chat route fetches its own insights: a caller could otherwise
 * describe a tree that does not exist and have the model propose operations against it.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params

        const auth = await requireProjectManage(request, projectId)
        if (auth instanceof NextResponse) return auth
        const { user, ctx } = auth

        if (!isAiConfigured()) {
            return NextResponse.json({ error: 'AI is not available right now' }, { status: 503 })
        }

        const docs = await prisma.engagementDocument.findMany({
            where: { engagementId: projectId, status: { not: 'ARCHIVED' } },
            select: {
                externalId: true, fileName: true, isFolder: true,
                parentId: true, docId: true, mimeType: true,
            },
        })

        if (docs.length === 0) {
            return NextResponse.json({
                data: { findings: [], proposals: [], token: null, nodeCount: 0 },
            })
        }

        const nodes: FileNode[] = docs.map((d) => ({
            externalId: d.externalId,
            fileName: d.fileName,
            isFolder: d.isFolder,
            parentId: d.parentId,
            docId: d.docId,
            mimeType: d.mimeType,
        }))

        // Affordability is checked against the WHOLE estimated run, not just the next call. The
        // per-call cap would let a run start with two credits left and die partway, having spent
        // them for nothing.
        const groupId = await resolveGroupId(ctx.orgId)
        if (groupId) {
            const status = await aiCreditStatus(groupId)
            const verdict = canAffordRun(nodes.length, status)
            if (!verdict.allowed) {
                return NextResponse.json(
                    { error: verdict.reason, kind: 'period', estimate: verdict.estimate },
                    { status: 429 },
                )
            }
        }

        const engagement = await prisma.engagement.findUnique({
            where: { id: projectId },
            select: { connectorRootFolderId: true },
        })

        const result = await runFilesReview({
            nodes,
            rootId: engagement?.connectorRootFolderId ?? null,
            scope: { firmId: ctx.orgId, userId: user.id, feature: 'filesAgent' as const },
        })

        if (!result) {
            return NextResponse.json({ error: 'AI is not available right now' }, { status: 503 })
        }

        // A token is minted only when there is something to apply. Issuing one for an empty batch
        // would be a signed permit to do nothing.
        const token = result.proposals.length > 0
            ? issueApprovalToken({ engagementId: projectId, userId: user.id, proposals: result.proposals })
            : null

        return NextResponse.json({
            data: {
                findings: result.findings.map((f) => ({
                    kind: f.kind,
                    fileCount: f.nodes.length,
                    files: f.nodes.slice(0, 12).map((n) => ({
                        externalId: n.externalId, fileName: n.fileName, docId: n.docId ?? null,
                    })),
                })),
                proposals: result.proposals,
                token,
                nodeCount: nodes.length,
                creditsSpent: result.creditsSpent,
                dropped: result.dropped,
                truncated: result.truncated,
                estimate: estimateRunCredits(nodes.length),
            },
        })
    } catch (error) {
        const limited = aiLimitResponse(error)
        if (limited) return limited
        logger.error('[files-agent] POST failed:', error as Error)
        return NextResponse.json({ error: 'Could not review the files' }, { status: 500 })
    }
}
