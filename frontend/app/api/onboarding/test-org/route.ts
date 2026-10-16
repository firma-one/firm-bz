import { NextRequest, NextResponse } from 'next/server'
import { getManageableConnector, isFirmAdmin } from '@/lib/connectors/connector-access'
import { logger } from '@/lib/logger'
import { createTestOrganization } from '@/lib/services/test-org-generator'
import { createGoogleDriveAdapter } from '@/lib/connectors/adapters/google-drive-adapter'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { invalidateUserSettingsPlus } from '@/lib/permissions/invalidate-user-settings'
import { ClientService } from '@/lib/services/client.service'
import { projectService } from '@/lib/services/project.service'

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

        const userId = user.id
        const body = await request.json()
        const { connectionId, firmId, organizationId } = body
        const resolvedFirmId = (firmId || organizationId) as string | undefined

        if (!connectionId || !resolvedFirmId) {
            return NextResponse.json({ error: 'Missing connectionId or firmId (or organizationId)' }, { status: 400 })
        }

        logger.info('Creating test data (V2)', { userId, connectionId, firmId: resolvedFirmId })

        // 1. Sample data goes into this firm and this connector's Drive: a firm admin of the firm,
        //    using a connector they manage. Any membership used to be enough, with any connector id.
        //    (.claude/plans/access-gates.md, P0 #6)
        if (!(await isFirmAdmin(userId, resolvedFirmId)) || !(await getManageableConnector(userId, connectionId))) {
            return NextResponse.json({ error: 'Firm not found or access denied' }, { status: 404 })
        }

        // 2. Create test folders in Drive
        const adapter = createGoogleDriveAdapter(async () => {
            const token = await googleDriveConnector.getAccessToken(connectionId)
            if (!token) throw new Error('Could not get access token')
            return token
        })

        const testOrgResult = await createTestOrganization(adapter, connectionId, 'root')

        // 3. Create sample Client (V2)
        const testClient = await ClientService.createClient({
            firmId: resolvedFirmId,
            name: 'Sample Client',
            creatorUserId: userId,
            sandboxOnly: true,
            settings: { driveFolderId: testOrgResult.clientFolderId }
        })

        // Sync folderId to Client column
        await (prisma as any).client.update({
            where: { id: testClient.id },
            data: { driveFolderId: testOrgResult.clientFolderId }
        })

        // 4. Create sample Projects (V2)
        const testProjects = await Promise.all(testOrgResult.projects.map(async (p) => {
            const { project } = await projectService.createProject(
                resolvedFirmId,
                testClient.id,
                p.name,
                userId,
                'Sample project created for sandbox testing.'
            )

            // Update project with folder ID and sandbox flag
            await prisma.engagement.update({
                where: { id: project.id },
                data: {
                    connectorRootFolderId: p.folderId,
                    sandboxOnly: true
                }
            })

            // Register subfolder IDs for UI discovery
            if (p.phaseFolderIds) {
                await googleDriveConnector.registerProjectFolderSettings(connectionId, project.slug, {
                    projectFolderId: p.folderId,
                    generalFolderId: p.phaseFolderIds['General'],
                    confidentialFolderId: p.phaseFolderIds['Confidential'],
                    stagingFolderId: p.phaseFolderIds['Staging']
                })
            }

            return project
        }))

        await invalidateUserSettingsPlus(userId)

        logger.info('Test data created (V2)', {
            clientId: testClient.id,
            projectIds: testProjects.map(p => p.id),
        })

        return NextResponse.json({
            success: true,
            clientId: testClient.id,
            projectIds: testProjects.map(p => p.id),
            orgName: testOrgResult.orgName,
            clientName: testOrgResult.clientName,
            orgFolderId: testOrgResult.orgFolderId,
            clientFolderId: testOrgResult.clientFolderId,
            projects: testOrgResult.projects,
            totalFiles: testOrgResult.totalFiles
        })
    } catch (error) {
        logger.error('Error creating test organization (V2)', error as Error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create test organization' },
            { status: 500 }
        )
    }
}
