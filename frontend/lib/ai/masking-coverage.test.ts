import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Every Brio call masks what it sends (§14 item 5). The compiler already makes each call pass a masking
 * choice (`getGuardedAnthropic(scope, { vault })`, `completeText({ vault })`); this makes sure none of
 * them chooses nothing. A call's vault must come from lib/ai/known-entities.ts (or be handed down from a
 * caller that got one there), never a literal `null`. The one null a vault can be is the firm's own switch.
 */

const ROOT = path.resolve(__dirname, '..', '..')

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name)
        if (name === 'node_modules' || name.startsWith('.')) return []
        if (statSync(full).isDirectory()) return sourceFiles(full)
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
    })
}

/** The text of each call to `fn` in `source`, from its name to its closing parenthesis. */
function callsOf(source: string, fn: string): string[] {
    const calls: string[] = []
    let from = 0
    for (;;) {
        const at = source.indexOf(`${fn}(`, from)
        if (at < 0) return calls
        from = at + fn.length
        // Not the definition itself.
        if (/(function|async function)\s+$/.test(source.slice(Math.max(0, at - 20), at))) continue
        let depth = 0
        let end = at + fn.length
        for (; end < source.length; end++) {
            const c = source[end]
            if (c === '(') depth++
            else if (c === ')' && --depth === 0) break
        }
        calls.push(source.slice(at, end + 1))
    }
}

const files = [...sourceFiles(path.join(ROOT, 'lib')), ...sourceFiles(path.join(ROOT, 'app'))]
const calls = files.flatMap((file) => {
    const source = readFileSync(file, 'utf-8')
    return [...callsOf(source, 'getGuardedAnthropic'), ...callsOf(source, 'completeText')]
        .map((call) => ({ file: path.relative(ROOT, file), call }))
})

describe('every Brio call masks what it sends', () => {
    it('finds the calls it checks: every surface that reaches the model', () => {
        // Engagement chat, firm chat, Reviewer chat, summary, status update, nudge, reply, notes, RAID,
        // Files agent, search, Home's brief, the Firm brief (streamed and not), the engagement summary.
        expect(calls.length).toBeGreaterThanOrEqual(15)
    })

    it('each passes a vault, and none a literal null', () => {
        const unmasked = calls.filter(({ call }) => !/vault|masking/.test(call) || /vault:\s*null/.test(call))
        expect(unmasked.map(({ file }) => file)).toEqual([])
    })

    it('each vault comes from the known names (lib/ai/known-entities.ts), or from a caller that got it there', () => {
        const loose = calls.filter(({ call }) => !/vaultForEngagement|vaultForFirms|params\.vault|meta\.vault|masking|vault\b,|vault\s*}|vault,\s*$/m.test(call))
        expect(loose.map(({ file }) => file)).toEqual([])
    })
})
