#!/usr/bin/env node
/**
 * UI token codemod — .claude/plans/ui-ux-overhaul.md (Phases 1 and 6).
 *
 * Rewrites hardcoded hex color utilities to the semantic token classes from app/ui-tokens.css,
 * e.g. `text-[#45474c]` → `text-fg-muted`, `hover:bg-[#f9f9fb]` → `hover:bg-surface-hover`.
 *
 * Only exact matches are rewritten: every target token's legacy (:root) value equals the hex it
 * replaces, so the v1 UI renders identically and only the New UI (data-ui="v2") changes.
 * Anything that can't be mapped losslessly is left alone and reported:
 *   - opacity suffixes (`bg-[#f9f9fb]/50`) — the neutral tokens are plain var() colors with no
 *     alpha channel;
 *   - `#f3f4f6` under hover/focus — globals.css remaps `.d-app .hover:bg-[#f3f4f6]` to #f9f9fb,
 *     so its rendered color depends on where the element sits;
 *   - gradient stops and shadow colors.
 *
 * Usage (from frontend/):
 *   node scripts/ui-token-codemod.mjs [paths…]            dry run — prints what would change
 *   node scripts/ui-token-codemod.mjs --write [paths…]    rewrites files in place
 *   node scripts/ui-token-codemod.mjs --verbose [paths…]  also lists every skipped class
 *   … --palette                                            ALSO maps Tailwind slate/gray classes to the
 *                                                          nearest token. Lossy — changes the legacy UI —
 *                                                          for the Phase 6 in-place redesign only.
 * Paths default to the logged-in app (components/, app/(app), lib/) minus the marketing, blog,
 * legal and demo trees, which never render under data-ui="v2".
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const PALETTE = args.includes('--palette')
const VERBOSE = args.includes('--verbose')
const pathArgs = args.filter((a) => !a.startsWith('--'))

const DEFAULT_PATHS = ['components', 'app/(app)', 'lib']
const EXCLUDED_DIRS = new Set([
    'node_modules', '.next',
    'components/landing', 'components/marketing', 'components/blog', 'components/legal',
    'components/demo', 'components/docs', 'components/kinetic', 'components/sections',
])
const EXTENSIONS = new Set(['.ts', '.tsx'])

/** hex → token for plain (non-interactive) use. Legacy value of each token === the hex. */
const TOKEN_BY_HEX = {
    '1b1b1d': 'fg',
    '45474c': 'fg-muted',
    '9a9ba0': 'fg-subtle',
    'e5e7eb': 'line',
    'd1d5db': 'line-strong',
    'f9f9fb': 'surface-subtle',
    'f3f4f6': 'surface-muted',
}

/** Overrides for background hexes under an interactive / selected variant. null = skip. */
const BG_INTERACTIVE = { 'f9f9fb': 'surface-hover', 'f3f4f6': null }
const BG_SELECTED = { 'f3f4f6': 'surface-selected' }

const INTERACTIVE_VARIANT = /^(?:group-|peer-)?(?:hover|focus|focus-visible|focus-within|active)(?:\/[\w-]+)?$|^data-\[highlighted\]$/
const SELECTED_VARIANT = /^(?:aria-selected|data-\[state=(?:active|checked|on|open)\]|data-\[selected(?:=true)?\])$/

/**
 * --palette: neutral slate/gray shades → nearest token, by utility. Approximate by design: the
 * redesign replaces the cool Tailwind grays with Notion's warm neutrals.
 */
const PALETTE_TOKEN = {
    text: { 950: 'fg', 900: 'fg', 800: 'fg', 700: 'fg-muted', 600: 'fg-muted', 500: 'fg-muted', 400: 'fg-subtle', 300: 'fg-subtle' },
    bg: { 50: 'surface-subtle', 100: 'surface-muted', 200: 'surface-selected' },
    border: { 50: 'line', 100: 'line', 200: 'line', 300: 'line-strong' },
    divide: { 50: 'line', 100: 'line', 200: 'line', 300: 'line-strong' },
}
const PALETTE_UTIL = /^(text|bg|border(?:-[xytrblse])?|divide)-(?:slate|gray)-(\d{2,3})$/

function rewritePalette(cls) {
    const parts = splitVariants(cls)
    let util = parts.pop()
    const important = util.startsWith('!')
    if (important) util = util.slice(1)
    const m = util.match(PALETTE_UTIL)
    if (!m) return null
    const [, prefix, shade] = m
    const family = prefix.startsWith('border') ? 'border' : prefix
    let token = PALETTE_TOKEN[family]?.[Number(shade)]
    if (!token) return null
    if (family === 'bg' && parts.some((v) => INTERACTIVE_VARIANT.test(v))) token = 'surface-hover'
    const variants = parts.length ? `${parts.join(':')}:` : ''
    return `${variants}${important ? '!' : ''}${prefix}-${token}`
}
const PALETTE_CANDIDATE = /(?<![\w-])(?:[\w\-\[\]=&>*.\/:]+:)?!?(?:text|bg|border(?:-[xytrblse])?|divide)-(?:slate|gray)-\d{2,3}(?![\w\/-])/g

const COLOR_UTIL = /^(text|bg|border(?:-[xytrblse])?|divide|ring|ring-offset|outline|fill|stroke|decoration|caret|accent)-\[#([0-9a-fA-F]{6})\]$/
const CANDIDATE = /[^\s"'`{}(),;]*\[#[0-9a-fA-F]{6}\][^\s"'`{}(),;]*/g

/** Splits `a:[&_svg]:b` on top-level colons only. */
function splitVariants(cls) {
    const parts = []
    let depth = 0
    let cur = ''
    for (const ch of cls) {
        if (ch === '[') depth++
        if (ch === ']') depth--
        if (ch === ':' && depth === 0) { parts.push(cur); cur = ''; continue }
        cur += ch
    }
    parts.push(cur)
    return parts
}

/** Returns { out } for a rewrite, or { skip: reason }. */
function rewriteClass(cls) {
    const parts = splitVariants(cls)
    let util = parts.pop()
    const important = util.startsWith('!')
    if (important) util = util.slice(1)

    const m = util.match(COLOR_UTIL)
    if (!m) return { skip: /\]\//.test(util) ? 'opacity suffix' : 'not a plain color utility' }

    const [, prefix, rawHex] = m
    const hex = rawHex.toLowerCase()
    if (!(hex in TOKEN_BY_HEX)) return { skip: `no token for #${hex}` }

    let token = TOKEN_BY_HEX[hex]
    if (prefix === 'bg') {
        if (parts.some((v) => INTERACTIVE_VARIANT.test(v)) && hex in BG_INTERACTIVE) {
            token = BG_INTERACTIVE[hex]
            if (token === null) return { skip: `#${hex} under hover/focus (remapped in globals.css)` }
        } else if (parts.some((v) => SELECTED_VARIANT.test(v)) && hex in BG_SELECTED) {
            token = BG_SELECTED[hex]
        }
    }

    const variants = parts.length ? `${parts.join(':')}:` : ''
    return { out: `${variants}${important ? '!' : ''}${prefix}-${token}` }
}

function* walk(path) {
    const rel = relative(ROOT, path)
    if (EXCLUDED_DIRS.has(rel) || EXCLUDED_DIRS.has(rel.split('/').pop())) return
    const st = statSync(path)
    if (st.isDirectory()) {
        for (const entry of readdirSync(path)) yield* walk(join(path, entry))
    } else if (EXTENSIONS.has(extname(path)) && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx')) {
        yield path
    }
}

const roots = (pathArgs.length ? pathArgs : DEFAULT_PATHS).map((p) => join(ROOT, p))
for (const r of roots) {
    if (!existsSync(r)) { console.error(`No such path: ${relative(ROOT, r)}`); process.exit(1) }
}

let filesChanged = 0
let totalRewrites = 0
const skipped = new Map()

for (const root of roots) {
    for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8')
        let count = 0
        const next = src.replace(CANDIDATE, (cls) => {
            const res = rewriteClass(cls)
            if (res.out) { count++; return res.out }
            const key = res.skip
            skipped.set(key, (skipped.get(key) ?? 0) + 1)
            if (VERBOSE) console.log(`  skip  ${relative(ROOT, file)}  ${cls}  (${key})`)
            return cls
        })
        let paletteNext = next
        if (PALETTE) {
            paletteNext = next.replace(PALETTE_CANDIDATE, (cls) => {
                const out = rewritePalette(cls)
                if (out) { count++; return out }
                return cls
            })
        }
        if (count > 0) {
            filesChanged++
            totalRewrites += count
            console.log(`${String(count).padStart(5)}  ${relative(ROOT, file)}`)
            if (WRITE) writeFileSync(file, paletteNext)
        }
    }
}

console.log(`\n${WRITE ? 'Rewrote' : 'Would rewrite'} ${totalRewrites} class(es) in ${filesChanged} file(s).`)
if (skipped.size) {
    console.log('Left alone:')
    for (const [reason, n] of [...skipped].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(5)}  ${reason}`)
}
if (!WRITE && totalRewrites) console.log('\nDry run — re-run with --write to apply.')
