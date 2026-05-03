'use server'

import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { TicketType } from '@prisma/client'
import { z } from 'zod'
import { generateTicketNumber } from '@/lib/system/ticket-number-generator'

// Schema for validation
const TicketSchema = z.object({
    description: z.string().min(1, "Description is required"),
    errorDetails: z.any().optional(),
    metadata: z.any().optional(),
    type: z.nativeEnum(TicketType).default(TicketType.BUG),
    // Optional Context Slugs
    firmSlug: z.string().optional(),
    // Legacy (backward compat)
    orgSlug: z.string().optional(),
    clientSlug: z.string().optional(),
    projectSlug: z.string().optional(),
})

export type SubmitTicketResult = {
    success: boolean
    message: string
}

export async function submitErrorTicket(input: z.infer<typeof TicketSchema>): Promise<SubmitTicketResult> {
    try {
        const data = TicketSchema.parse(input)

        // Get user session if available
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // Resolve context IDs if slugs provided
        let firmId: string | null = null
        let clientId: string | null = null
        let engagementId: string | null = null

        const resolvedFirmSlug = data.firmSlug || data.orgSlug
        if (resolvedFirmSlug) {
            try {
                const firm = await prisma.firm.findUnique({
                    where: { slug: resolvedFirmSlug },
                    select: { id: true }
                })
                firmId = firm?.id ?? null
                if (!firmId) {
                    console.warn(`[submitErrorTicket] Firm not found for slug: ${resolvedFirmSlug}`)
                }
            } catch (error) {
                console.error(`[submitErrorTicket] Error looking up firm: ${resolvedFirmSlug}`, error)
            }

            if (firmId && data.clientSlug) {
                const client = await prisma.client.findFirst({
                    where: { firmId, slug: data.clientSlug },
                    select: { id: true }
                })
                clientId = client?.id ?? null

                if (clientId && data.projectSlug) {
                    const engagement = await prisma.engagement.findFirst({
                        where: { clientId, slug: data.projectSlug },
                        select: { id: true }
                    })
                    engagementId = engagement?.id ?? null
                }
            }
        }

        // Generate ticket number
        const ticketNumber = await generateTicketNumber()

        // Create ticket
        await (prisma as any).customerRequest.create({
            data: {
                ticketNumber,
                type: data.type,
                description: data.description,
                errorDetails: data.errorDetails ?? {},
                metadata: data.metadata ?? {},
                userId: user?.id ?? null,
                userEmail: user?.email ?? null,
                firmId,
                clientId,
                engagementId,
            }
        })

        return { success: true, message: 'Ticket submitted successfully' }
    } catch (error) {
        console.error('Failed to submit ticket:', error)
        return { success: false, message: 'Failed to submit ticket' }
    }
}
