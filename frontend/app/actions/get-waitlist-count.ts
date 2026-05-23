'use server'

import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

interface WaitlistCount {
    total: number
    recentJoiners: Array<{
        email: string
        maskedEmail: string
        createdAt: Date
    }>
}

export async function getWaitlistCount(campaignId: string): Promise<ActionResponse<WaitlistCount>> {
    return serverActionWrapper(async () => {
        try {
            const total = await (prisma as any).waitlist.count({ where: { campaignId } })

            // Get 3 most recent joiners (for avatars/social proof)
            const recentJoiners = await (prisma as any).waitlist.findMany({
                where: { campaignId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                    email: true,
                    companyName: true,
                    createdAt: true,
                },
            })

            const formattedJoiners = recentJoiners.map((joiner: any) => {
                const emailParts = joiner.email.split('@')
                const maskedEmail = `${emailParts[0].substring(0, 3)}***@${emailParts[1] || '***'}`

                return {
                    email: joiner.email,
                    maskedEmail,
                    createdAt: joiner.createdAt,
                }
            })

            return {
                total,
                recentJoiners: formattedJoiners,
            }
        } catch (error) {
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
    }, 'getWaitlistCount')
}
