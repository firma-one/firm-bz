import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Every export of a 'use server' file is registered by Next.js as a server action — a POST
 * endpoint anyone with its id can call, passing any arguments. So no exported server action may
 * take the acting user's identity as a parameter; it must read it from the session. Helpers that
 * work on an explicit user live in server-only modules instead.
 *
 * Regression guard for the move that found 18 such exports registered in the production
 * server-action manifest (reminders, notification prefs, landing path, domain options, permission
 * cache, account lookup/provisioning, engagement membership).
 */

const ROOT = join(__dirname, '..', '..')
const SCAN = ['lib', 'app', 'components']
const IDENTITY_PARAM = /\b(userId|userIds|existingUserId|targetUserId|actorUserId|forUserId)\b/

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) sourceFiles(full, out)
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
    }
    return out
}

function isServerActionFile(src: string): boolean {
    return /^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]/.test(src)
}

/** Parameter list text of each `export async function` (balanced parentheses). */
function exportedSignatures(src: string): { name: string; params: string }[] {
    const out: { name: string; params: string }[] = []
    const re = /export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
        let depth = 1
        let i = re.lastIndex
        while (i < src.length && depth > 0) {
            if (src[i] === '(') depth++
            else if (src[i] === ')') depth--
            i++
        }
        out.push({ name: m[1], params: src.slice(re.lastIndex, i - 1) })
    }
    return out
}

describe("'use server' exports never take the caller's identity", () => {
    const offenders: string[] = []
    let actionFiles = 0
    for (const dir of SCAN) {
        for (const file of sourceFiles(join(ROOT, dir))) {
            const src = readFileSync(file, 'utf8')
            if (!isServerActionFile(src)) continue
            actionFiles++
            for (const { name, params } of exportedSignatures(src)) {
                if (IDENTITY_PARAM.test(params)) offenders.push(`${relative(ROOT, file)}: ${name}(${params.replace(/\s+/g, ' ').trim()})`)
            }
        }
    }

    it('finds the server action files', () => {
        expect(actionFiles).toBeGreaterThan(30)
    })

    it('has no exported server action with a userId-style parameter', () => {
        expect(offenders).toEqual([])
    })
})

describe('helpers that take an explicit user are server-only, not server actions', () => {
    const SERVER_ONLY = [
        'lib/reminders/reminder-service.ts',
        'lib/notification-prefs.ts',
        'lib/landing/default-landing-path.ts',
        'lib/onboarding/domain-options.ts',
        'lib/permissions/invalidate-user-settings.ts',
        'lib/actions/auth-user-lookup.ts',
        'lib/actions/account-provisioning.ts',
        'lib/actions/engagement-membership.ts',
    ]
    it.each(SERVER_ONLY)('%s', (path) => {
        const src = readFileSync(join(ROOT, path), 'utf8')
        expect(src.startsWith("import 'server-only'")).toBe(true)
        expect(isServerActionFile(src)).toBe(false)
    })
})
