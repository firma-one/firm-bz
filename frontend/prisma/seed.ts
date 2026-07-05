import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding baseline data (Simplified RBAC)...')

    // Seed Personas (Platform Schema)
    const personas = [
        { slug: 'sys_admin', displayName: 'System Administrator', description: 'Platform-level administrator with full control across all organizations. Can manage system configuration, users, organizations, billing settings, and platform-wide policies. Typically reserved for the SaaS operator or internal platform team.' },
        { slug: 'firm_admin', displayName: 'Firm Administrator', description: 'Manages a specific firm within the platform. Can manage firm members, create and manage projects, configure firm settings, and control access for users within their firm.' },
        { slug: 'firm_member', displayName: 'Firm Member', description: 'Full-time internal member of the firm with access to firm resources and projects they are assigned to. Typically employees or full-time team members.' },
        { slug: 'client_admin', displayName: 'Client Partner', description: 'Manages a specific client within the firm. Can manage client members and engagements, configure client settings, and control access for the client. Firm admins are automatically added as client partner when a client is created.' },
        { slug: 'eng_admin', displayName: 'Engagement Lead', description: 'Responsible for managing a specific engagement. Can manage engagement members, update engagement content, and oversee collaboration within the engagement workspace. Usually a project manager, engagement lead, or team lead.' },
        { slug: 'eng_member', displayName: 'Contributor (Internal)', description: 'Internal team member contributing to engagement work. Can create and edit engagement content, collaborate with team members, and participate in discussions within assigned engagements. Typically full-time employees or core engagement team members.' },
        { slug: 'eng_ext_collaborator', displayName: 'Contributor (External)', description: 'External collaborator invited to contribute to an engagement. Can create or edit content within the engagement but has limited access outside the engagement scope. Typically contractors, consultants, vendors, or agency partners.' },
        { slug: 'eng_viewer', displayName: 'Reviewer', description: 'External stakeholder with read-only access to engagement content. Cannot modify content but can review materials and stay informed. Typically clients, sponsors, or external stakeholders.' },
    ]
    for (const persona of personas) {
        await (prisma as any).persona.upsert({
            where: { slug: persona.slug },
            update: { displayName: persona.displayName, description: persona.description },
            create: persona,
        })
    }
    console.log(`Seeded ${personas.length} essential personas.`)

    // Backfill docId for existing deliverable folders that don't have one yet.
    // Idempotent: skips any document that already has a docId.
    const CONSONANTS = new Set('bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ')
    function deriveDocIdPrefix(name: string): string {
        const consonants = name.split('').filter((c) => CONSONANTS.has(c))
        const base = consonants.length >= 3
            ? consonants.slice(0, 3).join('').toUpperCase()
            : name.replace(/\s+/g, '').slice(0, 3).toUpperCase()
        return base || 'DOC'
    }

    const deliverableFolders = await prisma.$queryRaw<
        Array<{ id: string; engagement_id: string; engagement_name: string; firm_id: string }>
    >`
        SELECT
            ed.id,
            ed."engagementId" AS engagement_id,
            e.name            AS engagement_name,
            e."firmId"        AS firm_id
        FROM platform.engagement_documents ed
        JOIN platform.engagements e ON e.id = ed."engagementId"
        WHERE ed."docId" IS NULL
        ORDER BY ed."createdAt" ASC
    `

    if (deliverableFolders.length > 0) {
        console.log(`Backfilling docId for ${deliverableFolders.length} document(s)...`)
        for (const doc of deliverableFolders) {
            // Ensure engagement has a docIdPrefix
            const eng = await (prisma as any).engagement.findUnique({
                where: { id: doc.engagement_id },
                select: { docIdPrefix: true },
            })
            if (!eng?.docIdPrefix) {
                const base = deriveDocIdPrefix(doc.engagement_name)
                const existing = await (prisma as any).engagement.findMany({
                    where: { firmId: doc.firm_id, docIdPrefix: { startsWith: base } },
                    select: { docIdPrefix: true },
                })
                const usedPrefixes = new Set(existing.map((e: any) => e.docIdPrefix))
                let prefix = base
                let suffix = 2
                while (usedPrefixes.has(prefix)) { prefix = `${base}${suffix}`; suffix++ }
                await (prisma as any).engagement.update({
                    where: { id: doc.engagement_id },
                    data: { docIdPrefix: prefix },
                })
            }

            // Atomically increment seq and assign docId
            const result = await prisma.$queryRaw<Array<{ seq: number; prefix: string }>>`
                UPDATE platform.engagements
                SET "docIdSeq" = "docIdSeq" + 1
                WHERE id = ${doc.engagement_id}::uuid
                RETURNING "docIdSeq" AS seq, "docIdPrefix" AS prefix
            `
            const { seq, prefix } = result[0]
            const docId = `${prefix}-${seq}`
            await (prisma as any).engagementDocument.update({
                where: { id: doc.id },
                data: { docId },
            })
            console.log(`  ${doc.id} → ${docId} (${doc.engagement_name})`)
        }
        console.log(`docId backfill complete.`)
    }

    // Sandbox/demo hierarchy is created at onboarding time via OnboardingHelper (create-sandbox), not here.
    console.log('Seed completed successfully.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
