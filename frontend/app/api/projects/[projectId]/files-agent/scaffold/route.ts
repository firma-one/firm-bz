import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectManage } from '@/lib/api/engagement-auth'
import { resolveEngagementConnector } from '@/lib/connectors/resolve-client-connector'
import { getStorageAdapter } from '@/lib/connectors/registry'
import type { IConnectorStorageAdapter } from '@/lib/connectors/types'
import {
    readScaffoldFingerprint, writeScaffoldFingerprint, type ScaffoldFingerprint,
} from '@/lib/connectors/pockett-structure.service'
import { ensureFirmAgentUser } from '@/lib/ai/files-agent/agent-identity'
import { agentApprovalMeta } from '@/lib/ai/files-agent/agent-audit'
import { buildScaffold, flattenScaffold, scaffoldProposals, type ScaffoldAnswers } from '@/lib/ai/files-agent/scaffold'
import { issueApprovalToken, verifyApprovalToken } from '@/lib/ai/files-agent/approval'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { agentCreateFolder } from '@/lib/ai/files-agent/safe-ops'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'


/**
 * POST /api/projects/[projectId]/files-agent/scaffold
 *
 * Creates an engagement's folder structure from the interview answers.
 *
 * ## No model call, but an approval token all the same
 *
 * The tree is computed deterministically from the answers (see `scaffold.ts`), so there is nothing
 * for a model to decide and nothing to meter.
 *
 * It DOES need an approval token. An earlier version took the answers alone, on the reasoning that
 * creating folders is additive and therefore safe. That is the wrong test: additive is still a
 * change of state in a client's Drive, and an endpoint that takes raw answers will create folders
 * for any caller that posts them — including a tree the user never saw. The rule the agent works
 * under is that nothing changes without a person confirming the specific change, and "it only
 * adds" is not an exemption from it.
 *
 * So GET previews the tree and mints a token over the exact folders shown; POST applies only a
 * tree whose folders that token signed. The same mechanism the file review uses, for the same
 * reason.
 *
 * ## Additive, never destructive
 *
 * `findOrCreateFolder` is idempotent, so running this against an engagement that already has
 * folders adds what is missing and leaves everything else untouched. Nothing is renamed, moved or
 * deleted. An engagement mid-flight must not have its structure rearranged because somebody ran the
 * scaffold, which is also why a failure part-way through leaves the folders already created in
 * place rather than attempting to unwind them.
 */
/**
 * When this engagement was last scaffolded, if it has been.
 *
 * ## Why `.meta` and not the audit trail
 *
 * The audit trail records every scaffolded folder with `scaffold: true`, and reading it back was
 * the first implementation. It is wrong: audit retention is a BILLING ENTITLEMENT
 * (`effectiveAuditDays`, where 0 means no history at all), so on some plans the query returns
 * nothing and the warning silently never appears — a check that quietly stops working on some
 * plans is worse than no check.
 *
 * The fingerprint lives in the engagement root's `.meta`, written by platform code
 * (`writeScaffoldFingerprint`). The agent never names that folder — `findOrCreateFolder` deletes
 * duplicates of it, so letting the agent near it would be letting it cause a delete — but the
 * record belongs there: it travels with the folder tree, outlives any retention window, and is
 * where a reader looking at the Drive would expect to find out how this structure came to exist.
 */
async function previousScaffoldRun(
    adapter: IConnectorStorageAdapter,
    connectionId: string,
    rootFolderId: string,
): Promise<ScaffoldFingerprint | null> {
    try {
        return await readScaffoldFingerprint(adapter, connectionId, rootFolderId)
    } catch (error) {
        // A provider hiccup must not block the preview. Worst case the user is not warned.
        logger.warn(`[files-agent/scaffold] could not read the fingerprint: ${(error as Error).message}`)
        return null
    }
}

async function markScaffoldRun(
    adapter: IConnectorStorageAdapter,
    connectionId: string,
    rootFolderId: string,
    folderCount: number,
    answers: ScaffoldAnswers,
): Promise<void> {
    try {
        await writeScaffoldFingerprint(adapter, connectionId, rootFolderId, {
            at: new Date().toISOString(),
            folderCount,
            answers: answers as Record<string, string>,
        })
    } catch (error) {
        // A missing mark costs a duplicate warning, never a duplicate folder — the creation itself
        // is idempotent. Not worth failing a successful run over.
        logger.warn(`[files-agent/scaffold] could not record the run: ${(error as Error).message}`)
    }
}

/**
 * GET /api/projects/[projectId]/files-agent/scaffold?answers=<json>
 *
 * The tree a set of answers would produce, and a token over it. Mutates nothing.
 *
 * Minting the token HERE rather than in POST is the whole point: the token attests that this exact
 * set of folders was shown to this user, so POST can refuse a tree they never saw.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    const { projectId } = await params

    try {
        const auth = await requireProjectManage(request, projectId)
        if (auth instanceof NextResponse) return auth
        const { user } = auth

        let answers: ScaffoldAnswers = {}
        const raw = request.nextUrl.searchParams.get('answers')
        if (raw) {
            try {
                answers = JSON.parse(raw) as ScaffoldAnswers
            } catch {
                return NextResponse.json({ error: 'Could not read the answers' }, { status: 400 })
            }
        }

        const folders = flattenScaffold(buildScaffold(answers))

        // Best effort: the preview must render even where the connector is unreachable, so a
        // failure here costs the warning, not the feature.
        let previousRun: ScaffoldFingerprint | null = null
        const engagement = await prisma.engagement.findUnique({
            where: { id: projectId },
            select: { connectorRootFolderId: true },
        })
        const connector = engagement?.connectorRootFolderId
            ? await resolveEngagementConnector(projectId)
            : null
        if (connector && engagement?.connectorRootFolderId) {
            previousRun = await previousScaffoldRun(
                await getStorageAdapter(connector.type),
                connector.id,
                engagement.connectorRootFolderId,
            )
        }

        return NextResponse.json({
            data: {
                folders,
                // So the panel can warn before a second run rather than after it.
                previousRun,
                token: issueApprovalToken({
                    engagementId: projectId,
                    userId: user.id,
                    proposals: scaffoldProposals(folders),
                }),
            },
        })
    } catch (error) {
        logger.error('[files-agent/scaffold] GET failed:', error as Error)
        return NextResponse.json({ error: 'Could not build the structure' }, { status: 500 })
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    const { projectId } = await params

    try {
        const auth = await requireProjectManage(request, projectId)
        if (auth instanceof NextResponse) return auth
        const { user, ctx } = auth

        const body = await request.json().catch(() => null) as {
            answers?: unknown
            token?: unknown
        } | null
        const answers = (body?.answers ?? {}) as ScaffoldAnswers
        const token = typeof body?.token === 'string' ? body.token : ''

        const tree = buildScaffold(answers)
        const folders = flattenScaffold(tree)
        if (folders.length === 0) {
            return NextResponse.json({ error: 'Nothing to create' }, { status: 400 })
        }

        // The tree the user approved, expressed as proposals so the same signing scheme applies.
        // Rebuilt from the answers rather than taken from the request: a client cannot widen the
        // set by sending extra folders, because anything not derivable from these answers was
        // never signed.
        const verdict = verifyApprovalToken({
            token,
            engagementId: projectId,
            userId: user.id,
            proposals: scaffoldProposals(folders),
        })
        if (!verdict.ok) {
            const message = verdict.reason === 'expired'
                ? 'This preview has expired. Answer the questions again to create these folders.'
                : verdict.reason === 'already-used'
                    ? 'These folders have already been created.'
                    : 'These folders could not be verified. Start the setup again.'
            return NextResponse.json({ error: message, reason: verdict.reason }, { status: 409 })
        }

        const engagement = await prisma.engagement.findUnique({
            where: { id: projectId },
            select: { connectorRootFolderId: true },
        })
        if (!engagement?.connectorRootFolderId) {
            return NextResponse.json(
                { error: 'This engagement has no storage folder yet' }, { status: 409 },
            )
        }

        const connector = await resolveEngagementConnector(projectId)
        if (!connector) {
            return NextResponse.json({ error: 'No storage connector for this engagement' }, { status: 404 })
        }
        const adapter = await getStorageAdapter(connector.type)

        // Refused outright if this engagement has been scaffolded before.
        //
        // This was a warning until it became clear it could not be. "Creating folders is
        // idempotent" is only true when the SECOND tree matches the first: change an answer and a
        // run produces "01_Planning" beside the existing "01-Planning", and an audit structure
        // beside an advisory one. Measured, two runs with different answers leave 13 folders from
        // trees of 7 and 6.
        //
        // Reconciling that means DELETING folders, which the agent must never do. The only way to
        // keep that rule is to never create the mess: one scaffold per engagement, and anything
        // further is the user's own to do from the file list.
        //
        // Checked here, after the connector resolves and before anything is created, so the
        // refusal costs nothing and nothing is half-applied.
        const existingMark = await previousScaffoldRun(
            adapter, connector.id, engagement.connectorRootFolderId,
        )
        if (existingMark) {
            return NextResponse.json({
                error: 'This engagement already has a folder structure, set up on '
                    + `${new Date(existingMark.at).toLocaleDateString('en-US', {
                        day: 'numeric', month: 'short', year: 'numeric',
                    })}. Brio sets one up once — add or rename folders yourself from the file list.`,
                reason: 'already-scaffolded',
            }, { status: 409 })
        }

        const actorId = (await ensureFirmAgentUser(ctx.orgId)) ?? user.id
        const agentMeta = agentApprovalMeta(user)

        // Paths to provider ids, filled as each folder is created. `flattenScaffold` guarantees a
        // parent appears before its children, so the lookup is always populated by the time a
        // child needs it.
        const createdIds = new Map<string, string>()
        let created = 0
        let failed = 0

        for (const folder of folders) {
            try {
                const parentId = folder.parentPath
                    ? createdIds.get(folder.parentPath)
                    : engagement.connectorRootFolderId
                // A child whose parent failed is skipped rather than created at the root, where it
                // would be loose clutter the user then has to clean up by hand.
                if (!parentId) {
                    failed += 1
                    continue
                }

                // Through the agent wrapper, never the adapter directly — see safe-ops.ts.
                const id = await agentCreateFolder(adapter, connector.id, parentId, folder.name)
                createdIds.set(folder.path, id)
                created += 1

                audit(AUDIT_EVENT.DOCUMENT_CREATED)
                    .firm(ctx.orgId).client(ctx.clientId).engagement(projectId)
                    .actor(actorId).scope(AUDIT_SCOPE.DOCUMENT)
                    .meta({
                        fileName: folder.name,
                        parentId,
                        folderId: id,
                        scaffold: true,
                        ...agentMeta,
                    })
                    .fireAndForget()
            } catch (error) {
                logger.warn(`[files-agent/scaffold] ${folder.path} failed: ${(error as Error).message}`)
                failed += 1
            }
        }

        // Recorded AFTER the work, and only when something was actually created: a run that
        // created nothing has not scaffolded the engagement and should not claim to have.
        if (created > 0) {
            await markScaffoldRun(
                adapter, connector.id, engagement.connectorRootFolderId, created, answers,
            )
        }

        return NextResponse.json({ data: { created, failed, total: folders.length } })
    } catch (error) {
        logger.error('[files-agent/scaffold] POST failed:', error as Error)
        return NextResponse.json({ error: 'Could not create the folders' }, { status: 500 })
    }
}
