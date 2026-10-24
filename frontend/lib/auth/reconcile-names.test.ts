import { describe, it, expect, vi } from 'vitest'
import { planNameReconciliation, reconcileUserNames } from './reconcile-names'

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

describe('planNameReconciliation', () => {
    it('re-asserts a typed name over what the provider just wrote', () => {
        expect(
            planNameReconciliation({
                first_name: 'Deepak',
                last_name: 'Firmaone',
                name_source: 'user',
                full_name: 'Deepak Shettigar',
                name: 'Deepak Shettigar',
            })
        ).toEqual({ full_name: 'Deepak Firmaone', name: 'Deepak Firmaone' })
    })

    it('does nothing when the keys already agree', () => {
        expect(
            planNameReconciliation({
                first_name: 'Sam',
                last_name: 'Reed',
                full_name: 'Sam Reed',
                name: 'Sam Reed',
            })
        ).toBeNull()
    })

    it('seeds the split pair from the provider when the user has typed nothing', () => {
        expect(planNameReconciliation({ full_name: 'Mary Jane Watson' })).toEqual({
            first_name: 'Mary',
            last_name: 'Jane Watson',
            name_source: 'provider',
        })
    })

    it('leaves an unnamed invitee alone so a later provider name can still seed them', () => {
        expect(planNameReconciliation({})).toBeNull()
    })

    it('protects an invite-seeded name the same way as a typed one', () => {
        expect(
            planNameReconciliation({
                first_name: 'Sam',
                last_name: 'Reed',
                name_source: 'invite',
                full_name: 'Samuel Reed-Jones',
            })
        ).toEqual({ full_name: 'Sam Reed', name: 'Sam Reed' })
    })
})

describe('reconcileUserNames', () => {
    const user = { id: 'u1', user_metadata: { full_name: 'Sam Reed' } }

    it('merges the patch onto the existing metadata', async () => {
        const updateUser = vi.fn(async () => ({ error: null }))
        await reconcileUserNames(user, { auth: { updateUser } })
        expect(updateUser).toHaveBeenCalledWith({
            data: {
                full_name: 'Sam Reed',
                first_name: 'Sam',
                last_name: 'Reed',
                name_source: 'provider',
            },
        })
    })

    it('skips the write entirely when there is nothing to change', async () => {
        const updateUser = vi.fn(async () => ({ error: null }))
        await reconcileUserNames({ id: 'u1', user_metadata: {} }, { auth: { updateUser } })
        expect(updateUser).not.toHaveBeenCalled()
    })

    it('never throws, so a failure cannot cost someone their signin', async () => {
        const updateUser = vi.fn(async () => {
            throw new Error('network down')
        })
        await expect(reconcileUserNames(user, { auth: { updateUser } })).resolves.toBeUndefined()
    })
})
