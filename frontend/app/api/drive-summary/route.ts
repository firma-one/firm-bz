import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from "@/lib/prisma"
import { googleDriveConnector } from "@/lib/google-drive-connector"
import { logger } from '@/lib/logger'

const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
    try {
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

        // 2. Get user's default firm
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
                stale: 0,
                large: 0,
                sensitive: 0,
                risky: 0
            })
        }

        const driveConnector = membership.firm.connector

        if (!driveConnector) {
            return NextResponse.json({
                stale: 0,
                large: 0,
                sensitive: 0,
                risky: 0
            })
        }

        // 3. Fetch comprehensive file samples from the connector
        try {
            // Fetch multiple types of files to get a comprehensive sample
            // Increased limits to ensure better coverage (aiming for > 500 total)
            const [recent, trending, shared, sharedByMe, stale, nonNative] = await Promise.all([
                googleDriveConnector.getMostRecentFiles(driveConnector.id, 150, '1y', undefined, driveConnector.name ?? undefined),
                googleDriveConnector.getMostActiveFiles(driveConnector.id, 100, '1y'),
                googleDriveConnector.getSharedFiles(driveConnector.id, 100),
                googleDriveConnector.getSharedByMeFiles(driveConnector.id, 100),
                googleDriveConnector.getStaleFiles(driveConnector.id, 100),
                // Fetch non-native files (PDFs, images, videos etc.) which have real byte sizes
                googleDriveConnector.getNonNativeFiles(driveConnector.id, 500),
            ])

            const allFiles = [...recent, ...trending, ...shared, ...sharedByMe, ...stale, ...nonNative]

            // Deduplicate by ID
            const uniqueFilesMap = new Map()
            allFiles.forEach(file => {
                if (file.id && !uniqueFilesMap.has(file.id)) {
                    uniqueFilesMap.set(file.id, file)
                }
            })

            const uniqueFiles = Array.from(uniqueFilesMap.values())

            // Calculate metrics
            const sixMonthsAgo = new Date()
            sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180)

            const staleCount = uniqueFiles.filter(f => {
                // Exclude folders from Stale Documents view/counts
                if (f.mimeType === 'application/vnd.google-apps.folder') return false
                const lastAccessed = f.viewedByMeTime || f.modifiedTime
                return lastAccessed && new Date(lastAccessed) < sixMonthsAgo
            }).length

            const largeFileThreshold = 500 * 1024 * 1024 // 500MB
            const largeFilesCount = uniqueFiles.filter(f => {
                if (!f.size) return false
                // Google Drive API returns size as a string, so we need to parse it
                const sizeNum = typeof f.size === 'string' ? parseInt(f.size, 10) : f.size
                return !isNaN(sizeNum) && sizeNum > largeFileThreshold
            }).length

            // Debug logging
            const filesWithSize = uniqueFiles.filter(f => f.size && (typeof f.size === 'number' || typeof f.size === 'string'))
            const folders = uniqueFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
            const filesOnly = uniqueFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')

            logger.debug(`[Summary Metrics] Total unique files: ${uniqueFiles.length}`)
            logger.debug(`[Summary Metrics] Folders: ${folders.length}`)
            logger.debug(`[Summary Metrics] Files (non-folders): ${filesOnly.length}`)
            logger.debug(`[Summary Metrics] Files with size data: ${filesWithSize.length}`)
            logger.debug(`[Summary Metrics] Large files (>500MB): ${largeFilesCount}`)

            if (filesWithSize.length > 0) {
                const sizes = filesWithSize.map(f => {
                    const sizeNum = typeof f.size === 'string' ? parseInt(f.size, 10) : f.size
                    return {
                        name: f.name,
                        size: f.size,
                        sizeNum,
                        sizeMB: Math.round(sizeNum / (1024 * 1024))
                    }
                }).sort((a, b) => b.sizeNum - a.sizeNum).slice(0, 10)
                logger.debug(`[Summary Metrics] Top 10 largest files:`, JSON.stringify(sizes))
            }

            // Sample a few files to see their structure
            if (uniqueFiles.length > 0) {
                logger.debug(`[Summary Metrics] Sample file structure:`, JSON.stringify(uniqueFiles.slice(0, 3).map(f => ({
                    name: f.name,
                    mimeType: f.mimeType,
                    size: f.size,
                    hasSize: !!f.size
                }))))
            }

            // Count files with SENSITIVE badges as sensitive content
            const sensitiveCount = uniqueFiles.filter(f =>
                f.badges?.some((b: any) => b.type === 'sensitive')
            ).length

            // Count files with RISK badges as risky shares
            const riskySharesCount = uniqueFiles.filter(f =>
                f.badges?.some((b: any) => b.type === 'risk')
            ).length

            // Storage type breakdown — aggregate uniqueFiles by mimeType category and sum sizes
            const MIME_CATEGORIES: { label: string; test: (m: string) => boolean }[] = [
                { label: 'Documents', test: (m) => m.includes('document') || m.includes('pdf') || m.includes('word') || m.includes('text') || m.includes('presentation') || m.includes('slides') },
                { label: 'Spreadsheets', test: (m) => m.includes('spreadsheet') || m.includes('excel') || m.includes('csv') },
                { label: 'Images', test: (m) => m.startsWith('image/') },
                { label: 'Videos', test: (m) => m.startsWith('video/') },
                { label: 'Audio', test: (m) => m.startsWith('audio/') },
            ]

            const typeBytes: Record<string, number> = {}
            for (const file of uniqueFiles) {
                if (!file.mimeType || file.mimeType === 'application/vnd.google-apps.folder') continue
                const sizeNum = file.quotaBytesUsed
                  ? parseInt(String(file.quotaBytesUsed), 10)
                  : file.size
                    ? (typeof file.size === 'string' ? parseInt(file.size, 10) : Number(file.size))
                    : 0
                if (!sizeNum || isNaN(sizeNum)) continue
                const cat = MIME_CATEGORIES.find(c => c.test(file.mimeType))
                const label = cat?.label ?? 'Other'
                typeBytes[label] = (typeBytes[label] ?? 0) + sizeNum
            }
            const storageByType: { label: string; bytes: number }[] = Object.entries(typeBytes).map(([label, bytes]) => ({ label, bytes }))

            // Count shared files with permissions expiring within 7 days
            const in7Days = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
            let expiringLinksCount = 0
            try {
                const allSharedFiles = [...shared, ...sharedByMe]
                for (const file of allSharedFiles) {
                    if (!file.permissions) continue
                    const hasExpiring = (file.permissions as any[]).some((p: any) => p.expirationTime && p.expirationTime < in7Days)
                    if (hasExpiring) expiringLinksCount++
                }
            } catch {}

            // Fetch real quota from Drive
            let quotaData: { limit: number; used: number; usageInDrive: number; usageInDriveTrash: number } | null = null // usageInDriveTrash mapped from usageInTrash
            try {
                const q = await googleDriveConnector.getStorageQuota(driveConnector.id)
                if (q) {
                    const totalUsed = q.usage ? parseInt(q.usage) : 0
                    const driveUsed = q.usageInDrive ? parseInt(q.usageInDrive) : 0
                    const driveTrash = q.usageInTrash ? parseInt(q.usageInTrash) : 0
                    quotaData = {
                        limit: q.limit ? parseInt(q.limit) : 0,
                        used: totalUsed,
                        usageInDrive: driveUsed,
                        usageInDriveTrash: driveTrash,
                    }
                }
            } catch {}

            return NextResponse.json({
                stale: staleCount,
                large: largeFilesCount,
                sensitive: sensitiveCount,
                risky: riskySharesCount,
                totalSampled: uniqueFiles.length,
                storageByType,
                expiringLinksCount,
                quota: quotaData,
            })
        } catch (err) {
            logger.error(`Failed to fetch files for connector ${driveConnector.id}:`, err as Error)
            return NextResponse.json({ error: 'Failed to fetch summary metrics' }, { status: 500 })
        }

    } catch (error) {
        logger.error('Error fetching summary metrics:', error as Error)
        return NextResponse.json({ error: 'Failed to fetch summary metrics' }, { status: 500 })
    }
}
