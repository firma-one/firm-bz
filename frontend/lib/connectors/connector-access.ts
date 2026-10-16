import 'server-only'

import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/api/engagement-auth'
import { createClient as createCookieClient } from '@/utils/supabase/server'

/*
 * Who may use a storage connector (.claude/plans/access-gates.md, P0 #1–#3).
 *
 * A connector id is not a secret: it travels in API responses and URLs. So every route that reads
 * a connector's token, lists its files or changes its Drive must check the caller's rights on the
 * connector itself, resolved from the database:
 *   - its owner (the account that connected it),
 *   - a firm admin of the firm it belongs to, or
 *   - a manager of a client that uses it (firm admin of the client's firm, or Client Partner).
 * Same rule as `removeConnector` (lib/actions/connectors.ts), which applies it to removal.
 *
 * Takes an explicit user id because API routes authenticate by Bearer token or cookie; this module
 * is server-only, so it is never a callable endpoint.
 */

export class AccessError extends Error {
    constructor(public status: 401 | 403 | 404, message: string) {
        super(message)
    }
}

/** The signed-in user of an API request: Bearer token when sent, else the session cookie. */
export async function getRequestUser(request: NextRequest): Promise<User | null> {
    if (request.headers.get('authorization')?.startsWith('Bearer ')) return getAuthUser(request)
    const supabase = await createCookieClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user ?? null
}

export async function requireRequestUser(request: NextRequest): Promise<User> {
    const user = await getRequestUser(request)
    if (!user) throw new AccessError(401, 'Unauthorized')
    return user
}

export async function isFirmAdmin(userId: string, firmId: string | null | undefined): Promise<boolean> {
    if (!firmId) return false
    const m = await prisma.firmMember.findFirst({ where: { userId, firmId }, select: { role: true } })
    return m?.role === 'firm_admin'
}

/** Firm admin of the client's own firm, or the client's Client Partner. */
export async function isClientManager(userId: string, clientId: string | null | undefined): Promise<boolean> {
    if (!clientId) return false
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { firmId: true } })
    if (!client) return false
    if (await isFirmAdmin(userId, client.firmId)) return true
    const partner = await prisma.clientMember.findFirst({
        where: { userId, clientId, persona: { slug: 'client_admin' } },
        select: { id: true },
    })
    return !!partner
}

export type ManageableConnector = { id: string; userId: string; firmId: string | null; type: string; status: string }

/**
 * The connector when the user may manage it; null when it doesn't exist or they may not.
 * `ownerOrFirmAdmin` drops the client-manager path — for handing out the raw OAuth token, which
 * reaches every file the connector can see, across all of the firm's clients.
 */
export async function getManageableConnector(
    userId: string,
    connectorId: string | null | undefined,
    opts: { ownerOrFirmAdmin?: boolean } = {},
): Promise<ManageableConnector | null> {
    if (!connectorId) return null
    const connector = await prisma.connector.findUnique({
        where: { id: connectorId },
        select: { id: true, userId: true, firmId: true, type: true, status: true },
    })
    if (!connector) return null
    if (connector.userId === userId) return connector
    if (await isFirmAdmin(userId, connector.firmId)) return connector
    if (opts.ownerOrFirmAdmin) return null
    const clients = await prisma.client.findMany({ where: { connectorId }, select: { id: true } })
    for (const c of clients) {
        if (await isClientManager(userId, c.id)) return connector
    }
    return null
}

/**
 * Rights to start a storage connection for `target` (the initiate body): a client connection
 * needs a manager of that client (inside the named firm, when one is named); a firm connection
 * needs a firm admin; replacing a connector needs rights on that connector. Returns an error
 * message, or null when allowed. The OAuth callbacks re-check the same rules.
 */
export async function checkConnectTargetRights(
    userId: string,
    target: { organizationId?: unknown; clientId?: unknown; replaceConnectorId?: unknown },
): Promise<string | null> {
    const firmId = typeof target.organizationId === 'string' && target.organizationId ? target.organizationId : null
    const clientId = typeof target.clientId === 'string' && target.clientId ? target.clientId : null
    const replaceId = typeof target.replaceConnectorId === 'string' && target.replaceConnectorId ? target.replaceConnectorId : null
    if (clientId) {
        const client = await prisma.client.findUnique({ where: { id: clientId }, select: { firmId: true } })
        if (!client || (firmId && client.firmId !== firmId) || !(await isClientManager(userId, clientId))) {
            return 'Only a manager of this client can connect its storage'
        }
    } else if (firmId && !(await isFirmAdmin(userId, firmId))) {
        return 'Only a firm admin can connect firm storage'
    }
    if (replaceId && !(await getManageableConnector(userId, replaceId))) {
        return 'You cannot replace this connection'
    }
    return null
}

/** Throws 404 for both "missing" and "not yours", so connector ids can't be probed. */
export async function requireConnectorManager(
    userId: string,
    connectorId: string | null | undefined,
    opts: { ownerOrFirmAdmin?: boolean } = {},
): Promise<ManageableConnector> {
    if (!connectorId) throw new AccessError(404, 'Connection not found')
    const connector = await getManageableConnector(userId, connectorId, opts)
    if (!connector) throw new AccessError(404, 'Connection not found')
    return connector
}

/** Maps an AccessError to its JSON response body and status; other errors return null. */
export function accessErrorResponse(e: unknown): { body: { error: string; code: string }; status: number } | null {
    if (!(e instanceof AccessError)) return null
    const code = e.status === 401 ? 'UNAUTHORIZED' : e.status === 403 ? 'FORBIDDEN' : 'NOT_FOUND'
    return { body: { error: e.message, code }, status: e.status }
}
