/**
 * Placeholders for names, emails, links and ID numbers, before Brio reads anything
 * (.claude/plans/brio-features-round-2.md, §14 item 5).
 *
 * What goes to the model has every person, client and firm we know of, every email address, link, phone
 * number and ID number replaced by a placeholder: "[PERSON_2] will send the K-1s to [EMAIL_1]". What comes
 * back has the real words put back before anyone sees it or anything is saved. Nothing here calls out:
 * pure string work, no network, no other provider.
 *
 * - A `Vault` is built once per request from what we already know (lib/ai/known-entities.ts). A person's,
 *   client's or firm's placeholder comes from their record's id ("[PERSON_7F3A91C2]"), so it's the same in every
 *   engagement, every chat and every request, whoever joins or leaves: a chat's history stays consistent and
 *   the prompt cache keeps hitting. Nothing is stored for it (Deepak asked, 2026-11-14, for one identity per
 *   person; an id-derived placeholder gives that with no column, no backfill, contacts and firm scope included).
 * - A `MaskSession` is one model call: emails, links, phone and ID numbers get placeholders in the order
 *   they first appear, and the session can put back everything it gave out.
 *
 * It reduces what reaches the model; it doesn't anonymize. A name we don't know gets through, and the
 * words around a name can still say who it is. Never claim more than "replaces the names, emails, links
 * and ID numbers it recognizes".
 *
 * Plain JavaScript regular expressions only: the project targets ES5, so no lookbehind and no `u` flag.
 */

export type EntityKind = 'person' | 'client' | 'firm'

/** Someone or something we know by name, from the database. */
export interface KnownEntity {
    kind: EntityKind
    /** The record's id: a user's, a client contact's, the client's or the firm's. The placeholder comes from it. */
    id: string
    name: string
}

/** Letters and digits a name is made of; anything else is a boundary. */
const WORD_CHAR = /[A-Za-z0-9\u00C0-\u024F]/
const isWordChar = (c: string | undefined) => !!c && WORD_CHAR.test(c)

/**
 * First names that are also everyday words. Alone, they're left as they are (a sentence starting "May we…"
 * stays readable); inside a full name they're replaced like any other.
 */
const COMMON_WORDS = new Set([
    'may', 'will', 'grace', 'hope', 'joy', 'faith', 'mark', 'bill', 'rose', 'june', 'april', 'august',
    'art', 'sue', 'jack', 'pat', 'chase', 'lane', 'dawn', 'summer', 'autumn', 'max', 'sky', 'ray', 'rich',
    'frank', 'chance', 'page', 'drew', 'bob', 'sunny', 'penny', 'holly', 'ivy', 'miles', 'reed', 'brook',
    'cash', 'gene', 'hunter', 'king', 'young', 'long', 'white', 'black', 'brown', 'green', 'gray', 'grey',
    'stone', 'wood', 'hill', 'park', 'west', 'north', 'south', 'east', 'law', 'price', 'case', 'day', 'new',
    'the', 'and', 'for', 'team', 'group', 'firm', 'client', 'partners', 'associates', 'company',
])

/** Legal suffixes a client or firm name is also written without: "Acme Robotics, Inc." is "Acme Robotics". */
const LEGAL_SUFFIX = /[,\s]+(inc\.?|incorporated|llc|l\.l\.c\.|ltd\.?|limited|llp|plc|corp\.?|corporation|co\.?|gmbh|pvt\.?\s*ltd\.?|pty\.?\s*ltd\.?|lp|p\.?c\.?|pllc)$/i

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const keyOf = (s: string) => clean(s).toLowerCase()
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One string the vault replaces, and what it becomes. */
interface Surface {
    text: string
    token: string
}

/** Placeholders of every kind, as they appear in text: what `unmask` looks for. */
const TOKEN = /\[(?:PERSON|CLIENT|FIRM|NAME|EMAIL|LINK|PHONE|ID|CARD|IBAN)_[0-9A-F]+(?:_FIRST|_LAST)?(?:_V\d+)?\]/gi

/** FNV-1a, 32 bits, as hex: a short, stable code from a record's id, which says nothing about whose it is. */
function hashHex(s: string): string {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).toUpperCase().padStart(8, '0')
}

/** What a vault knows: each surface string, longest first, and each placeholder's words. */
export class Vault {
    readonly surfaces: Surface[]
    private readonly words = new Map<string, string>()
    private readonly byKey = new Map<string, string>()
    private readonly matcher: RegExp | null

    constructor(surfaces: Surface[], private readonly ids: Map<string, string> = new Map()) {
        // Longest first, so "Dana Whitfield" is one placeholder, not "Dana" and "Whitfield".
        this.surfaces = surfaces.slice().sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text))
        for (const s of this.surfaces) {
            if (!this.words.has(s.token)) this.words.set(s.token, s.text)
            if (!this.byKey.has(keyOf(s.text))) this.byKey.set(keyOf(s.text), s.token)
        }
        this.matcher = this.surfaces.length > 0
            ? new RegExp(this.surfaces.map((s) => escapeRegExp(s.text).replace(/ /g, '\\s+')).join('|'), 'gi')
            : null
    }

    /** The words a static placeholder stands for. */
    wordsOf(token: string): string | undefined {
        return this.words.get(token)
    }

    /** A record's own placeholder ("[PERSON_7F3A91C2]"), for tests and logs. */
    tokenOf(kind: EntityKind, id: string): string | undefined {
        return this.ids.get(`${kind}:${id}`)
    }

    /**
     * Replaces every known name in `text`, at word boundaries only. `pick` chooses the placeholder for the
     * exact words found, so a name written two ways ("Dana", "dana") comes back each as it was written.
     */
    maskNames(text: string, pick: (token: string, exact: string) => string = (token) => token): string {
        if (!this.matcher) return text
        return text.replace(this.matcher, (match: string, offset: number, whole: string) => {
            if (isWordChar(whole[offset - 1]) || isWordChar(whole[offset + match.length])) return match
            const token = this.byKey.get(keyOf(match))
            return token ? pick(token, match) : match
        })
    }

    /** A session for one model call. */
    session(): MaskSession {
        return new MaskSession(this)
    }
}

/**
 * How many hex digits a record's code has (Deepak, 2026-11-14: 8 as the norm). Short enough for the model to
 * copy back exactly, long enough that two people in one vault sharing a code is about one chance in billions
 * (0.003% for a 500-person firm), so a person's placeholder is the same everywhere.
 */
export const CODE_LENGTH = 8

/**
 * Builds the vault for a request. A record's placeholder is a code from its id: `CODE_LENGTH` hex digits.
 * Should two records of a kind ever share one, the record with the earlier id keeps it and the later one
 * takes a longer code: decided by the ids alone, so it's the same on every request.
 *
 * A first name two people share gets a placeholder of its own for the request ("[NAME_1]"), numbered by
 * name; it isn't derived from the name, which could be guessed.
 *
 * `codeLength` is for tests that must make codes clash; everything else uses the norm.
 */
export function buildVault(entities: readonly KnownEntity[], options: { codeLength?: number } = {}): Vault {
    const codeLength = options.codeLength ?? CODE_LENGTH
    const seen = new Set<string>()
    const unique = entities
        .map((e) => ({ ...e, name: clean(e.name ?? '') }))
        .filter((e) => e.id && e.name.length >= 2)
        .filter((e) => {
            const k = `${e.kind}:${e.id}`
            if (seen.has(k)) return false
            seen.add(k)
            return true
        })
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))

    // Each record's code, in id order (`unique` is sorted by kind, then id): the first to reach a code keeps it,
    // a later id that would share it takes more digits until it doesn't. 24 hex digits are there to take.
    const PREFIX: Record<EntityKind, string> = { person: 'PERSON', client: 'CLIENT', firm: 'FIRM' }
    const ids = new Map<string, string>()
    const given = new Set<string>()
    for (const e of unique) {
        const hex = hashHex(`${e.kind}:${e.id}`) + hashHex(`${e.id}:${e.kind}`) + hashHex(`${e.kind}|${e.id}`)
        let len = codeLength
        while (len < hex.length && given.has(`${e.kind}:${hex.slice(0, len)}`)) len += 2
        given.add(`${e.kind}:${hex.slice(0, len)}`)
        ids.set(`${e.kind}:${e.id}`, `[${PREFIX[e.kind]}_${hex.slice(0, len)}]`)
    }

    const surfaces: Surface[] = []
    const taken = new Set<string>()
    const add = (text: string, token: string) => {
        const t = clean(text)
        if (t.length < 2 || taken.has(keyOf(t))) return
        taken.add(keyOf(t))
        surfaces.push({ text: t, token })
    }

    // How many people share each first and last name: an ambiguous one gets a shared placeholder.
    const people = unique.filter((e) => e.kind === 'person')
    const partsOf = (name: string) => name.split(' ').filter((w) => /[A-Za-z\u00C0-\u024F]/.test(w))
    const firstCount = new Map<string, number>()
    const lastCount = new Map<string, number>()
    for (const p of people) {
        const parts = partsOf(p.name)
        if (parts.length >= 2) {
            firstCount.set(keyOf(parts[0]), (firstCount.get(keyOf(parts[0])) ?? 0) + 1)
            lastCount.set(keyOf(parts[parts.length - 1]), (lastCount.get(keyOf(parts[parts.length - 1])) ?? 0) + 1)
        }
    }
    const sharedFirsts = Array.from(firstCount.keys()).filter((k) => (firstCount.get(k) ?? 0) > 1).sort()
    const sharedToken = new Map(sharedFirsts.map((k, i) => [k, `[NAME_${i + 1}]`] as [string, string]))

    for (const e of unique) {
        const token = ids.get(`${e.kind}:${e.id}`) as string
        if (e.kind !== 'person') {
            // Only the name itself: "Acme Robotics, Inc." is masked as "[CLIENT_…], Inc.", so either way
            // it's written, it comes back exactly as it was.
            const bare = clean(e.name.replace(LEGAL_SUFFIX, ''))
            add(bare && !COMMON_WORDS.has(keyOf(bare)) ? bare : e.name, token)
            continue
        }
        add(e.name, token)
        const parts = partsOf(e.name)
        if (parts.length < 2) continue
        const first = parts[0]
        const last = parts[parts.length - 1]
        const usable = (w: string) => w.length >= 2 && !COMMON_WORDS.has(keyOf(w))
        if (usable(first)) add(first, sharedToken.get(keyOf(first)) ?? token.replace(/\]$/, '_FIRST]'))
        if (usable(last) && last.length >= 3 && (lastCount.get(keyOf(last)) ?? 0) === 1) add(last, token.replace(/\]$/, '_LAST]'))
    }
    return new Vault(surfaces, ids)
}

// ── Patterns ─────────────────────────────────────────────────────────────────────────────────────

/** Luhn: a card number's own check, so an order number of the same length isn't taken for one. */
function luhn(digits: string): boolean {
    let sum = 0
    let double = false
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = digits.charCodeAt(i) - 48
        if (double) {
            d *= 2
            if (d > 9) d -= 9
        }
        sum += d
        double = !double
    }
    return sum % 10 === 0
}

type PatternKind = 'LINK' | 'EMAIL' | 'CARD' | 'IBAN' | 'ID' | 'PHONE'

/**
 * In order: a link first (it may hold an email), then an email, then numbers, most specific first. A phone
 * number must be written as one (with spaces, dots, dashes or brackets between groups): a bare run of digits
 * is an order or invoice number as often as a phone, and Salesforce's own masking shows the cost of guessing.
 */
/** True when more digits touch `match` at `offset`, on either side: part of a longer number, not one of its own. */
function inLongerNumber(match: string, offset: number, whole: string): boolean {
    const before = whole.slice(Math.max(0, offset - 2), offset)
    const after = whole.slice(offset + match.length, offset + match.length + 2)
    return /\d$|\d[ .-]$/.test(before) || /^\d|^[ .-]\d/.test(after)
}

const PATTERNS: Array<{ kind: PatternKind; re: RegExp; accept?: (m: string, offset: number, whole: string) => boolean; trim?: boolean }> = [
    { kind: 'LINK', re: /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi, trim: true },
    { kind: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    {
        kind: 'CARD',
        re: /\b(?:\d[ -]?){12,18}\d\b/g,
        accept: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d) },
    },
    { kind: 'IBAN', re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g },
    // SSN and ITIN (123-45-6789), EIN (12-3456789).
    { kind: 'ID', re: /\b(?:\d{3}-\d{2}-\d{4}|\d{2}-\d{7})\b/g },
    {
        kind: 'PHONE',
        re: /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\b\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4}\b/g,
        accept: (m, offset, whole) => {
            const d = m.replace(/\D/g, '').length
            return d >= 9 && d <= 15 && !inLongerNumber(m, offset, whole)
        },
    },
]

/** Trailing punctuation a sentence puts after a link isn't part of it. */
const trimLink = (m: string) => m.replace(/[.,;:!?)\]]+$/, '')

/**
 * One model call's placeholders: the vault's names, and the patterns found in what's sent, numbered in the
 * order they first appear. Mask everything sent through one session, then unmask what comes back with it.
 */
export class MaskSession {
    private readonly found = new Map<string, string>()
    private readonly words = new Map<string, string>()
    /** For each name placeholder, the exact words it stood for, by spelling: one placeholder per spelling. */
    private readonly spellings = new Map<string, Map<string, string>>()
    private readonly counts: Record<PatternKind, number> = { LINK: 0, EMAIL: 0, CARD: 0, IBAN: 0, ID: 0, PHONE: 0 }

    constructor(private readonly vault: Vault) {}

    private patternToken(kind: PatternKind, value: string): string {
        const key = `${kind}:${value}`
        const known = this.found.get(key)
        if (known) return known
        this.counts[kind] += 1
        const token = `[${kind}_${this.counts[kind]}]`
        this.found.set(key, token)
        this.words.set(token, value)
        return token
    }

    /** `text` with every known name and every recognized pattern replaced. */
    mask(text: string): string {
        if (!text) return text
        let out = text
        for (const p of PATTERNS) {
            out = out.replace(p.re, (match: string, offset: number, whole: string) => {
                // Never inside a placeholder already given out.
                if (/^\[[A-Z]+_\d+/.test(match)) return match
                const value = p.trim ? trimLink(match) : match
                if (p.accept && !p.accept(value, offset, whole)) return match
                return this.patternToken(p.kind, value) + match.slice(value.length)
            })
        }
        return this.vault.maskNames(out, (token, exact) => this.spellingToken(token, exact))
    }

    /** The placeholder for a name as written: the first spelling keeps it, another gets `_V2`, `_V3`. */
    private spellingToken(token: string, exact: string): string {
        let bySpelling = this.spellings.get(token)
        if (!bySpelling) {
            bySpelling = new Map()
            this.spellings.set(token, bySpelling)
        }
        const known = bySpelling.get(exact)
        if (known) return known
        const variant = bySpelling.size === 0 ? token : `${token.slice(0, -1)}_V${bySpelling.size + 1}]`
        bySpelling.set(exact, variant)
        this.words.set(variant, exact)
        return variant
    }

    /** Every string inside `value` masked: for tool results and earlier tool calls sent back. */
    maskDeep<T>(value: T): T {
        return mapStrings(value, (s) => this.mask(s))
    }

    /** The words a placeholder stands for in this call, or undefined for one it never gave out. */
    wordsOf(token: string): string | undefined {
        // A model may write a placeholder in lower case; every placeholder is upper case.
        const t = token.toUpperCase()
        return this.words.get(t) ?? this.vault.wordsOf(t)
    }

    /** `text` with every placeholder this session knows put back; one it never gave out stays as it is. */
    unmask(text: string): string {
        if (!text || text.indexOf('[') < 0) return text
        return text.replace(TOKEN, (token: string) => this.wordsOf(token) ?? token)
    }

    /** Every string inside `value` unmasked: for a tool call's input. */
    unmaskDeep<T>(value: T): T {
        return mapStrings(value, (s) => this.unmask(s))
    }

    /** For a stream of text: puts back placeholders even when one arrives split across deltas. */
    streamUnmasker(): StreamUnmasker {
        return new StreamUnmasker(this)
    }
}

/** The longest placeholder is about 20 characters; anything held longer than this is just a bracket. */
const HOLD_MAX = 24

/**
 * Text arrives in pieces. A piece that ends inside a placeholder ("…sent to [PERS") is held until the
 * placeholder closes, then put back whole. `flush` at the end gives back whatever is still held.
 */
export class StreamUnmasker {
    private held = ''

    constructor(private readonly session: MaskSession) {}

    push(delta: string): string {
        const text = this.held + delta
        const open = text.lastIndexOf('[')
        if (open >= 0 && text.indexOf(']', open) < 0 && text.length - open <= HOLD_MAX) {
            this.held = text.slice(open)
            return this.session.unmask(text.slice(0, open))
        }
        this.held = ''
        return this.session.unmask(text)
    }

    flush(): string {
        const rest = this.held
        this.held = ''
        return this.session.unmask(rest)
    }
}

/** A copy of `value` with every string passed through `fn`: arrays and plain objects, any depth. */
function mapStrings<T>(value: T, fn: (s: string) => string): T {
    if (typeof value === 'string') return fn(value) as unknown as T
    if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn)) as unknown as T
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const k of Object.keys(value as Record<string, unknown>)) out[k] = mapStrings((value as Record<string, unknown>)[k], fn)
        return out as T
    }
    return value
}
