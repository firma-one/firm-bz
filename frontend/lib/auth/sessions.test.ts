// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { executeRaw, logger } = vi.hoisted(() => ({
    executeRaw: vi.fn(),
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ basePrisma: { $executeRaw: executeRaw } }))
vi.mock('@/lib/logger', () => ({ logger }))

import { endAllSessions, endUserSessions } from './sessions'

/** The SQL a tagged-template call ran, with its parameters in place of the placeholders. */
const sqlOf = (call: unknown[]) => {
    const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]]
    return strings.reduce((sql, part, i) => sql + part + (i < values.length ? `<${values[i]}>` : ''), '')
}

beforeEach(() => {
    executeRaw.mockReset()
    Object.values(logger).forEach((fn) => fn.mockReset())
})

describe('endUserSessions', () => {
    it("deletes that user's sessions (refresh tokens cascade) and says how many", async () => {
        executeRaw.mockResolvedValue(3)
        await expect(endUserSessions('u-1')).resolves.toBe(3)
        expect(sqlOf(executeRaw.mock.calls[0])).toBe('DELETE FROM auth.sessions WHERE user_id = <u-1>::uuid')
    })

    it('a failure is logged and thrown, never swallowed', async () => {
        executeRaw.mockRejectedValue(new Error('permission denied for table sessions'))
        await expect(endUserSessions('u-1')).rejects.toThrow('permission denied')
        expect(logger.error).toHaveBeenCalled()
    })
})

describe('endAllSessions', () => {
    it("deletes everyone's sessions but the admin's own", async () => {
        executeRaw.mockResolvedValue(12)
        await expect(endAllSessions({ exceptUserId: 'admin-1' })).resolves.toBe(12)
        expect(sqlOf(executeRaw.mock.calls[0])).toBe('DELETE FROM auth.sessions WHERE user_id <> <admin-1>::uuid')
        expect(logger.warn).toHaveBeenCalled()
    })
})
