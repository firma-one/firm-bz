import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FirmRole, MembershipType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'
import { generateFirmSlug } from '@/lib/slug-utils'
import { logger } from '@/lib/logger'

/**
 * POST /api/provision
 * 
 * Idempotent provisioning endpoint.
 * 1. Validates Supabase Token
 * 
 * Idempotent provisioning endpoint.
 * 1. Checks if user has an existing Organization
 * 2. IF NOT: Creates Default Org with explicit name
 * 3. Returns the slug to redirect to.
 */
export async function POST(request: NextRequest) {
    let userId: string | undefined

    try {
        const body = await request.json().catch(() => ({}))
        const {
            organizationName,
            allowDomainAccess,
            allowedEmailDomain
        } = body as {
            organizationName?: string
            allowDomainAccess?: boolean
            allowedEmailDomain?: string | null
        }
        // 1. Get Auth Token from Header
        const authHeader = request.headers.get('Authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
        }
        const token = authHeader.replace('Bearer ', '').trim()
        if (!token || token === 'undefined') {
            return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 })
        }

        // 2. Validate User with Supabase (service role client, same as /api/organization)
        const supabase = createClient(
            config.supabase.url,
            config.supabase.serviceRoleKey!
        )
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user || !user.email) {
            if (authError) logger.error('Provisioning Auth Error:', authError as Error)
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        userId = user.id
        const userEmail = user.email
        const userName = user.user_metadata?.full_name || userEmail.split('@')[0]

        // 3. Check for existing Organization Membership
        // We look for the "Default" org first, or any org
        const existingMembership = await prisma.firmMember.findFirst({
            where: { userId: userId },
            include: { firm: true },
            orderBy: { isDefault: 'desc' }, // Prefer default marked firms
        })

        if (existingMembership) {
            logger.debug(`User ${userId} already has firm: ${existingMembership.firm.slug}`)
            return NextResponse.json({
                slug: existingMembership.firm.slug,
                type: 'existing'
            })
        }

        logger.debug(`Provisioning new organization for user ${userId}`)

        // 4. Create Default Hierarchy via Transaction

        if (!organizationName) {
            return NextResponse.json({ error: 'Onboarding Required', code: 'NO_ORG_NAME' }, { status: 400 })
        }

        const crypto = require('crypto')
        const newOrgId = crypto.randomUUID()
        // Slug generation is now handled inside OrganizationService logic implicitly? 
        // No, we are creating manually here transactions.
        // We need to generate the slug manually here using the new logic.
        // Or better, let's replicate the name-suffix logic here for consistency.

        const slug = await generateFirmSlug(organizationName)

        const domainNormalized =
            allowDomainAccess && allowedEmailDomain
                ? String(allowedEmailDomain).toLowerCase().trim() || null
                : null

        const { newOrg } = await prisma.$transaction(async (tx) => {
            const group = await tx.group.create({
                data: {
                    name: organizationName,
                    createdBy: userId!,
                },
            })

            await tx.groupMember.create({
                data: {
                    groupId: group.id,
                    userId: userId!,
                    role: 'GROUP_ADMIN',
                },
            })

            const firm = await tx.firm.create({
                data: {
                    id: newOrgId,
                    name: organizationName,
                    slug: slug,
                    allowDomainAccess: allowDomainAccess === true,
                    allowedEmailDomain: domainNormalized,
                    settings: {},
                    groupId: group.id,
                },
            })

            await tx.firmMember.create({
                data: {
                    userId: userId!,
                    firmId: firm.id,
                    role: FirmRole.firm_admin,
                    membershipType: MembershipType.internal,
                    isDefault: true,
                },
            })

            // 4c. Auto-creation of Client/Engagement DISABLED
            // The firm will be created but empty.

            return { newOrg: firm }
        })

        logger.debug(`Created new org: ${newOrg.slug} (${newOrg.id})`)

        return NextResponse.json({
            slug: newOrg.slug,
            type: 'created'
        })

    } catch (error: any) {
        logger.error('Provisioning Error:', error)

        // Handle Race Condition (P2002: Unique constraint failed)
        // If another request created the default org in parallel, just fetch it.
        if (error.code === 'P2002' && userId) {
            logger.debug('Race condition detected, fetching existing default org...')
            const existingMembership = await prisma.firmMember.findFirst({
                where: { userId: userId },
                include: { firm: true },
                orderBy: { isDefault: 'desc' },
            })

            if (existingMembership) {
                return NextResponse.json({
                    slug: existingMembership.firm.slug,
                    type: 'existing',
                })
            }
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
