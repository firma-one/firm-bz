import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectManage } from '@/lib/api/engagement-auth'
import { isAiConfigured } from '@/lib/ai/client'
import { aiCreditStatus } from '@/lib/ai/credit-cap'
import { aiLimitResponse } from '@/lib/ai/guarded-client'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { runFilesReview } from '@/lib/ai/files-agent/run'
import { canAffordRun, estimateRunCredits } from '@/lib/ai/files-agent/budget'
import { buildFilesSuggestions } from '@/lib/ai/files-suggestions'
import { issueApprovalToken } from '@/lib/ai/files-agent/approval'
import type { FileNode } from '@/lib/ai/files-agent/analyze'
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
/**
 * GET /api/projects/[projectId]/files-agent
 *
 * Starting prompts for the Files panel, derived from the same deterministic analysis the review
 * uses. No model call and no credit: the chips must be right the moment the panel opens, and
 * charging to populate them would be absurd.
 *
 * Same permission boundary as the review it introduces.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params

        const auth = await requireProjectManage(request, projectId)
        if (auth instanceof NextResponse) return auth

        const [docs, engagement] = await Promise.all([
            prisma.engagementDocument.findMany({
                where: { engagementId: projectId, status: { not: 'ARCHIVED' } },
                select: {
                    externalId: true, fileName: true, isFolder: true,
                    parentId: true, docId: true, mimeType: true,
                },
            }),
            prisma.engagement.findUnique({
                where: { id: projectId },
                select: { connectorRootFolderId: true },
            }),
        ])

        const nodes: FileNode[] = docs.map((d) => ({
            externalId: d.externalId,
            fileName: d.fileName,
            isFolder: d.isFolder,
            parentId: d.parentId,
            docId: d.docId,
            mimeType: d.mimeType,
        }))

        return NextResponse.json({
            data: {
                suggestions: buildFilesSuggestions(nodes, engagement?.connectorRootFolderId ?? null),
                estimate: estimateRunCredits(nodes.length),
                nodeCount: nodes.length,
            },
        })
    } catch (error) {
        // Suggestions are an aid, not the feature. An empty list degrades to the panel's own
        // placeholder rather than an error the user can do nothing about.
        logger.error('[files-agent] GET failed:', error as Error)
        return NextResponse.json({ data: { suggestions: [], estimate: 0, nodeCount: 0 } })
    }
}

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
                data: { findings: [], proposals: [], token: null, nodeCount: 0, suggestions: [] },
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
                // Computed from the same tree the review ran on, so the chips offer questions the
                // assistant can actually answer about these files rather than generic engagement
                // prompts. Free: the analysis is already done.
                suggestions: buildFilesSuggestions(nodes, engagement?.connectorRootFolderId ?? null),
                creditsSpent: result.creditsSpent,
                dropped: result.dropped,
                truncated: result.truncated,
                // Always sent, findings or not: a clean review has to report what it checked.
                summary: result.summary,
                summaryMarkdown: result.summaryMarkdown,
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
