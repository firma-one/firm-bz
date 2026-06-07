import { prisma } from '@/lib/prisma'

export type EntityContext = {
    name: string
    slug: string | null
    firmSlug: string | null
    ctaUrl: string | null
}

export type EntityResolver = (id: string) => Promise<EntityContext>

const registry = new Map<string, EntityResolver>()

export function registerEntityResolver(key: string, resolver: EntityResolver): void {
    registry.set(key, resolver)
}

export function resolveEntity(key: string, id: string): Promise<EntityContext> | null {
    // Normalise: "platform.clients.someField" → "platform.clients"
    const tableKey = key.split('.').slice(0, 2).join('.')
    const resolver = registry.get(tableKey)
    return resolver ? resolver(id) : null
}

export function registeredEntityKeys(): string[] {
    return Array.from(registry.keys())
}

// ─── Built-in resolvers ───────────────────────────────────────────────────────

registerEntityResolver('platform.clients', async (id) => {
    const c = await (prisma as any).client.findUnique({
        where: { id },
        select: { name: true, slug: true, firm: { select: { slug: true } } },
    })
    return {
        name: c?.name ?? '',
        slug: c?.slug ?? null,
        firmSlug: c?.firm?.slug ?? null,
        ctaUrl: c?.firm?.slug && c?.slug ? `/d/f/${c.firm.slug}/c/${c.slug}` : null,
    }
})

registerEntityResolver('platform.engagements', async (id) => {
    const e = await (prisma as any).engagement.findUnique({
        where: { id },
        select: { name: true, slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } },
    })
    const firmSlug = e?.client?.firm?.slug ?? null
    const clientSlug = e?.client?.slug ?? null
    return {
        name: e?.name ?? '',
        slug: e?.slug ?? null,
        firmSlug,
        ctaUrl: firmSlug && clientSlug && e?.slug ? `/d/f/${firmSlug}/c/${clientSlug}/e/${e.slug}` : null,
    }
})

registerEntityResolver('platform.engagement_invitations', async (id) => {
    const inv = await (prisma as any).engagementInvitation.findUnique({
        where: { id },
        select: { email: true, engagement: { select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } } } },
    })
    const firmSlug = inv?.engagement?.client?.firm?.slug ?? null
    const clientSlug = inv?.engagement?.client?.slug ?? null
    const engSlug = inv?.engagement?.slug ?? null
    return {
        name: inv?.email ?? '',
        slug: null,
        firmSlug,
        ctaUrl: firmSlug && clientSlug && engSlug ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}` : null,
    }
})

registerEntityResolver('platform.connectors', async (id) => {
    const c = await (prisma as any).connector.findUnique({
        where: { id },
        select: { name: true, settings: true },
    })
    const email = (c?.settings as any)?.accountEmail ?? c?.name ?? 'Google Drive'
    return { name: email, slug: null, firmSlug: null, ctaUrl: '/d/onboarding' }
})

registerEntityResolver('platform.firm_invitations', async (id) => {
    const inv = await (prisma as any).firmInvitation.findUnique({
        where: { id },
        select: { email: true, firm: { select: { slug: true } } },
    })
    const firmSlug = inv?.firm?.slug ?? null
    return {
        name: inv?.email ?? 'Invited member',
        slug: null,
        firmSlug,
        ctaUrl: firmSlug ? `/d/f/${firmSlug}/settings` : null,
    }
})

registerEntityResolver('platform.documents', async (id) => {
    const doc = await (prisma as any).engagementDocument.findUnique({
        where: { id },
        select: {
            name: true,
            engagement: { select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } } },
        },
    })
    const firmSlug = doc?.engagement?.client?.firm?.slug ?? null
    const clientSlug = doc?.engagement?.client?.slug ?? null
    const engSlug = doc?.engagement?.slug ?? null
    return {
        name: doc?.name ?? 'Shared document',
        slug: null,
        firmSlug,
        ctaUrl: firmSlug && clientSlug && engSlug
            ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files`
            : null,
    }
})

registerEntityResolver('platform.doc_comments', async (id) => {
    const c = await (prisma as any).docCommentMessage.findUnique({
        where: { id },
        select: {
            content: true,
            projectDocumentId: true,
            engagement: { select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } } },
        },
    })
    const firmSlug = c?.engagement?.client?.firm?.slug ?? null
    const clientSlug = c?.engagement?.client?.slug ?? null
    const engSlug = c?.engagement?.slug ?? null
    const preview = c?.content?.slice(0, 60) ?? 'Comment'
    return {
        name: preview,
        slug: null,
        firmSlug,
        ctaUrl: firmSlug && clientSlug && engSlug
            ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files#doc-comment:${c?.projectDocumentId}:${id}`
            : null,
    }
})

registerEntityResolver('platform.firms', async (id) => {
    const f = await prisma.firm.findUnique({
        where: { id },
        select: { name: true, slug: true },
    })
    return {
        name: f?.name ?? 'Firm',
        slug: f?.slug ?? null,
        firmSlug: f?.slug ?? null,
        ctaUrl: '/d/billing',
    }
})
