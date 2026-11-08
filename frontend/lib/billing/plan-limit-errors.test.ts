import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Plan limits are words for people, so they're thrown as `userFacing(…, 'plan_limit')` and pass
 * through `asResult` (lib/actions/action-result.ts) to the browser. A plain `Error` would reach a
 * production browser as "Minified React error #441". Guard: no plain throw of a plan-limit message.
 */
describe('plan limit throws', () => {
    it('are all userFacing, with a code', () => {
        const src = readFileSync(join(__dirname, 'effective-billing-caps.ts'), 'utf8')
        expect(src).not.toMatch(/throw new Error\(\s*`Your plan allows/)
        expect(src.match(/throw userFacing\(\s*`Your plan allows/g)?.length).toBe(6)
        expect(src.match(/'plan_limit'/g)?.length).toBe(6)
        const gate = readFileSync(join(__dirname, 'firm-creation-gate.ts'), 'utf8')
        expect(gate).toMatch(/throw userFacing\('Upgrade to Standard[^']*', 'upgrade_required'\)/)
    })
})
