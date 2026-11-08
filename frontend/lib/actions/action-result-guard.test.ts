import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A server action's thrown reason never reaches the browser.
 *
 * In a production build React replaces whatever a server action throws with "Minified React error #441"
 * before the browser sees it, and an error's class is lost too (`instanceof` is always false there).
 * `next dev` keeps the message, which is how "A client with this name already exists" and the plan
 * limits went unseen for months (the error-handling audit's root cause 1). So an action a person calls
 * from the browser answers with `asResult` and `ActionResult` (lib/actions/action-result.ts), and the
 * browser reads `result.error` and `result.warning`. This guard keeps it that way, by reading the
 * source, in four checks:
 *
 * 1. Actions: an exported function of a 'use server' module whose own body throws a person-facing
 *    reason (`userFacing(…)`, or the `signedOut()`, `notAllowed(…)`, `gone(…)` helpers) must declare an
 *    `ActionResult` return, so the throw is caught by `asResult` instead of crossing raw. Put the
 *    throwing body in a non-exported function and wrap it, as `createClient` does.
 * 2. Browser code calling an action that answers `ActionResult` must read the answer: a bare
 *    `await updateClient(…)` statement drops the reason and reports success. `const r = await …`,
 *    `return …`, `.then(…)` and an explicit `void …` (deliberately ignored) all pass.
 * 3. Browser code calling an action that still throws must not show the caught error's text
 *    (`e.message`, `failureReason(e)`, `String(e)`): in production that text is #441. Show a sentence
 *    of your own, or convert the action. (`failureReason(e)` is right after a result-returning action,
 *    where the only throw left is a request that never got there.)
 * 4. No `instanceof` against a class from `@/lib/actions/*`: it is always false in the browser.
 *
 * Browser code is every file under components/ and app/ that isn't a route, a test or itself a
 * 'use server' module. Text-based on purpose (like the identity guard beside it): fast, and precise
 * enough for the shapes this codebase uses.
 */

const ROOT = join(__dirname, '..', '..')

function sourceFiles(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out
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

/** Index just past the bracket that closes the one opened at `open` (skips strings and comments). */
function matchingClose(src: string, open: number): number {
    const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' }
    const stack: string[] = [pairs[src[open]]]
    let i = open + 1
    while (i < src.length && stack.length > 0) {
        const c = src[i]
        if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return src.length; continue }
        if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; if (i < 2) return src.length; continue }
        if (c === '"' || c === "'" || c === '`') {
            const quote = c
            i++
            while (i < src.length && src[i] !== quote) {
                if (src[i] === '\\') i++
                else if (quote === '`' && src[i] === '$' && src[i + 1] === '{') { i = matchingClose(src, i + 1) - 1 }
                i++
            }
            i++
            continue
        }
        if (pairs[c]) stack.push(pairs[c])
        else if (c === stack[stack.length - 1]) stack.pop()
        i++
    }
    return i
}

type ExportedAction = {
    name: string
    /** Answers `ActionResult`. */
    returnsResult: boolean
    /** Answers its failures in some shape of its own (`{ error }`, ActionResponse, a try/catch that returns). */
    answersErrors: boolean
    body: string
}

/** Each `export async function` of a module, with whether it answers `ActionResult`, and its body. */
function exportedActions(src: string): Map<string, ExportedAction> {
    const out = new Map<string, ExportedAction>()
    const re = /export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
        const paramsEnd = matchingClose(src, re.lastIndex - 1)
        // The return type runs to the body's `{`: the first one outside angle brackets.
        let i = paramsEnd
        let angle = 0
        while (i < src.length) {
            const c = src[i]
            if (c === '<') angle++
            else if (c === '>' && src[i - 1] !== '=') angle--
            else if (c === '{' && angle === 0) break
            i++
        }
        const returnType = src.slice(paramsEnd, i)
        const bodyEnd = matchingClose(src, i)
        const body = src.slice(i, bodyEnd)
        const returnsResult = /\bActionResult\b/.test(returnType)
        const answersErrors = returnsResult
            || /ActionResponse|\w+Result\b|\berror\??\s*:/.test(returnType)
            || /^\{\s*(try\s*\{|return\s+(serverActionWrapper|asResult|asResultWithWarning)\s*\()/.test(body)
        out.set(m[1], { name: m[1], returnsResult, answersErrors, body })
    }
    // `export const updateProject = updateEngagement` answers as its target does.
    const alias = /export\s+const\s+(\w+)\s*=\s*(\w+)\s*$/gm
    while ((m = alias.exec(src))) {
        const target = out.get(m[2])
        if (target) out.set(m[1], { ...target, name: m[1] })
    }
    return out
}

const PERSON_FACING_THROW = /\bthrow\s+(userFacing|signedOut|notAllowed|gone)\s*\(/

// ── The server action modules ────────────────────────────────────────────────────────────────────

const actionModules = new Map<string, { file: string; actions: Map<string, ExportedAction> }>()
for (const dir of ['lib/actions', 'app/actions']) {
    for (const file of sourceFiles(join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        if (!isServerActionFile(src)) continue
        const specifier = '@/' + relative(ROOT, file).replace(/\.(ts|tsx)$/, '')
        actionModules.set(specifier, { file, actions: exportedActions(src) })
    }
}

// ── The browser code that calls them ─────────────────────────────────────────────────────────────

type Imported = { local: string; action: ExportedAction; specifier: string }

function importedActions(src: string): Imported[] {
    const out: Imported[] = []
    const add = (list: string, specifier: string) => {
        const mod = actionModules.get(specifier)
        if (!mod) return
        for (const raw of list.split(',')) {
            const item = raw.trim()
            if (!item || item.startsWith('type ')) continue
            const [name, local] = item.split(/\s+as\s+|\s*:\s*/).map((s) => s.trim())
            const action = mod.actions.get(name)
            if (action) out.push({ local: local || name, action, specifier })
        }
    }
    const staticImport = /import\s*\{([^}]*)\}\s*from\s*['"](@\/(?:lib|app)\/actions\/[\w/-]+)['"]/g
    const dynamicImport = /const\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*['"](@\/(?:lib|app)\/actions\/[\w/-]+)['"]\s*\)/g
    let m: RegExpExecArray | null
    while ((m = staticImport.exec(src))) add(m[1], m[2])
    while ((m = dynamicImport.exec(src))) add(m[1], m[2])
    return out
}

const isClientFile = (src: string) => /^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src)

// Under app/ a file without 'use client' is a server component or route: an action it calls runs on the
// server, where its throw keeps its words. Under components/ a file may run in the browser either way.
const browserFiles = [
    ...sourceFiles(join(ROOT, 'components')).map((file) => ({ file, src: readFileSync(file, 'utf8') })),
    ...sourceFiles(join(ROOT, 'app')).map((file) => ({ file, src: readFileSync(file, 'utf8') })).filter(({ src }) => isClientFile(src)),
].filter(({ src }) => !isServerActionFile(src))

const codeLines = (src: string) =>
    src.split('\n').map((text, i) => ({ text, line: i + 1 })).filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text))

/**
 * Calls of `name` whose answer is dropped: the call is a statement of its own, and nothing is chained
 * on it (`.then(…)`, `.catch(…)`).
 */
function droppedResults(src: string, name: string): number[] {
    const call = new RegExp(`(?<![\\w.$])(await\\s+)?${name}\\s*\\(`, 'g')
    const comment = new Set(codeLines(src).map(({ line }) => line))
    const lines: number[] = []
    let m: RegExpExecArray | null
    while ((m = call.exec(src))) {
        const line = src.slice(0, m.index).split('\n').length
        if (!comment.has(line)) continue
        const lineStart = src.lastIndexOf('\n', m.index) + 1
        const before = src.slice(lineStart, m.index).trimEnd()
        const statement = before === '' || /[;{}]$/.test(before) || /\btry$/.test(before)
        if (!statement) continue
        const after = src.slice(matchingClose(src, m.index + m[0].length - 1)).replace(/^(\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/)*/, '')
        if (/^\s*\.(then|catch|finally)\s*\(/.test(after)) continue
        lines.push(line)
    }
    return lines
}

/** try/catch blocks whose try calls `name` and whose catch shows the caught error's text. */
function catchesShowingThrownText(src: string, name: string): number[] {
    const lines: number[] = []
    const tryRe = /\btry\s*\{/g
    let m: RegExpExecArray | null
    while ((m = tryRe.exec(src))) {
        const tryOpen = m.index + m[0].length - 1
        const tryEnd = matchingClose(src, tryOpen)
        const tryBody = src.slice(tryOpen, tryEnd)
        if (!new RegExp(`(?<![\\w.$])${name}\\s*\\(`).test(tryBody)) continue
        const catchMatch = /^\s*catch\s*(?:\(\s*(\w+)[^)]*\))?\s*\{/.exec(src.slice(tryEnd))
        if (!catchMatch || !catchMatch[1]) continue
        const variable = catchMatch[1]
        const catchOpen = tryEnd + catchMatch[0].length - 1
        const catchBody = src.slice(catchOpen, matchingClose(src, catchOpen))
        const shows = new RegExp(`\\b${variable}\\??\\.message\\b|failureReason\\(\\s*${variable}\\b|String\\(\\s*${variable}\\s*\\)|\\$\\{\\s*${variable}\\s*\\}`)
        // `e instanceof TypeError ? failureReason(e) : "…"`: only a request that never got there shows its own words.
        const networkOnly = new RegExp(`\\b${variable}\\s+instanceof\\s+TypeError\\b`).test(catchBody)
        if (shows.test(catchBody) && !networkOnly) lines.push(src.slice(0, tryEnd).split('\n').length)
    }
    return lines
}

describe('server actions answer the reasons people read; they never throw them', () => {
    it('finds the action modules and the browser code', () => {
        expect(actionModules.size).toBeGreaterThan(20)
        expect(browserFiles.length).toBeGreaterThan(200)
    })

    it('every export that throws a person-facing reason answers ActionResult', () => {
        const offenders: string[] = []
        for (const { file, actions } of Array.from(actionModules.values())) {
            for (const action of Array.from(actions.values())) {
                if (!action.returnsResult && PERSON_FACING_THROW.test(action.body)) offenders.push(`${relative(ROOT, file)}: ${action.name}`)
            }
        }
        expect(offenders).toEqual([])
    })

    it("browser code reads the answer of every action that answers ActionResult", () => {
        const offenders: string[] = []
        for (const { file, src } of browserFiles) {
            for (const { local, action } of importedActions(src)) {
                if (!action.returnsResult) continue
                for (const line of droppedResults(src, local)) offenders.push(`${relative(ROOT, file)}:${line} drops ${local}'s answer`)
            }
        }
        expect(offenders).toEqual([])
    })

    it("browser code never shows the text of a server action's throw", () => {
        const offenders: string[] = []
        for (const { file, src } of browserFiles) {
            for (const { local, action } of importedActions(src)) {
                if (action.answersErrors) continue
                for (const line of catchesShowingThrownText(src, local)) offenders.push(`${relative(ROOT, file)}:${line} shows ${local}'s thrown text`)
            }
        }
        expect(offenders).toEqual([])
    })

    it('browser code never tests a thrown action error with instanceof', () => {
        const offenders: string[] = []
        for (const { file, src } of browserFiles) {
            const classes = new Set<string>()
            const re = /import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/actions\/[\w/-]+['"]|const\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*['"]@\/lib\/actions\/[\w/-]+['"]\s*\)/g
            let m: RegExpExecArray | null
            while ((m = re.exec(src))) {
                for (const item of (m[1] ?? m[2]).split(',')) {
                    const name = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim()
                    if (name && /^[A-Z]\w*Error$/.test(name)) classes.add(name)
                }
            }
            for (const name of Array.from(classes)) {
                if (new RegExp(`instanceof\\s+${name}\\b`).test(src)) offenders.push(`${relative(ROOT, file)}: instanceof ${name}`)
            }
        }
        expect(offenders).toEqual([])
    })
})

describe('the guard itself', () => {
    it('reads return types, including object types inside Promise<…>', () => {
        const actions = exportedActions(`'use server'
export async function a(x: string): Promise<ActionResult<{ id: string }>> { return asResult('a', async () => ({ id: x })) }
export async function b(): Promise<{ path: string } | { error: string }> { throw userFacing('no') }
export const c = a
`)
        expect(actions.get('a')?.returnsResult).toBe(true)
        expect(actions.get('b')?.returnsResult).toBe(false)
        expect(PERSON_FACING_THROW.test(actions.get('b')!.body)).toBe(true)
        expect(actions.get('c')?.returnsResult).toBe(true)
    })

    it('tells a dropped answer from a read one', () => {
        const src = [
            'async function f() {',
            '    await save(1)',
            '    const r = await save(2)',
            '    try { await save(3) } catch {}',
            '    void save(4)',
            '    return save(5)',
            '    obj.save(6)',
            '    save(7)',
            '        // a comment between',
            '        .then((r) => r)',
            '}',
        ].join('\n')
        expect(droppedResults(src, 'save')).toEqual([2, 4])
    })

    it("finds a catch that shows a throwing action's message, and only that", () => {
        const shows = 'try {\n  await load()\n} catch (e) {\n  toast(e instanceof Error ? e.message : "x")\n}'
        const sentence = 'try {\n  await load()\n} catch (e) {\n  toast("Couldn\'t load it")\n}'
        const other = 'try {\n  await other()\n} catch (e) {\n  toast(failureReason(e))\n}'
        const network = 'try {\n  await load()\n} catch (e) {\n  toast(e instanceof TypeError ? failureReason(e) : "Didn\'t load.")\n}'
        expect(catchesShowingThrownText(shows, 'load')).toEqual([3])
        expect(catchesShowingThrownText(sentence, 'load')).toEqual([])
        expect(catchesShowingThrownText(other, 'load')).toEqual([])
        expect(catchesShowingThrownText(network, 'load')).toEqual([])
    })
})
