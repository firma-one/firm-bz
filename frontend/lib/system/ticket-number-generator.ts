import { prisma } from '@/lib/prisma'

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function generateRandomAlphanumeric(length: number): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length))
  }
  return result
}

export async function generateTicketNumber(): Promise<string> {
  // Check if ticket number already exists (extremely rare, but handle race condition)
  let ticketNumber: string
  let attempts = 0
  const maxAttempts = 5

  while (attempts < maxAttempts) {
    ticketNumber = `TKT-${generateRandomAlphanumeric(6)}`

    const existing = await prisma.customerRequest.findUnique({
      where: { ticketNumber }
    })

    if (!existing) {
      return ticketNumber
    }
    attempts++
  }

  // Fallback (should never happen)
  throw new Error('Failed to generate unique ticket number after multiple attempts')
}
