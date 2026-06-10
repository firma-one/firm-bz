import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { projectService } from '@/lib/services/project.service'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { SampleFileService, DEFAULT_SAMPLE_FILES, SANDBOX_ENGAGEMENT_FOLDER_DATA } from '@/lib/services/sample-file-service-server'
import { createGoogleDriveAdapter } from '@/lib/connectors/adapters/google-drive-adapter'
import { safeInngestSend } from '@/lib/inngest/client'

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const supabase = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy'
        )
        const { data: { user } } = await supabase.auth.getUser(token)
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { firmId, organizationId, clientId, name, sandboxOnly } = body
        const resolvedFirmId = (firmId || organizationId) as string | undefined

        if (!resolvedFirmId || !clientId || !name?.trim()) {
            return NextResponse.json({ error: 'Missing firmId (or organizationId), clientId, or name' }, { status: 400 })
        }

        // Verify membership (V2)
        const membership = await (prisma as any).firmMember.findFirst({
            where: { userId: user.id, firmId: resolvedFirmId }
        })
        if (!membership) {
            return NextResponse.json({ error: 'Firm not found or access denied' }, { status: 403 })
        }

        // 1. Create Project via projectService (Platform Schema) - returns project + folderStructure (no duplicate ensureAppFolderStructure)
        const { project, folderStructure } = await projectService.createProject(
            resolvedFirmId,
            clientId,
            name.trim(),
            user.id,
            '', // No description for now
            !!sandboxOnly
        )

        // 2. Sample files + indexing (folder structure already created by projectService)
        try {
            const firm = await (prisma as any).firm.findUnique({
                where: { id: resolvedFirmId },
                select: { connectorId: true }
            })

            if (firm?.connectorId && folderStructure?.projectId) {
                const connectionId = firm.connectorId
                const adapter = await googleDriveConnector.createGoogleDriveAdapter(connectionId)

                // Trigger Indexing Scan (fire-and-forget)
                safeInngestSend('project.index.scan.requested', {
                    organizationId: resolvedFirmId,
                    projectId: project.id,
                    connectorId: connectionId,
                    rootFolderIds: [folderStructure.projectId],
                }).catch((indexError: Error) => logger.warn('Failed to trigger indexing scan', indexError))

                // Create sample files using folderStructure from projectService (no duplicate ensureAppFolderStructure)
                if (sandboxOnly && folderStructure) {
                    const subfoldersMap: Array<{ subName: string; subId: string | null }> = [
                        { subName: 'General', subId: folderStructure.generalFolderId || null },
                    ]

                    await Promise.all(
                        subfoldersMap
                            .filter(({ subId }) => !!subId)
                            .map(async ({ subName, subId }) => {
                                try {
                                    const structure = SANDBOX_ENGAGEMENT_FOLDER_DATA[name]?.[subName]
                                    if (structure) {
                                        await SampleFileService.createFolderStructure(adapter, connectionId, subId!, structure)
                                    } else if (DEFAULT_SAMPLE_FILES[subName]) {
                                        await SampleFileService.createSampleFiles(adapter, connectionId, subId!, DEFAULT_SAMPLE_FILES[subName])
                                    }
                                } catch (subError) {
                                    logger.error(`Failed to create sample structure for ${subName}`, subError as Error)
                                }
                            })
                    )
                }
            }
        } catch (error) {
            logger.error('Failed to create sample files for Project', error as Error)
        }
        // ------------------------------------

        logger.info('Project created during onboarding (V2)', { projectId: project.id, clientId, organizationId })

        // Invalidate cache
        await invalidateUserSettingsPlus(user.id)

        return NextResponse.json({
            success: true,
            projectId: project.id,
            projectSlug: project.slug,
            projectName: project.name
        })
    } catch (error) {
        logger.error('Error creating project during onboarding (V2)', error as Error)
        const msg = error instanceof Error ? error.message : 'Failed to create project'
        const isDbUnreachable = /can't reach database|P1001|connection refused|could not get access token/i.test(msg)
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
