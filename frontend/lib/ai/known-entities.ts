import 'server-only'
import { prisma } from '@/lib/prisma'
import { loadPeople } from '@/lib/files/file-creator'
import { isAgentEmail } from './agent-email'
import { buildVault, type KnownEntity, type Vault } from './pseudonymize'

/**
 * Who and what Brio's placeholders stand for (lib/ai/pseudonymize.ts): the people, clients and firms we
 * already know by name, from the database. Nothing here goes anywhere; it only says what to replace.
 *
 * - An engagement's request knows its firm (and group), its client and the client's contacts, and the
 *   people on it, on its client and in its firm: anyone a note or a message there might name.
 * - A firm's request (firm chat, the Firm brief) knows every client, contact and person in the firm.
 * - Home's brief spans the firms a person is in: everything in each of them.
 *
 * Brio's own account is never one of them, so "Brio" stays "Brio" in what the model reads.
 */

/** The firm's switch: Settings › Brio › "Replace names, emails and links before Brio reads", on by default. */
export async function maskingEnabled(firmId: string): Promise<boolean> {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
    const brio = (firm?.settings as { brio?: { maskNames?: unknown } } | null)?.brio
    return brio?.maskNames !== false
}

/** People by user id, named as the app names them; Brio's agent account and anyone unnamed left out. */
async function peopleOf(userIds: string[]): Promise<KnownEntity[]> {
    const people = await loadPeople(userIds)
    const out: KnownEntity[] = []
    people.forEach((p, id) => {
        if (isAgentEmail(p.email) || !p.name || p.name === p.email) return
        out.push({ kind: 'person', id, name: p.name })
    })
    return out
}

/** A firm and its group, by name. */
async function firmAndGroup(firmId: string): Promise<KnownEntity[]> {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true, groupId: true } })
    if (!firm) return []
    const group = firm.groupId ? await prisma.group.findUnique({ where: { id: firm.groupId }, select: { id: true, name: true } }) : null
    return [
        { kind: 'firm', id: firm.id, name: firm.name },
        ...(group && group.name !== firm.name ? [{ kind: 'firm' as const, id: group.id, name: group.name }] : []),
    ]
}

/** What an engagement's request knows by name. */
export async function engagementEntities(engagementId: string): Promise<KnownEntity[]> {
    const engagement = await prisma.engagement.findUnique({ where: { id: engagementId }, select: { firmId: true, clientId: true } })
    if (!engagement) return []
    const { firmId, clientId } = engagement
    const [firm, client, contacts, engagementMembers, clientMembers, firmMembers] = await Promise.all([
        firmAndGroup(firmId),
        clientId ? prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }) : null,
        clientId ? prisma.clientContact.findMany({ where: { clientId }, select: { id: true, name: true } }) : [],
        prisma.engagementMember.findMany({ where: { engagementId }, select: { userId: true } }),
        clientId ? prisma.clientMember.findMany({ where: { clientId }, select: { userId: true } }) : [],
        prisma.firmMember.findMany({ where: { firmId }, select: { userId: true } }),
    ])
    const people = await peopleOf([...engagementMembers, ...clientMembers, ...firmMembers].map((m) => m.userId))
    return [
        ...firm,
        ...(client ? [{ kind: 'client' as const, id: client.id, name: client.name }] : []),
        ...contacts.map((c): KnownEntity => ({ kind: 'person', id: c.id, name: c.name })),
        ...people,
    ]
}

/** What a firm's request knows by name: all of it. */
export async function firmEntities(firmId: string): Promise<KnownEntity[]> {
    const [firm, clients, contacts, firmMembers, clientMembers, engagementMembers] = await Promise.all([
        firmAndGroup(firmId),
        prisma.client.findMany({ where: { firmId }, select: { id: true, name: true } }),
        prisma.clientContact.findMany({ where: { firmId }, select: { id: true, name: true } }),
        prisma.firmMember.findMany({ where: { firmId }, select: { userId: true } }),
        prisma.clientMember.findMany({ where: { client: { firmId } }, select: { userId: true } }),
        prisma.engagementMember.findMany({ where: { engagement: { firmId } }, select: { userId: true } }),
    ])
    const people = await peopleOf([...firmMembers, ...clientMembers, ...engagementMembers].map((m) => m.userId))
    return [
        ...firm,
        ...clients.map((c): KnownEntity => ({ kind: 'client', id: c.id, name: c.name })),
        ...contacts.map((c): KnownEntity => ({ kind: 'person', id: c.id, name: c.name })),
        ...people,
    ]
}

/** The vault for an engagement's request, or null when its firm turned masking off. */
export async function vaultForEngagement(engagementId: string, firmId: string): Promise<Vault | null> {
    if (!(await maskingEnabled(firmId))) return null
    return buildVault(await engagementEntities(engagementId))
}

/**
 * The vault for a request across one or more firms (firm chat, the Firm brief, Home's brief), or null when
 * every one of them turned masking off. Masking more than a firm asked for is harmless; less isn't.
 */
export async function vaultForFirms(firmIds: readonly string[]): Promise<Vault | null> {
    const ids = Array.from(new Set(firmIds.filter(Boolean)))
    if (ids.length === 0) return null
    const enabled = await Promise.all(ids.map((id) => maskingEnabled(id)))
    if (!enabled.some(Boolean)) return null
    const all = await Promise.all(ids.map((id) => firmEntities(id)))
    return buildVault(all.reduce<KnownEntity[]>((acc, e) => acc.concat(e), []))
}
