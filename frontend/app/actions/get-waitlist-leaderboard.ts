'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library'

interface LeaderboardEntry {
    rank: number
    email: string
    referralCount: number
    positionBoost: number
    plan: string
    createdAt: Date
    // Masked email for privacy (show only first 3 chars)
    maskedEmail: string
    upgradedToProPlus?: boolean
    points: number // Points based on referrals (30 points per referral)
    isCurrentUser?: boolean // Whether this is the current user's entry
}

interface LeaderboardData {
    entries: LeaderboardEntry[]
    totalCount: number
    userRank: number | null // Current user's rank (if on waitlist)
    userPoints: number // Current user's points
    userReferralCount: number // Current user's referral count
}

export async function getWaitlistLeaderboard(email?: string): Promise<ActionResponse<LeaderboardData>> {
    return serverActionWrapper(async () => {
        // Calculate points: 30 points per referral (as shown in reference)
        const POINTS_PER_REFERRAL = 30

        try {
            // Get all users - we'll sort in JavaScript since Prisma Client may need regeneration
            const allUsersRaw = await (prisma as any).waitlist.findMany({
                orderBy: [
                    { positionBoost: 'desc' },
                    { createdAt: 'asc' }
                ],
                select: {
                    id: true,
                    email: true,
                    companyName: true,
                    positionBoost: true,
                    referralCount: true,
                    createdAt: true
                }
            })

            // Sort by points (referrals * 30), then by createdAt for tie-breaking
            const allUsers = allUsersRaw.sort((a: any, b: any) => {
                // First sort by referral count (descending)
                if (b.referralCount !== a.referralCount) {
                    return b.referralCount - a.referralCount
                }
                // If tied, earlier signups rank higher (ascending createdAt)
                return a.createdAt.getTime() - b.createdAt.getTime()
            })

            // Get total waitlist count
            const totalCount = await (prisma as any).waitlist.count()

            // Calculate points and rank for all users
            const usersWithPoints = allUsers.map((user: any, index: number) => ({
                ...user,
                points: user.referralCount * POINTS_PER_REFERRAL,
                rank: index + 1,
            }))

            // Find user's entry
            let userEntry: typeof usersWithPoints[0] | null = null
            if (email) {
                const normalizedEmail = email.toLowerCase().trim()
                userEntry = usersWithPoints.find((u: any) => u.email.toLowerCase() === normalizedEmail) || null
            }

            // Get top 10, but include user if they're not in top 10
            const top10 = usersWithPoints.slice(0, 10)
            const entriesToShow = [...top10]

            // If user is not in top 10, add them at the end
            if (userEntry && !top10.find((e: any) => e.email.toLowerCase() === userEntry!.email.toLowerCase())) {
                entriesToShow.push(userEntry)
            }

            // Format leaderboard entries
            const entries: LeaderboardEntry[] = entriesToShow.map((entry: any) => {
                const emailParts = entry.email.split('@')
                const maskedEmail = `${emailParts[0].substring(0, 3)}***@${emailParts[1] || '***'}`
                const upgradedToProPlus = entry.referralCount >= 5
                const isCurrentUser = email ? entry.email.toLowerCase() === email.toLowerCase() : false

                return {
                    rank: entry.rank,
                    email: entry.email,
                    referralCount: entry.referralCount,
                    positionBoost: entry.positionBoost,
                    plan: upgradedToProPlus ? 'Pro Plus' : entry.plan,
                    createdAt: entry.createdAt,
                    maskedEmail,
                    upgradedToProPlus,
                    points: entry.points,
                    isCurrentUser,
                }
            })

            // Extract user's rank and details
            const userRank = userEntry ? userEntry.rank : null
            const userPoints = userEntry ? userEntry.points : 0
            const userReferralCount = userEntry ? userEntry.referralCount : 0

            return {
                entries,
                totalCount,
                userRank,
                userPoints,
                userReferralCount,
            }
        } catch (error) {
            // Handle Prisma validation errors (field doesn't exist - Prisma Client needs regeneration)
            if (error instanceof PrismaClientValidationError) {
                // This usually means Prisma Client is out of sync with schema
                // Return empty leaderboard gracefully
                console.error('Prisma validation error - Prisma Client may need regeneration:', error.message)
                return {
                    entries: [],
                    totalCount: 0,
                    userRank: null,
                    userPoints: 0,
                    userReferralCount: 0,
                }
            }

            // Handle database connection errors specifically
            if (error instanceof PrismaClientKnownRequestError) {
                // P1001 = Can't reach database server
                if (error.code === 'P1001') {
                    throw new Error('Unable to connect to database. Please try again in a moment.')
                }
                // P1002 = Database connection timeout
                if (error.code === 'P1002') {
                    throw new Error('Database connection timed out. Please try again.')
                }
                // P1003 = Database does not exist
                if (error.code === 'P1003') {
                    throw new Error('Database configuration error. Please contact support.')
                }
                // P2021 = Table does not exist
                // P2022 = Column does not exist
                if (error.code === 'P2021' || error.code === 'P2022') {
                    throw new Error('Database schema is out of sync. Please contact support.')
                }
            }
            // Re-throw to be handled by serverActionWrapper
            throw error
        }
    }, 'getWaitlistLeaderboard')
}
