import { describe, it, expect } from 'vitest'
import { isAgentEmail, AGENT_EMAIL_DOMAIN } from './agent-email'

describe('isAgentEmail', () => {
    it('recognizes an agent address', () => {
        expect(isAgentEmail(`brio+abc123@${AGENT_EMAIL_DOMAIN}`)).toBe(true)
    })

    it('rejects a real user', () => {
        expect(isAgentEmail('deepak@firma.bz')).toBe(false)
    })

    /**
     * The check is a suffix match, so an address merely CONTAINING the domain must not pass —
     * otherwise an attacker-chosen address could be treated as an agent and filtered out of
     * notifications they were entitled to.
     */
    it('does not match the domain appearing elsewhere in the address', () => {
        expect(isAgentEmail(`someone@${AGENT_EMAIL_DOMAIN}.example.com`)).toBe(false)
        expect(isAgentEmail(`${AGENT_EMAIL_DOMAIN}@example.com`)).toBe(false)
    })

    /** A lookalike domain must not pass: the separator has to be the @ sign. */
    it('requires the at-sign boundary', () => {
        expect(isAgentEmail(`evil-${AGENT_EMAIL_DOMAIN}`)).toBe(false)
    })

    it('handles absent values', () => {
        for (const v of [null, undefined, '']) {
            expect(isAgentEmail(v as string | null | undefined)).toBe(false)
        }
    })
})
