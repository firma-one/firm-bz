import 'server-only'
import { prisma } from '@/lib/prisma'

/** Marks a support request as an account deletion, so it can be found and worked as a queue. */
export const DELETION_REQUEST_KIND = 'account-deletion'

/**
 * What deleting one account would actually touch.
 *
 * ## Why a plan rather than a delete function
 *
 * Deletion is fulfilled by a person working a request, and the question they need answered first
 * is "what am I about to change?". This answers it without changing anything, so the same code
 * backs the preview they read and the record of what was approved.
 *
 * ## What deletion means here
 *
 * NOT "remove every row this user appears in". Both CCPA (section 1798.105(d)) and PIPEDA permit
 * keeping records needed for security, audit and legal obligations, and a firm's engagement
 * history is exactly that — an audit trail a participant can erase is not an audit trail, and a
 * colleague's engagement should not lose its history because a former member left.
 *
 * What is erased is the IDENTITY: the auth record, the profile, the credentials, the
 * personalization. What remains is de-identified — an orphaned uuid in an audit row that resolves
 * to "Former member" rather than to a person.
 *
 * ## Why no cascade fires
 *
 * There is no `User` model. Every `userId` in the schema is a plain uuid with no foreign key to
 * Supabase auth, so deleting the auth record removes nothing else by itself. That is worth
 * stating because it is the opposite of what a reader would assume from the 34 `onDelete: Cascade`
 * rules elsewhere in the schema.
 *
 * The ONE exception is `EngagementDocumentSharingUser`, keyed on `(engagementId, userId)` against
 * `EngagementMember` with a cascade. Removing a membership row therefore removes that user's
 * document-sharing records with it — intended, since someone who is no longer a member should not
 * retain share entries, but it must be a decision rather than a surprise.
 */

export interface DeletionPlan {
    userId: string
    email: string | null

    /** Rows removed outright, because they are the user's own identity or preferences. */
    erase: {
        authRecord: boolean
        personalization: boolean
        notifications: number
        groupMemberships: number
        firmMemberships: number
        clientMemberships: number
        engagementMemberships: number
        /** Cascades from engagement membership — see the note above. */
        documentShares: number
    }

    /** Rows kept, with the user no longer identifiable from them. */
    retain: {
        auditEvents: number
        aiUsage: number
        aiFeedback: number
        supportRequests: number
        /** Rows elsewhere stamped `createdBy` or `updatedBy` with this user. */
        authorshipStamps: number
    }

    /**
     * Things a person must decide before fulfilling, with no safe default.
     *
     * The important one is a group the user is the last member of: the policy says a shared
     * workspace continues without you, which is true while colleagues remain and silent when none
     * do. Deleting the last member would strand the firms and engagements under it.
     */
    warnings: string[]
}

export async function buildDeletionPlan(userId: string, email: string | null): Promise<DeletionPlan> {
    const [
        personalization, notifications,
        groupMemberships, firmMemberships, clientMemberships, engagementMemberships,
        documentShares, auditEvents, aiUsage, aiFeedback, supportRequests,
    ] = await Promise.all([
        prisma.userPersonalization.count({ where: { userId } }),
        prisma.notification.count({ where: { userId } }),
        prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } }),
        prisma.firmMember.count({ where: { userId } }),
        prisma.clientMember.count({ where: { userId } }),
        prisma.engagementMember.count({ where: { userId } }),
        prisma.engagementDocumentSharingUser.count({ where: { userId } }),
        prisma.platformAuditEvent.count({ where: { actorUserId: userId } }),
        prisma.platformAiUsage.count({ where: { userId } }),
        prisma.platformAiFeedback.count({ where: { userId } }),
        prisma.customerRequest.count({ where: { userId } }),
    ])

    const warnings: string[] = []

    // A group with no other members would be stranded, along with every firm and engagement under
    // it. Checked per group rather than in aggregate: being the last member of one while belonging
    // to three others is the case that matters.
    for (const { groupId } of groupMemberships) {
        const others = await prisma.groupMember.count({
            where: { groupId, userId: { not: userId } },
        })
        if (others === 0) {
            const group = await prisma.group.findUnique({
                where: { id: groupId },
                select: { name: true, _count: { select: { firms: true } } },
            })
            warnings.push(
                `Last member of workspace "${group?.name ?? groupId}"`
                + `${group?._count.firms ? ` (${group._count.firms} firms)` : ''}`
                + ' — deleting this account leaves it with no members. Transfer ownership or close '
                + 'the workspace first.',
            )
        }
    }

    // Authorship stamps are counted but never cleared: "created by" on an engagement is part of
    // its history, and the uuid resolves to nothing once the account is gone.
    const authorshipStamps = await countAuthorshipStamps(userId)
    if (authorshipStamps > 0) {
        warnings.push(
            `${authorshipStamps} records are stamped as created or last updated by this user. `
            + 'These are left as-is; the id will no longer resolve to a person.',
        )
    }

    return {
        userId,
        email,
        erase: {
            authRecord: true,
            personalization: personalization > 0,
            notifications,
            groupMemberships: groupMemberships.length,
            firmMemberships,
            clientMemberships,
            engagementMemberships,
            documentShares,
        },
        retain: {
            auditEvents,
            aiUsage,
            aiFeedback,
            supportRequests,
            authorshipStamps,
        },
        warnings,
    }
}

/**
 * How many records elsewhere carry this user in `createdBy` or `updatedBy`.
 *
 * Counted across the models where a stamp is meaningful to a reader of the plan. Not exhaustive by
 * design — the number conveys scale, and a precise count across fifty columns would cost more
 * queries than the answer is worth.
 */
async function countAuthorshipStamps(userId: string): Promise<number> {
    const where = { OR: [{ createdBy: userId }, { updatedBy: userId }] }
    const counts = await Promise.all([
        prisma.engagement.count({ where }),
        prisma.client.count({ where }),
        prisma.engagementDocument.count({ where }),
        prisma.docCommentMessage.count({ where }),
        prisma.engagementWikiPage.count({ where }),
    ])
    return counts.reduce((sum, n) => sum + n, 0)
}
