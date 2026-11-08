import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { asResult, GENERIC_ACTION_FAILURE, unwrapResult, userFacing } from './action-result'
import { storageFailure } from '@/lib/connectors/storage-failure'
import { ApiError } from '@/lib/errors/api-error'

describe('asResult', () => {
    it('answers the value', async () => {
        expect(await asResult('t', async () => 42)).toEqual({ ok: true, data: 42 })
    })

    it('passes words written for a person through, with their code', async () => {
        const r = await asResult('t', async () => { throw userFacing('A client with this name already exists', 'name_taken') })
        expect(r).toEqual({ ok: false, error: 'A client with this name already exists', code: 'name_taken' })
    })

    it("passes a storage failure's words through", async () => {
        const r = await asResult('t', async () => { throw storageFailure('locked', 'OneDrive') })
        expect(r).toMatchObject({ ok: false, code: 'locked' })
        expect(!r.ok && r.error).toMatch(/OneDrive has this locked/)
    })

    it('passes a client-side ApiError through but not a server one', async () => {
        expect(await asResult('t', async () => { throw new ApiError('Not allowed here', 403, 'forbidden') }))
            .toEqual({ ok: false, error: 'Not allowed here', code: 'forbidden' })
        expect(await asResult('t', async () => { throw new ApiError('db down', 500) }))
            .toEqual({ ok: false, error: GENERIC_ACTION_FAILURE, code: 'internal' })
    })

    it('never shows a plain error, which may be a raw Prisma or provider message', async () => {
        const r = await asResult('t', async () => { throw new Error('Invalid `prisma.client.create()` invocation') })
        expect(r).toEqual({ ok: false, error: GENERIC_ACTION_FAILURE, code: 'internal' })
    })

    it('lets a redirect through', async () => {
        const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/d;307;' })
        await expect(asResult('t', async () => { throw redirect })).rejects.toBe(redirect)
    })
})

describe('unwrapResult', () => {
    it('answers the value, or throws the words', () => {
        expect(unwrapResult({ ok: true, data: 'x' })).toBe('x')
        expect(() => unwrapResult({ ok: false, error: 'Name taken' })).toThrow('Name taken')
    })
})
