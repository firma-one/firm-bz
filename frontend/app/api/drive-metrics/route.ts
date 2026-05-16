import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from "@/lib/prisma"
import { ConnectorType } from "@prisma/client"
import { googleDriveConnector } from "@/lib/google-drive-connector"

const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const limitParam = searchParams.get('limit')
        const limit = limitParam ? parseInt(limitParam) : 10
        const safeLimit = Math.min(Math.max(limit, 1), 1000)

        // 1. Auth Check
        const authHeader = request.headers.get('authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
        }

        // 2. Get user's default firm via FirmMember
        const membership = await prisma.firmMember.findFirst({
            where: {
                userId: user.id,
                isDefault: true
            },
            include: {
                firm: {
                    include: {
                        connector: true
                    }
                }
            }
        })

        if (!membership || !membership.firm) {
            return NextResponse.json({
                isConnected: false,
                data: []
            })
        }

        const firm = membership.firm
        const driveConnector = firm.connector

        if (!driveConnector) {
            return NextResponse.json({
                isConnected: false,
                data: []
            })
        }

        const sortParam = searchParams.get('sort')
        const rangeParam = searchParams.get('range') || '7d' // Default to 7d
        const validRange = ['24h', '7d', '1w', '2w', '30d', '4w', '1y'].includes(rangeParam) ? rangeParam : '7d'
        const isAccessedSort = sortParam === 'accessed'

        // Get size range and time range parameters
        const sizeRangeParam = searchParams.get('sizeRange') as '0.5-1' | '1-5' | '5-10' | '10+' | null
        const timeRangeParam = searchParams.get('timeRange') as '4w' | 'all' | null
        const sizeRange = sizeRangeParam || '0.5-1'
        const timeRange = timeRangeParam || '4w'

        // 3. Fetch from the Google Drive connection
        let files: any[] = []
        try {
            if (sizeRangeParam) {
                files = await googleDriveConnector.getStorageFiles(driveConnector.id, safeLimit, sizeRange, timeRange)
            } else if (sortParam === 'storage') {
                files = await googleDriveConnector.getNonNativeFiles(driveConnector.id, safeLimit)
            } else if (sortParam === 'accessed') {
                files = await googleDriveConnector.getMostActiveFiles(driveConnector.id, safeLimit, validRange as any)
            } else if (sortParam === 'shared') {
                // Fetch both shared WITH me and shared BY me
                const [sharedWithMe, sharedByMe] = await Promise.all([
                    googleDriveConnector.getSharedFiles(driveConnector.id, safeLimit),
                    googleDriveConnector.getSharedByMeFiles(driveConnector.id, safeLimit)
                ])
                files = [...sharedWithMe, ...sharedByMe]
            } else {
                files = await googleDriveConnector.getMostRecentFiles(driveConnector.id, safeLimit, validRange as any, undefined, driveConnector.name ?? undefined)
            }

            // Inject connector info into each file
            files = files.map((f: any) => ({
                ...f,
                source: driveConnector.name ?? driveConnector.id, // Use name as source identifier
                connectorId: driveConnector.id
            }))
        } catch (error) {
            console.error(`[Insights] Failed to fetch for connector ${driveConnector.id}:`, error)
            files = []
        }

        // Sort list
        // If sort=accessed, sort by viewedByMeTime
        // Otherwise sort by modifiedTime
        const sortedFiles = files
            .sort((a, b) => {
                if (isAccessedSort) {
                    const countA = a.activityCount || 0
                    const countB = b.activityCount || 0
                    if (countA !== countB) return countB - countA // Higher activity first

                    const timeA = a.viewedByMeTime ? new Date(a.viewedByMeTime).getTime() : 0
                    const timeB = b.viewedByMeTime ? new Date(b.viewedByMeTime).getTime() : 0
                    return timeB - timeA
                }
                return new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
            })
            .slice(0, safeLimit)

        // 4. Fetch Storage Quota from Google Drive connection
        let totalLimit = 0
        let totalUsed = 0
        const accounts: { id: string, email: string, limit: number, used: number, usageInDrive?: number, usageInDriveTrash?: number }[] = []

        try {
            const quota = await googleDriveConnector.getStorageQuota(driveConnector.id)
            if (quota) {
                const accLimit = quota.limit ? parseInt(quota.limit) : 0
                const accUsed = quota.usage ? parseInt(quota.usage) : 0

                if (quota.limit) totalLimit += accLimit
                if (quota.usage) totalUsed += accUsed

                accounts.push({
                    id: driveConnector.id,
                    email: (driveConnector.settings as any)?.accountEmail || driveConnector.name || driveConnector.id,
                    limit: accLimit,
                    used: accUsed,
                    usageInDrive: quota.usageInDrive ? parseInt(quota.usageInDrive) : 0,
                    usageInDriveTrash: quota.usageInTrash ? parseInt(quota.usageInTrash) : 0,
                })
            }
        } catch (error) {
            console.error(`[Insights] Failed to fetch quota for connector ${driveConnector.id}:`, error)
        }

        return NextResponse.json({
            isConnected: true,
            data: sortedFiles,
            connectorEmail: (driveConnector.settings as any)?.accountEmail || driveConnector.name || driveConnector.id,
            storageUsage: {
                limit: totalLimit,
                used: totalUsed,
                accounts: accounts
            }
        })

    } catch (error) {
        console.error('Drive insights API error:', error)
        return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 })
    }
}
