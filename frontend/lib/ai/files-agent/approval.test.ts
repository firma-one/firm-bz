import { describe, it, expect, beforeAll } from 'vitest'
import { issueApprovalToken, verifyApprovalToken } from './approval'
import type { Proposal } from './tools'

beforeAll(() => {
    process.env.AI_AGENT_TOKEN_SECRET = 'test-secret-for-signing-only'
})

/** docId and path are display-only and absent from the canonical form — see the test below. */
const where = { docId: null, path: '' }

const batch: Proposal[] = [
    { kind: 'rename', externalId: 'f1', currentName: 'a.docx', proposedName: '01-A.docx', reason: 'r', ...where },
    { kind: 'rename', externalId: 'f2', currentName: 'b.docx', proposedName: '02-B.docx', reason: 'r', ...where },
    { kind: 'move', externalId: 'f3', fileName: 'c.docx', destinationFolderId: 'd1', destinationName: 'D', reason: 'r', ...where },
]

const ctx = { engagementId: 'eng-1', userId: 'user-1' }
const issue = (proposals = batch) => issueApprovalToken({ ...ctx, proposals })

describe('approval tokens', () => {
    it('accepts the batch it was issued for', () => {
        expect(verifyApprovalToken({ token: issue(), ...ctx, proposals: batch }))
            .toEqual({ ok: true })
    })

    /** Unticking a few items before applying is the normal case, not an attack. */
    it('accepts a subset of the signed batch', () => {
        expect(verifyApprovalToken({ token: issue(), ...ctx, proposals: [batch[0]] }))
            .toEqual({ ok: true })
    })

    /** The reason this exists: applying something the user never reviewed. */
    it('refuses a proposal that was not signed', () => {
        const smuggled: Proposal = {
            kind: 'rename', externalId: 'f9', currentName: 'x.docx',
            proposedName: 'owned.docx', reason: 'r', ...where,
        }
        expect(verifyApprovalToken({ token: issue(), ...ctx, proposals: [...batch, smuggled] }))
            .toEqual({ ok: false, reason: 'altered-batch' })
    })

    it('refuses a signed item whose effect was changed', () => {
        const altered: Proposal = { ...batch[0], proposedName: 'something-else.docx' } as Proposal
        expect(verifyApprovalToken({ token: issue(), ...ctx, proposals: [altered] }))
            .toEqual({ ok: false, reason: 'altered-batch' })
    })

    it('refuses an empty batch', () => {
        expect(verifyApprovalToken({ token: issue(), ...ctx, proposals: [] }).ok).toBe(false)
    })

    describe('binding', () => {
        it('refuses a token minted for another engagement', () => {
            expect(verifyApprovalToken({
                token: issue(), engagementId: 'eng-2', userId: 'user-1', proposals: batch,
            })).toEqual({ ok: false, reason: 'wrong-engagement' })
        })

        it('refuses a token minted for another user', () => {
            expect(verifyApprovalToken({
                token: issue(), engagementId: 'eng-1', userId: 'user-2', proposals: batch,
            })).toEqual({ ok: false, reason: 'wrong-user' })
        })
    })

    describe('tampering', () => {
        it('refuses an unsigned payload', () => {
            const forged = Buffer.from(JSON.stringify({
                jti: 'x', engagementId: 'eng-1', userId: 'user-1', digests: [], issuedAt: Date.now(),
            })).toString('base64url')
            expect(verifyApprovalToken({ token: `${forged}.nope`, ...ctx, proposals: batch }))
                .toEqual({ ok: false, reason: 'bad-signature' })
        })

        it('refuses malformed tokens without throwing', () => {
            for (const bad of ['', 'no-dot', 'a.b.c']) {
                expect(verifyApprovalToken({ token: bad, ...ctx, proposals: batch }).ok).toBe(false)
            }
        })
    })

    describe('single use', () => {
        it('refuses the same token twice', () => {
            const token = issue()
            expect(verifyApprovalToken({ token, ...ctx, proposals: batch }).ok).toBe(true)
            expect(verifyApprovalToken({ token, ...ctx, proposals: batch }))
                .toEqual({ ok: false, reason: 'already-used' })
        })

        /**
         * A token rejected for a fixable reason should not be burned — otherwise a user who
         * mis-clicks loses the batch they just paid to generate.
         */
        it('does not consume a token that failed verification', () => {
            const token = issue()
            expect(verifyApprovalToken({ token, engagementId: 'wrong', userId: 'user-1', proposals: batch }).ok)
                .toBe(false)
            expect(verifyApprovalToken({ token, ...ctx, proposals: batch }).ok).toBe(true)
        })
    })
})


describe('display fields do not affect the signature', () => {
    /**
     * `docId` and `path` exist so a question can say WHICH file it means. They describe the file,
     * not the change, so they are absent from the canonical form — otherwise re-rendering a
     * proposal with a resolved path would invalidate a token the user had already been issued.
     */
    it('verifies a proposal whose docId and path differ from the signed one', () => {
        const token = issue()
        const relabelled: Proposal[] = batch.map((p) => ({ ...p, docId: 'QSR-99', path: 'Internal/Working' }))
        expect(verifyApprovalToken({ ...ctx, token, proposals: relabelled }).ok).toBe(true)
    })

    /** The fields that DO determine the effect must still be covered. */
    it('still rejects an altered target name', () => {
        const token = issue()
        const altered: Proposal[] = [{ ...batch[0], proposedName: 'something-else.docx' } as Proposal]
        expect(verifyApprovalToken({ ...ctx, token, proposals: altered }).ok).toBe(false)
    })
})
