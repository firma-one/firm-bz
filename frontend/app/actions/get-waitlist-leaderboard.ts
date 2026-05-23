'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library'

interface LeaderboardEntry {
    rank: number
    email: string
    referralCount: number
    plan: string
    createdAt: Date
    maskedEmail: string
    upgradedToPro?: boolean
    isCurrentUser?: boolean
}

interface LeaderboardData {
    entries: LeaderboardEntry[]
    totalCount: number
    userRank: number | null
    userReferralCount: number
}

export async function getWaitlistLeaderboard(campaignId: string, email?: string): Promise<ActionResponse<LeaderboardData>> {
    return serverActionWrapper(async () => {
        try {
            const allUsersRaw = await (prisma as any).waitlist.findMany({
                where: { campaignId },
                orderBy: [{ createdAt: 'asc' }],
                select: {
                    id: true,
                    email: true,
                    referralCount: true,
                    createdAt: true
                }
            })

            // Sort by referral count desc, then by signup date asc for tiebreak
            const allUsers = allUsersRaw.sort((a: any, b: any) => {
                if (b.referralCount !== a.referralCount) return b.referralCount - a.referralCount
                return a.createdAt.getTime() - b.createdAt.getTime()
            })

            const totalCount = await (prisma as any).waitlist.count({ where: { campaignId } })

            const rankedUsers = allUsers.map((user: any, index: number) => ({
                ...user,
                rank: index + 1,
            }))

            let userEntry: typeof rankedUsers[0] | null = null
            if (email) {
                const normalizedEmail = email.toLowerCase().trim()
                userEntry = rankedUsers.find((u: any) => u.email.toLowerCase() === normalizedEmail) || null
            }

            const top10 = rankedUsers.slice(0, 10)
            const entriesToShow = [...top10]

            if (userEntry && !top10.find((e: any) => e.email.toLowerCase() === userEntry!.email.toLowerCase())) {
                entriesToShow.push(userEntry)
            }

            const entries: LeaderboardEntry[] = entriesToShow.map((entry: any) => {
                const emailParts = entry.email.split('@')
                const maskedEmail = `${emailParts[0].substring(0, 3)}***@${emailParts[1] || '***'}`
                const upgradedToPro = entry.referralCount >= 5
                const isCurrentUser = email ? entry.email.toLowerCase() === email.toLowerCase() : false

                return {
                    rank: entry.rank,
                    email: entry.email,
                    referralCount: entry.referralCount,
                    plan: upgradedToPro ? 'Pro' : 'Standard',
                    createdAt: entry.createdAt,
                    maskedEmail,
                    upgradedToPro,
                    isCurrentUser,
                }
            })

            const userRank = userEntry ? userEntry.rank : null
            const userReferralCount = userEntry ? userEntry.referralCount : 0

            return {
                entries,
                totalCount,
                userRank,
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
