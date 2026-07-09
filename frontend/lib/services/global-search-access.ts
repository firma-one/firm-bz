import { prisma } from '../prisma'
import { userSettingsPlus } from '../user-settings-plus'

export interface GlobalSearchAccessScope {
    isFirmAdmin: boolean
    /** Engagement IDs where the user has full internal access (eng_admin/eng_member). */
    fullAccessEngagementIds: string[]
    /** Engagement IDs where the user only has external/limited access (eng_ext_collaborator/eng_viewer) — per-document grants apply. */
    grantGatedEngagementIds: string[]
}

/**
 * Computes what a user can see for global (firm-wide) search, mirroring the same
 * access rules that already gate single-project search (EngagementMember role,
 * FirmMember firm_admin override) — no new access model, just a firm-wide view of
 * the existing one.
 */
export async function computeGlobalSearchAccessScope(userId: string, firmId: string): Promise<GlobalSearchAccessScope> {
    const settings = await userSettingsPlus.getUserSettingsPlus(userId)
    const firm = settings.permissions.firms.find(f => f.id === firmId)
    const isFirmAdmin = firm?.personas.includes('firm_admin') ?? false

    if (isFirmAdmin) {
        return { isFirmAdmin: true, fullAccessEngagementIds: [], grantGatedEngagementIds: [] }
    }

    const memberships = await prisma.engagementMember.findMany({
        where: {
            userId,
            engagement: { firmId, isDeleted: false },
        },
        select: { engagementId: true, role: true },
    })

    const fullAccessEngagementIds: string[] = []
    const grantGatedEngagementIds: string[] = []
    for (const m of memberships) {
        if (m.role === 'eng_admin' || m.role === 'eng_member') {
            fullAccessEngagementIds.push(m.engagementId)
        } else {
            grantGatedEngagementIds.push(m.engagementId)
        }
    }

    return { isFirmAdmin: false, fullAccessEngagementIds, grantGatedEngagementIds }
}
