import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { serverActionWrapper, userFacingMessage } from './server-action-wrapper'

const unreachable = () =>
    new Prisma.PrismaClientKnownRequestError(
        "Invalid `prisma.$queryRaw()` invocation:\n\nCan't reach database server at `127.0.0.1:54322`",
        { code: 'P1001', clientVersion: '6.19.3', meta: { database_location: '127.0.0.1:54322' } },
    )

describe('userFacingMessage', () => {
    it('keeps a message an action threw for people', () => {
        expect(userFacingMessage(new Error('Captcha validation failed. Please try again.')))
            .toBe('Captcha validation failed. Please try again.')
    })

    it('replaces an unreachable database with a plain retry message', () => {
        const message = userFacingMessage(unreachable())
        expect(message).toBe('We couldn’t reach our servers just now. Please try again in a moment.')
        expect(message).not.toMatch(/prisma|127\.0\.0\.1|54322/i)
    })

    it('treats a failed connection at startup the same way', () => {
        const error = new Prisma.PrismaClientInitializationError("Can't reach database server", '6.19.3', 'P1001')
        expect(userFacingMessage(error)).toBe('We couldn’t reach our servers just now. Please try again in a moment.')
    })

    it('hides any other database error behind a generic message', () => {
        const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`slug`)', {
            code: 'P2002',
            clientVersion: '6.19.3',
        })
        expect(userFacingMessage(error)).toBe('Something went wrong on our side. Please try again.')
    })

    it('falls back for something that is not an Error', () => {
        expect(userFacingMessage('boom')).toBe('An unexpected error occurred')
    })
})

describe('serverActionWrapper', () => {
    it('never returns the database error text to the caller', async () => {
        const result = await serverActionWrapper(async () => {
            throw unreachable()
        }, 'checkEmailExists')
        expect(result.success).toBe(false)
        expect(result.error).toBe('We couldn’t reach our servers just now. Please try again in a moment.')
    })
})
