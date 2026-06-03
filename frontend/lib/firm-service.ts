import { prisma } from './prisma'
import { User } from '@supabase/supabase-js'
import { logger } from './logger'
import { assertWithinFirmGroupCap } from '@/lib/billing/effective-billing-caps'
import { userHasMembershipUnderAnchor } from '@/lib/billing/firm-creation-gate'

export interface CreateFirmData {
  userId: string
  email: string
  firstName: string
  lastName: string
  firmName: string
  /** When true, users with allowedEmailDomain can join firm without invite (firm member only). */
  allowDomainAccess?: boolean
  /** Email domain (e.g. "acme.com") to allow; stored lowercase. */
  allowedEmailDomain?: string | null
  /** Optional Drive Folder ID for the firm. */
  firmFolderId?: string | null
  /** Optional Connector ID for the firm. */
  connectorId?: string | null
  /** Whether this is a sandbox firm. */
  sandboxOnly?: boolean
  /** When set, this firm is a satellite under this anchor for billing purposes. */
  anchorFirmId?: string | null
}

export interface FirmWithMembers {
  id: string
  name: string
  slug: string
  settings?: any
  allowDomainAccess?: boolean
  allowedEmailDomain?: string | null
  brandingSubtext?: string | null
  logoUrl?: string | null
  themeColorHex?: string | null
  firmFolderId?: string | null
  connectorId?: string | null
  createdAt: Date
  sandboxOnly: boolean
  members: {
    id: string
    userId: string
    role: string
    isDefault: boolean
  }[]
}

export class FirmService {
  private static mapToInterface(firm: any): FirmWithMembers {
    if (!firm) return null as any
    return {
      id: firm.id,
      name: firm.name,
      slug: firm.slug,
      settings: firm.settings,
      allowDomainAccess: firm.allowDomainAccess,
      allowedEmailDomain: firm.allowedEmailDomain,
      brandingSubtext: firm.brandingSubtext,
      logoUrl: firm.logoUrl,
      themeColorHex: firm.themeColorHex,
      firmFolderId: firm.firmFolderId,
      connectorId: firm.connectorId,
      createdAt: firm.createdAt,
      sandboxOnly: firm.sandboxOnly,
      members: firm.members
        ? firm.members.map((m: any) => ({
            id: m.id,
            userId: m.userId,
            role: m.role || 'firm_member',
            isDefault: m.isDefault,
          }))
        : [],
    }
  }

  static async createFirmWithMember(data: CreateFirmData): Promise<FirmWithMembers> {
    const crypto = require('crypto')
    const id = crypto.randomUUID()

    const { generateFirmSlug } = await import('@/lib/slug-utils')
    const slug = await generateFirmSlug(data.firmName)

    const billingAnchorId = data.anchorFirmId?.trim() || null
    if (billingAnchorId) {
      const anchorRow = await prisma.firm.findUnique({
        where: { id: billingAnchorId },
        select: { anchorFirmId: true },
      })
      if (!anchorRow) {
        throw new Error('Billing anchor firm not found.')
      }
      if (anchorRow.anchorFirmId) {
        throw new Error('Nested anchor hierarchies are not supported.')
      }
      const allowed = await userHasMembershipUnderAnchor(data.userId, billingAnchorId)
      if (!allowed) {
        throw new Error('You cannot attach this workspace to that billing subscription.')
      }
      await assertWithinFirmGroupCap(billingAnchorId)
    }

    const firm = await (prisma as any).$transaction(async (tx: any) => {
      const created = await tx.firm.create({
        data: {
          id,
          name: data.firmName,
          slug,
          allowDomainAccess: data.allowDomainAccess ?? false,
          allowedEmailDomain: data.allowedEmailDomain,
          firmFolderId: data.firmFolderId,
          connectorId: data.connectorId,
          sandboxOnly: data.sandboxOnly ?? false,
          anchorFirmId: billingAnchorId,
          createdBy: data.userId,
          updatedBy: data.userId,
        },
      })

      if (data.connectorId) {
        await tx.connector.update({
          where: { id: data.connectorId },
          data: { firmId: created.id },
        })
      }

      await tx.firmMember.create({
        data: {
          userId: data.userId,
          firmId: created.id,
          role: 'firm_admin',
          membershipType: 'internal',
          isDefault: false,
          createdBy: data.userId,
          updatedBy: data.userId,
        },
      })

      return tx.firm.findUnique({
        where: { id: created.id },
        include: { members: true },
      })
    })

    return this.mapToInterface(firm)
  }

  static async createOrGetFirm(user: User): Promise<FirmWithMembers> {
    const existingMembership = await (prisma as any).firmMember.findFirst({
      where: { userId: user.id, isDefault: true },
      include: { firm: { include: { members: true } } },
    })

    if (existingMembership) {
      return this.mapToInterface(existingMembership.firm)
    }

    const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.email!.split('@')[0]
    const lastName = user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || ''

    return this.createFirmWithMember({
      userId: user.id,
      email: user.email!,
      firstName,
      lastName,
      firmName: `${firstName}'s Firm`,
    })
  }

  static async getUserFirms(userId: string): Promise<FirmWithMembers[]> {
    const memberships = await (prisma as any).firmMember.findMany({
      where: { userId },
      include: { firm: { include: { members: true } } },
      orderBy: { firm: { createdAt: 'asc' } },
    })

    return memberships.map((m: any) => this.mapToInterface(m.firm))
  }

  static async getDefaultFirm(userId: string): Promise<FirmWithMembers | null> {
    const records = await (prisma as any).firmMember.findMany({
      where: { userId, isDefault: true },
      include: { firm: { include: { members: true } } },
    })
    if (records.length > 0) return this.mapToInterface(records[0].firm)
    return null
  }

  static async getFirmById(firmId: string, userId?: string): Promise<FirmWithMembers | null> {
    const firm = await (prisma as any).firm.findUnique({
      where: { id: firmId },
      include: { members: true },
    })
    if (!firm) return null
    if (userId) {
      const isMember = firm.members.some((m: any) => m.userId === userId)
      if (!isMember) return null
    }
    return this.mapToInterface(firm)
  }

  static async setDefaultFirm(userId: string, firmId: string): Promise<void> {
    logger.info('Setting default firm', { userId, firmId })

    const [unsetCount, setResults] = await prisma.$transaction([
      (prisma as any).firmMember.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      }),
      (prisma as any).firmMember.updateMany({
        where: { firmId, userId },
        data: { isDefault: true },
      }),
    ])

    if (setResults.count === 0) {
      logger.warn('Failed to set default firm: membership record not found', { userId, firmId })
    } else {
      logger.info('Successfully set default firm', { userId, firmId, unsetCount: unsetCount.count })
    }
  }

  static async updateFirm(firmId: string, userId: string, data: any): Promise<FirmWithMembers> {
    const membership = await (prisma as any).firmMember.findFirst({ where: { firmId, userId } })
    if (!membership) throw new Error('You do not have access to this firm')
    if (membership.role !== 'firm_admin') throw new Error('Only firm admins can update firm settings')

    const updateData: any = {}
    if (data.name) updateData.name = data.name
    if (data.settings !== undefined) updateData.settings = data.settings

    const firm = await (prisma as any).firm.update({
      where: { id: firmId },
      data: updateData,
      include: { members: true },
    })

    return this.mapToInterface(firm)
  }

  static async deleteFirm(firmId: string, userId: string): Promise<void> {
    const membership = await (prisma as any).firmMember.findFirst({ where: { firmId, userId } })
    if (!membership) throw new Error('You do not have access to this firm')
    if (membership.role !== 'firm_admin') throw new Error('Only firm admins can delete a firm')

    await (prisma as any).firm.delete({ where: { id: firmId } })
  }

  static async generateUniqueSlug(name: string): Promise<string> {
    const { generateFirmSlug } = await import('@/lib/slug-utils')
    return generateFirmSlug(name)
  }
}

