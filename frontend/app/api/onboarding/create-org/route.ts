import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createClient } from '@supabase/supabase-js'
import { FirmService } from '@/lib/firm-service'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { createAdminClient } from '@/utils/supabase/admin'
import {
    requireNonSandboxFirmCreationAccess,
    resolveBillingAnchorForNewSatelliteFirm,
} from '@/lib/billing/firm-creation-gate'
import { ensurePolarFreePlanForSandboxFirm } from '@/lib/billing/polar-free-plan'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy'
        )
        const { data: { user } } = await supabase.auth.getUser(token)
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = user.id
        const body = await request.json()
        const { connectionId, name, sandboxOnly, allowDomainAccess } = body

        let billingAnchorId: string | null = null
        if (!sandboxOnly) {
            try {
                await requireNonSandboxFirmCreationAccess(userId)
            } catch (gateError) {
                return NextResponse.json(
                    { error: gateError instanceof Error ? gateError.message : 'Upgrade required' },
                    { status: 402 }
                )
            }
            billingAnchorId = await resolveBillingAnchorForNewSatelliteFirm(userId)
            if (!billingAnchorId) {
                return NextResponse.json(
                    { error: 'Could not attach this workspace to your subscription. Please try again.' },
                    { status: 500 }
                )
            }
        }

        if (!connectionId) {
            return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
        }

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Missing organization name' }, { status: 400 })
        }

        logger.info('Creating firm (V2)', {
            userId,
            connectionId,
            newFirmName: name,
            sandboxOnly: !!sandboxOnly
        })

        // 1. Initial creation via FirmService (Platform Schema)
        const firm = await FirmService.createFirmWithMember({
            userId,
            email: user.email || '',
            firstName: user.user_metadata?.first_name || '',
            lastName: user.user_metadata?.last_name || '',
            firmName: name.trim(),
            connectorId: connectionId,
            allowDomainAccess: sandboxOnly ? false : (allowDomainAccess ?? true),
            sandboxOnly: !!sandboxOnly,
            anchorFirmId: billingAnchorId ?? undefined,
        })

        // Persist onboarding progress on firm.settings (firm-first onboarding source of truth).
        await prisma.firm.update({
            where: { id: firm.id },
            data: {
                settings: {
                    ...(firm.settings as Record<string, unknown> ?? {}),
                    onboarding: {
                        currentStep: 3,
                        isComplete: !sandboxOnly,
                        driveConnected: true,
                        stage: sandboxOnly ? 'sandbox_created' : 'workspace_created',
                        lastUpdated: new Date().toISOString(),
                    },
                },
            },
        })

        // 2. Update connector with onboarding progress (fetch once, reuse below for Drive setup)
        let connector: { status: string; settings: unknown } | null = null
        if (connectionId) {
            connector = await (prisma as any).connector.findUnique({ where: { id: connectionId } })
            if (connector) {
                const currentSettings = (connector.settings as any) || {}
                await (prisma as any).connector.update({
                    where: { id: connectionId },
                    data: {
                        settings: {
                            ...currentSettings,
                            onboarding: {
                                currentStep: 3,
                                isComplete: !sandboxOnly,
                                driveConnected: true,
                                testOrgCreated: !!sandboxOnly,
                                orgsImported: [],
                                defaultOrgSlug: '',
                                lastUpdated: new Date().toISOString()
                            }
                        }
                    }
                })
            }
        }

        // 3. Google Drive folder creation + set default firm in parallel where possible
        let finalFirmFolderId: string | null = null

        // Drive setup (must happen before JWT so orgFolderId is available)
        if (connectionId && connector && connector.status === 'ACTIVE') {
            try {
                // Never use Drive pseudo-parent `root` — firm folders belong under `_firma_workspace_…`.
                const driveRootFolderId = await googleDriveConnector.resolveWorkspaceRootFolderId(connectionId)

                logger.info('Setting up Firm folder using unified service', {
                    firmName: firm.name,
                    rootFolderId: driveRootFolderId
                })

                const setupResult = await googleDriveConnector.setupOrgFolder(
                    connectionId,
                    driveRootFolderId,
                    firm.id,
                    userId
                )

                finalFirmFolderId = setupResult.orgId
                logger.info('Unified Drive setup complete', { firmFolderId: finalFirmFolderId })
            } catch (driveError) {
                logger.error('Failed to setup Drive folder structure', driveError as Error)
                // Drive folder creation is required for all org types — sandbox and custom alike.
                // A Sandbox org without Drive folders is just as broken as a custom org without them.
                return NextResponse.json(
                    { error: 'Failed to create Google Drive folder structure. Please check your Drive connection and try again.' },
                    { status: 500 }
                )
            }
        }

        // 4+5. Set default firm (Sandbox/Import/Custom - later steps override) + JWT update + cache invalidation in parallel
        const adminClient = createAdminClient()
        await Promise.all([
            FirmService.setDefaultFirm(userId, firm.id),
            adminClient.auth.admin.updateUserById(userId, {
                user_metadata: {
                    ...user.user_metadata,
                },
                app_metadata: mergeLeanAppMetadata(user.app_metadata as Record<string, unknown>, {
                    active_firm_id: firm.id,
                    active_firm_slug: firm.slug,
                    active_persona: 'firm_admin',
                }),
            }).then(() => {
                logger.info('JWT metadata injected during onboarding (create-org)', { userId, firmId: firm.id })
            }).catch((jwtError: Error) => {
                logger.error('Failed to inject JWT metadata during onboarding (create-org)', jwtError)
            }),
            invalidateUserSettingsPlus(userId),
        ])

        if (sandboxOnly) {
            const customerName =
                [user.user_metadata?.first_name, user.user_metadata?.last_name]
                    .map((s) => (typeof s === 'string' ? s.trim() : ''))
                    .filter(Boolean)
                    .join(' ')
                    .trim() || null
            await ensurePolarFreePlanForSandboxFirm({
                firmId: firm.id,
                userEmail: user.email || '',
                customerName,
                userId,
            })
        }

        return NextResponse.json({
            success: true,
            firmId: firm.id,
            firmSlug: firm.slug,
            firmName: firm.name,
            firmFolderId: finalFirmFolderId
        })
    } catch (error) {
        logger.error('Error creating firm (V2)', error as Error)
        const msg = error instanceof Error ? error.message : 'Failed to create firm'
        const isDbUnreachable = /can't reach database|P1001|connection refused/i.test(msg)
        return NextResponse.json(
            {
                error: isDbUnreachable
                    ? 'Database is unreachable. For local dev, run supabase start and ensure DATABASE_URL is set.'
                    : msg
            },
            { status: 500 }
        )
    }
}
