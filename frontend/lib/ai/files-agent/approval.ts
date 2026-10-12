import 'server-only'
import { createHmac, timingSafeEqual, randomUUID } from 'crypto'
import type { Proposal } from './tools'

/**
 * The gate between proposing and applying.
 *
 * The agent never mutates on its own turn. It returns a batch plus a token; applying requires
 * handing that token back. The token exists so the apply route can verify three things it could
 * not otherwise know:
 *
 * 1. **These proposals came from us.** Without a signature, a caller could POST any batch of
 *    renames and moves straight to the apply route, using the agent as a thin wrapper around file
 *    mutation with none of the review.
 * 2. **For this engagement, by this user.** A token minted for one engagement must not apply to
 *    another, and one user's approval must not be replayable by a colleague.
 * 3. **Recently, and once.** A stale confirmation can apply a batch against a tree that has since
 *    changed, and a replayed one can apply the same batch twice.
 *
 * Signed rather than stored: a server-side table of pending batches would need expiry sweeping and
 * a write on every run, and the batch is already round-tripping through the client. The payload is
 * signed, not encrypted — it contains nothing the user has not just been shown.
 */

/** Tokens older than this are refused. Long enough to read a batch, short enough to be current. */
const TOKEN_TTL_MS = 15 * 60 * 1000

/**
 * Single-use enforcement.
 *
 * In-memory, so it does not survive a restart or span instances — a token could in principle be
 * replayed against a different instance within its TTL. Accepted deliberately: the damage ceiling
 * is applying an already-approved batch a second time, where renames are idempotent and moves are
 * no-ops once the file has arrived. A shared store would be the fix if that changes.
 */
const consumed = new Map<string, number>()

function sweep(now: number): void {
    for (const [id, expiry] of Array.from(consumed.entries())) {
        if (expiry < now) consumed.delete(id)
    }
}

function secret(): string {
    // Falls back to the Supabase service key rather than inventing a new required env var: it is
    // already present everywhere this runs, and already the most sensitive value in the process.
    const key = process.env.AI_AGENT_TOKEN_SECRET
        ?? process.env.SUPABASE_SERVICE_ROLE_KEY
        ?? ''
    if (!key) throw new Error('No secret available to sign agent approval tokens')
    return key
}

interface TokenPayload {
    jti: string
    engagementId: string
    userId: string
    /** One fingerprint per proposal, so any subset may be applied but none may be altered. */
    digests: string[]
    issuedAt: number
}

/** Canonical form of one proposal — its target and its effect, nothing else. */
function canonical(p: Proposal): string {
    return p.kind === 'rename' ? `r:${p.externalId}:${p.proposedName}`
        : p.kind === 'move' ? `m:${p.externalId}:${p.destinationFolderId}`
        : `f:${p.parentId ?? 'root'}:${p.name}`
}

/**
 * Fingerprints ONE proposal.
 *
 * Per item rather than per batch, because partial approval is the normal case: the user unticks
 * two of twelve renames and applies the rest. A whole-batch digest would reject that, since the
 * applied list no longer matches the signed one. Signing each item lets the applier submit any
 * subset while still catching an item whose target or effect was altered after review.
 */
export function digestProposal(p: Proposal): string {
    return createHmac('sha256', secret()).update(canonical(p)).digest('hex').slice(0, 16)
}

/** The set of item digests carried in a token. */
export function digestProposals(proposals: Proposal[]): string[] {
    return proposals.map(digestProposal).sort()
}

function sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const mac = createHmac('sha256', secret()).update(body).digest('base64url')
    return `${body}.${mac}`
}

/** Mints a token for a batch the user is about to be shown. */
export function issueApprovalToken(params: {
    engagementId: string
    userId: string
    proposals: Proposal[]
}): string {
    return sign({
        jti: randomUUID(),
        engagementId: params.engagementId,
        userId: params.userId,
        digests: digestProposals(params.proposals),
        issuedAt: Date.now(),
    })
}

export type VerifyFailure =
    | 'malformed' | 'bad-signature' | 'expired' | 'already-used' | 'wrong-engagement'
    | 'wrong-user' | 'altered-batch'

export type VerifyResult =
    | { ok: true }
    | { ok: false; reason: VerifyFailure }

/**
 * Verifies a token against the batch being applied, and consumes it.
 *
 * Consumes only on success: a token rejected for a reason the caller can fix (a stale batch, the
 * wrong user) should not also be burned.
 */
export function verifyApprovalToken(params: {
    token: string
    engagementId: string
    userId: string
    proposals: Proposal[]
}): VerifyResult {
    const parts = params.token.split('.')
    if (parts.length !== 2) return { ok: false, reason: 'malformed' }

    const [body, mac] = parts
    const expected = createHmac('sha256', secret()).update(body).digest('base64url')

    // Constant-time, and length-checked first because timingSafeEqual throws on a length mismatch.
    const a = Buffer.from(mac)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { ok: false, reason: 'bad-signature' }
    }

    let payload: TokenPayload
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    } catch {
        return { ok: false, reason: 'malformed' }
    }

    const now = Date.now()
    if (now - payload.issuedAt > TOKEN_TTL_MS) return { ok: false, reason: 'expired' }
    if (payload.engagementId !== params.engagementId) return { ok: false, reason: 'wrong-engagement' }
    if (payload.userId !== params.userId) return { ok: false, reason: 'wrong-user' }

    // Every item being applied must be one that was signed. Approving fewer is expected; applying
    // something that was never reviewed is the attack this exists to stop.
    const signed = new Set(payload.digests ?? [])
    const allSigned = params.proposals.length > 0
        && params.proposals.every((p) => signed.has(digestProposal(p)))
    if (!allSigned) return { ok: false, reason: 'altered-batch' }

    sweep(now)
    if (consumed.has(payload.jti)) return { ok: false, reason: 'already-used' }
    consumed.set(payload.jti, payload.issuedAt + TOKEN_TTL_MS)

    return { ok: true }
}
