import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'

/*
 * Signed OAuth `state` for the Google Drive and OneDrive connect flows
 * (.claude/plans/access-gates.md, P0 #4).
 *
 * The callbacks used to base64-decode `state` and act on the user, firm, client and
 * replace-connector ids inside it. Anyone could forge one and link their own Drive as another
 * firm's storage. Now `initiate` signs the state with a server secret, and the callback only
 * trusts a state whose signature checks out, that is under 30 minutes old, and whose user is the
 * signed-in user. The callback then re-checks that user's rights on the firm, client and connector.
 *
 * Format: `<base64url(JSON)>.<base64url(HMAC-SHA256)>`.
 *
 * Secret: `OAUTH_STATE_SECRET`, falling back to the Supabase service-role key — both server-only —
 * so deploys don't break before the dedicated secret is set.
 */

const MAX_AGE_MS = 30 * 60 * 1000
const CONTEXT = 'firma.connector-oauth-state.v1:'

function secret(): string {
    const s = process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!s) throw new Error('OAUTH_STATE_SECRET is not configured')
    return s
}

function mac(payload: string): string {
    return createHmac('sha256', secret()).update(CONTEXT + payload).digest('base64url')
}

export function signOAuthState(fields: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify({ ...fields, iat: Date.now() })).toString('base64url')
    return `${payload}.${mac(payload)}`
}

/** The state's fields when the signature is valid and it isn't stale; otherwise null. */
export function verifyOAuthState<T extends Record<string, unknown>>(state: string | null | undefined): (T & { iat: number }) | null {
    if (!state) return null
    const dot = state.lastIndexOf('.')
    if (dot <= 0) return null
    const payload = state.slice(0, dot)
    const given = Buffer.from(state.slice(dot + 1))
    const expected = Buffer.from(mac(payload))
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    try {
        const fields = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
        if (typeof fields?.iat !== 'number' || Date.now() - fields.iat > MAX_AGE_MS || fields.iat > Date.now() + 60_000) return null
        return fields
    } catch {
        return null
    }
}

/**
 * Reads the state WITHOUT checking its signature — only for presentation before verification:
 * which popup to answer (flow, nonce, opener origin) and where to send an error. Never use these
 * fields to decide what to link or whom to trust.
 */
export function peekOAuthState(state: string | null | undefined): Record<string, unknown> {
    if (!state) return {}
    const payload = state.includes('.') ? state.slice(0, state.lastIndexOf('.')) : state
    try {
        const fields = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
        return fields && typeof fields === 'object' ? fields : {}
    } catch {
        return {}
    }
}

/** A same-origin path from the state's `next`, else the fallback. Rejects `//host` and absolute URLs. */
export function safeNextPath(next: unknown, fallback: string): string {
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback
}
