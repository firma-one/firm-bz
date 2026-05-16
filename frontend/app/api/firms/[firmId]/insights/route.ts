import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { findFirmInPermissions } from '@/lib/permission-helpers'
import { getUserReminders, type ReminderWithContext } from '@/lib/actions/user-reminders'

function firmPrivileges(scopes: Record<string, string[]> | undefined): string[] {
  if (!scopes) return []
  return scopes.firm ?? []
}

export interface ProspectItem {
  clientId: string
  clientName: string
  clientSlug: string
  followUpDate: string
  expectedCloseDate: string | null
  daysUntil: number
}

export interface PendingInviteItem {
  invitationId: string
  email: string
  engagementId: string
  engagementName: string
  engagementSlug: string
  clientSlug: string
  expireAt: string
  daysUntilExpiry: number
}

export interface EngagementDueSoonItem {
  engagementId: string
  engagementName: string
  engagementSlug: string
  clientName: string
  clientSlug: string
  dueDate: string
  daysUntil: number
  status: string
}

export interface WeeklyActivityStats {
  newClients: number
  newEngagements: number
  invitationsSent: number
  engagementsClosed: number
}

export interface ContractTypeCount {
  type: string
  count: number
}

export interface UnansweredThreadItem {
  engagementId: string
  engagementName: string
  engagementSlug: string
  clientName: string
  clientSlug: string
  documentName: string
  lastMessage: string
  lastMessageAt: string
  threadId: string
}

export interface EngagementPipelineItem {
  engagementId: string
  engagementName: string
  engagementSlug: string
  value: number
  closingSoon: boolean
  status: string
}

export interface ClientPipelineItem {
  clientId: string
  clientName: string
  clientSlug: string
  value: number
  closingSoonValue: number
  engagementCount: number
  engagements: EngagementPipelineItem[]
}

export interface FirmInsightsResponse {
  clientCounts: { ACTIVE: number; PROSPECT: number; ON_HOLD: number; PAST: number }
  activeEngagements: number
  overdueDueDates: number
  nearingDueDates: number
  prospects: ProspectItem[]
  pendingInvitations: PendingInviteItem[]
  urgentReminders: ReminderWithContext[]
  upcomingReminders: ReminderWithContext[]
  engagementsDueSoon: EngagementDueSoonItem[]
  weeklyActivity: WeeklyActivityStats
  pipelineValue: number
  closingSoonValue: number
  revenueAtRisk: number
  contractTypeBreakdown: ContractTypeCount[]
  clientPipelineBreakdown: ClientPipelineItem[]
  unansweredThreads: UnansweredThreadItem[]
  totalEngagementCount: number
  currencySymbol: string
  engagementStatusBreakdown: { PLANNED: number; ACTIVE: number; PAUSED: number }
}

/**
 * GET /api/firms/[firmId]/insights
 * Business-level insights for the firm. Requires firm manage permission.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { firmId } = await params
    const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
    const firm = findFirmInPermissions(settings.permissions, firmId)
    if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })
    const canManage = firmPrivileges(firm.scopes).includes('can_manage')
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const firmRecord = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
    const firmSettings = (firmRecord?.settings as Record<string, unknown>) ?? {}
    const currencySymbol = ((firmSettings.currency as Record<string, string> | undefined)?.symbol) ?? ''

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in7Days = new Date(today)
    in7Days.setDate(today.getDate() + 7)
    const in30Days = new Date(today)
    in30Days.setDate(today.getDate() + 30)

    const oneWeekAgo = new Date(today)
    oneWeekAgo.setDate(today.getDate() - 7)

    const [clients, engagements, activeEngagementCount, invitations, reminders, newClientsCount, newEngagementsCount, invitationsSentCount, closedEngagementsCount, totalEngagementWithDriveCount, allEngagementValues, engagementStatusRows] = await Promise.all([
      prisma.client.findMany({
        where: { firmId, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          followUpDate: true,
          expectedCloseDate: true,
        },
      }),
      prisma.engagement.findMany({
        where: {
          firmId,
          isDeleted: false,
          status: { notIn: ['COMPLETED', 'PAUSED'] },
          dueDate: { not: null },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          dueDate: true,
          status: true,
          rateOrValue: true,
          contractType: true,
          clientId: true,
          client: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.engagement.count({
        where: {
          firmId,
          isDeleted: false,
          status: { notIn: ['COMPLETED', 'PAUSED'] },
        },
      }),
      prisma.engagementInvitation.findMany({
        where: {
          engagement: { firmId },
          status: 'PENDING',
          expireAt: { gt: new Date() },
        },
        select: {
          id: true,
          email: true,
          expireAt: true,
          engagement: {
            select: {
              id: true,
              name: true,
              slug: true,
              client: { select: { slug: true } },
            },
          },
        },
        orderBy: { expireAt: 'asc' },
        take: 20,
      }),
      getUserReminders(),
      prisma.client.count({ where: { firmId, deletedAt: null, createdAt: { gte: oneWeekAgo } } }),
      prisma.engagement.count({ where: { firmId, isDeleted: false, createdAt: { gte: oneWeekAgo } } }),
      prisma.engagementInvitation.count({ where: { engagement: { firmId }, createdAt: { gte: oneWeekAgo } } }),
      prisma.engagement.count({ where: { firmId, isDeleted: false, status: 'COMPLETED', updatedAt: { gte: oneWeekAgo } } }),
      // Total engagement count with connectorRootFolderId for drive alerts coverage
      prisma.engagement.count({
        where: { firmId, isDeleted: false, connectorRootFolderId: { not: null } },
      }),
      // All engagements (inc. completed) for computing per-client relationship value
      prisma.engagement.findMany({
        where: { firmId, isDeleted: false },
        select: { clientId: true, rateOrValue: true },
      }),
      // Engagement status distribution
      prisma.engagement.groupBy({
        by: ['status'],
        where: { firmId, isDeleted: false, status: { in: ['PLANNED', 'ACTIVE', 'PAUSED'] } },
        _count: { _all: true },
      }),
    ])

    // Client counts by status
    const clientCounts = { ACTIVE: 0, PROSPECT: 0, ON_HOLD: 0, PAST: 0 }
    for (const c of clients) {
      const s = (c.status ?? 'ACTIVE') as keyof typeof clientCounts
      if (s in clientCounts) clientCounts[s]++
    }

    // Prospects with follow-up dates
    const prospects: ProspectItem[] = clients
      .filter((c) => c.status === 'PROSPECT' && c.followUpDate)
      .map((c) => {
        const d = new Date(c.followUpDate!)
        d.setHours(0, 0, 0, 0)
        const daysUntil = Math.round((d.getTime() - today.getTime()) / 86400000)
        return {
          clientId: c.id,
          clientName: c.name,
          clientSlug: c.slug,
          followUpDate: c.followUpDate!.toISOString(),
          expectedCloseDate: c.expectedCloseDate?.toISOString() ?? null,
          daysUntil,
        }
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)

    // Engagements due soon (within 30 days or overdue)
    const activeEngagements = activeEngagementCount
    let overdueDueDates = 0
    let nearingDueDates = 0
    const engagementsDueSoon: EngagementDueSoonItem[] = []

    for (const e of engagements) {
      if (!e.dueDate) continue
      const d = new Date(e.dueDate)
      d.setHours(0, 0, 0, 0)
      const daysUntil = Math.round((d.getTime() - today.getTime()) / 86400000)
      if (daysUntil < 0) overdueDueDates++
      if (daysUntil >= 0 && daysUntil <= 7) nearingDueDates++
      if (daysUntil <= 30) {
        engagementsDueSoon.push({
          engagementId: e.id,
          engagementName: e.name,
          engagementSlug: e.slug,
          clientName: e.client.name,
          clientSlug: e.client.slug,
          dueDate: e.dueDate.toISOString(),
          daysUntil,
          status: e.status,
        })
      }
    }

    // Pending invitations
    const pendingInvitations: PendingInviteItem[] = invitations
      .filter((inv) => inv.expireAt != null)
      .map((inv) => {
        const d = new Date(inv.expireAt!)
        d.setHours(0, 0, 0, 0)
        return {
          invitationId: inv.id,
          email: inv.email,
          engagementId: inv.engagement.id,
          engagementName: inv.engagement.name,
          engagementSlug: inv.engagement.slug,
          clientSlug: inv.engagement.client.slug,
          expireAt: inv.expireAt!.toISOString(),
          daysUntilExpiry: Math.round((d.getTime() - today.getTime()) / 86400000),
        }
      })

    // Pipeline value computations
    let pipelineValue = 0
    let closingSoonValue = 0
    for (const e of engagements) {
      const val = e.rateOrValue ? Number(e.rateOrValue) : 0
      pipelineValue += val
      if (e.dueDate) {
        const d = new Date(e.dueDate); d.setHours(0, 0, 0, 0)
        const days = Math.round((d.getTime() - today.getTime()) / 86400000)
        if (days <= 30) closingSoonValue += val
      }
    }

    // Per-client total relationship value = sum of all engagement rateOrValue (inc. completed)
    const clientTotalValueMap = new Map<string, number>()
    for (const e of allEngagementValues) {
      if (!e.rateOrValue) continue
      clientTotalValueMap.set(e.clientId, (clientTotalValueMap.get(e.clientId) ?? 0) + Number(e.rateOrValue))
    }

    // Revenue at risk: active/prospect clients with engagement history but no current active engagement
    let revenueAtRisk = 0
    for (const c of clients) {
      if ((c.status === 'ACTIVE' || c.status === 'PROSPECT')) {
        const totalVal = clientTotalValueMap.get(c.id) ?? 0
        if (totalVal > 0) {
          const hasActiveEng = engagements.some(e => e.clientId === c.id)
          if (!hasActiveEng) revenueAtRisk += totalVal
        }
      }
    }

    // Per-client pipeline breakdown
    const clientPipelineMap = new Map<string, ClientPipelineItem>()
    for (const e of engagements) {
      const val = e.rateOrValue ? Number(e.rateOrValue) : 0
      let closingSoon = false
      if (e.dueDate) {
        const d = new Date(e.dueDate); d.setHours(0, 0, 0, 0)
        closingSoon = Math.round((d.getTime() - today.getTime()) / 86400000) <= 30
      }
      const entry = clientPipelineMap.get(e.clientId) ?? {
        clientId: e.clientId,
        clientName: e.client.name,
        clientSlug: e.client.slug,
        value: 0,
        closingSoonValue: 0,
        engagementCount: 0,
        engagements: [],
      }
      entry.value += val
      entry.engagementCount++
      if (closingSoon) entry.closingSoonValue += val
      entry.engagements.push({
        engagementId: e.id,
        engagementName: e.name,
        engagementSlug: e.slug,
        value: val,
        closingSoon,
        status: e.status,
      })
      clientPipelineMap.set(e.clientId, entry)
    }
    const clientPipelineBreakdown = Array.from(clientPipelineMap.values())
      .map((c) => ({ ...c, engagements: c.engagements.sort((a, b) => b.value - a.value) }))
      .sort((a, b) => b.value - a.value)

    // Contract type breakdown
    const contractTypeMap = new Map<string, number>()
    for (const e of engagements) {
      const t = e.contractType ?? 'Unspecified'
      contractTypeMap.set(t, (contractTypeMap.get(t) ?? 0) + 1)
    }
    const contractTypeBreakdown: ContractTypeCount[] = Array.from(contractTypeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)

    // Unanswered threads: scan messages across active engagements
    const engagementIdList = engagements.map((e) => e.id)
    let unansweredThreads: UnansweredThreadItem[] = []
    if (engagementIdList.length > 0) {
      const [firmMessages, externalMembers] = await Promise.all([
        prisma.docCommentMessage.findMany({
          where: { engagementId: { in: engagementIdList } },
          select: { projectDocumentId: true, authorUserId: true, content: true, createdAt: true, engagementId: true },
          orderBy: { createdAt: 'asc' },
          take: 2000,
        }),
        prisma.engagementMember.findMany({
          where: { engagementId: { in: engagementIdList }, role: { in: ['eng_ext_collaborator', 'eng_viewer'] } },
          select: { userId: true, engagementId: true },
        }),
      ])
      const docIdsNeeded = Array.from(new Set(firmMessages.map((m) => m.projectDocumentId).filter(Boolean))) as string[]
      const firmDocs = docIdsNeeded.length > 0
        ? await prisma.engagementDocument.findMany({ where: { id: { in: docIdsNeeded } }, select: { id: true, fileName: true } })
        : []

      const externalUserIds = new Set(externalMembers.map((m) => m.userId))
      const docNameMap = new Map(firmDocs.map((d) => [d.id, d.fileName]))
      const engMap = new Map(engagements.map((e) => [e.id, e]))

      const threadsByDoc = new Map<string, typeof firmMessages>()
      for (const m of firmMessages) {
        if (!m.projectDocumentId) continue
        if (!threadsByDoc.has(m.projectDocumentId)) threadsByDoc.set(m.projectDocumentId, [])
        threadsByDoc.get(m.projectDocumentId)!.push(m)
      }

      for (const [docId, thread] of Array.from(threadsByDoc.entries())) {
        const lastMsg = thread[thread.length - 1]
        if (!lastMsg.authorUserId || !externalUserIds.has(lastMsg.authorUserId)) continue
        const eng = engMap.get(thread[0].engagementId)
        if (!eng) continue
        unansweredThreads.push({
          engagementId: eng.id,
          engagementName: eng.name,
          engagementSlug: eng.slug,
          clientName: eng.client.name,
          clientSlug: eng.client.slug,
          documentName: docNameMap.get(docId) ?? 'Unknown document',
          lastMessage: String(lastMsg.content ?? '').slice(0, 150),
          lastMessageAt: lastMsg.createdAt.toISOString(),
          threadId: docId,
        })
      }
      unansweredThreads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    }

    // Engagement status distribution
    const engagementStatusBreakdown = { PLANNED: 0, ACTIVE: 0, PAUSED: 0 }
    for (const row of engagementStatusRows) {
      const s = row.status as keyof typeof engagementStatusBreakdown
      if (s in engagementStatusBreakdown) engagementStatusBreakdown[s] = row._count._all
    }

    // Split reminders by urgency (filter out hidden)
    const visibleReminders = reminders.filter((r) => !r.hiddenAt)
    const urgentReminders = visibleReminders.filter((r) =>
      r.labelStyle === 'red' || r.labelStyle === 'orange'
    )
    const upcomingReminders = visibleReminders.filter((r) =>
      r.labelStyle === 'amber' || r.labelStyle === 'slate'
    )

    const response: FirmInsightsResponse = {
      clientCounts,
      activeEngagements,
      overdueDueDates,
      nearingDueDates,
      prospects,
      pendingInvitations,
      urgentReminders,
      upcomingReminders,
      engagementsDueSoon,
      weeklyActivity: {
        newClients: newClientsCount,
        newEngagements: newEngagementsCount,
        invitationsSent: invitationsSentCount,
        engagementsClosed: closedEngagementsCount,
      },
      pipelineValue,
      closingSoonValue,
      revenueAtRisk,
      contractTypeBreakdown,
      clientPipelineBreakdown,
      unansweredThreads,
      totalEngagementCount: totalEngagementWithDriveCount,
      currencySymbol,
      engagementStatusBreakdown,
    }

    return NextResponse.json(response)
  } catch (e) {
    console.error('GET firm insights error', e)
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 })
  }
}
