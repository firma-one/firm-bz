/**
 * Server-only: what a failed Polar call means, in words a person can act on. The SDK throws a
 * `PolarError` subclass with `statusCode` and a JSON `body` (often with a `detail`), or an
 * `HTTPClientError` (`ConnectionError`, `RequestTimeoutError`…) when Polar never answered. Read
 * duck-typed so callers and tests need not import the SDK's classes.
 */

export type PolarFailureKind = 'unreachable' | 'not_found' | 'refused'

export type PolarFailure = {
    kind: PolarFailureKind
    status: number | null
    /** Polar's own sentence, when it gave one. */
    detail: string | null
}

const UNREACHABLE_NAMES = new Set(['ConnectionError', 'RequestTimeoutError', 'RequestAbortedError', 'UnexpectedClientError'])

function detailFrom(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (Array.isArray(value)) {
        const parts = value
            .map((v) => (v && typeof v === 'object' && typeof (v as { msg?: unknown }).msg === 'string' ? (v as { msg: string }).msg : null))
            .filter((s): s is string => Boolean(s))
        return parts.length ? parts.join('; ') : null
    }
    return null
}

export function polarFailure(e: unknown): PolarFailure {
    const err = (e && typeof e === 'object' ? e : {}) as {
        name?: unknown
        statusCode?: unknown
        detail?: unknown
        body?: unknown
    }
    const name = typeof err.name === 'string' ? err.name : ''
    if (e instanceof TypeError || UNREACHABLE_NAMES.has(name)) {
        return { kind: 'unreachable', status: null, detail: null }
    }
    const status = typeof err.statusCode === 'number' ? err.statusCode : null
    let detail = detailFrom(err.detail)
    if (!detail && typeof err.body === 'string') {
        try {
            detail = detailFrom((JSON.parse(err.body) as { detail?: unknown }).detail)
        } catch {
            detail = null
        }
    }
    if (status == null || status >= 500) return { kind: 'unreachable', status, detail }
    if (status === 404) return { kind: 'not_found', status, detail }
    return { kind: 'refused', status, detail }
}

/** One sentence for a failed Polar call. */
export function polarFailureWords(e: unknown): string {
    const f = polarFailure(e)
    if (f.kind === 'unreachable') return "Polar, our payment provider, didn't answer. Try again in a minute."
    if (f.detail) return `Polar said: ${f.detail.replace(/\.?$/, '.')}`
    return f.kind === 'not_found'
        ? "Polar couldn't find this billing account."
        : `Polar refused the request (${f.status}). Try again in a minute.`
}
