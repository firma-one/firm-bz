import { redirect } from 'next/navigation'
import { getFirmName } from '@/lib/actions/hierarchy'
import { getShellSidebarData } from '@/lib/actions/shell'
import { canManageOrganization } from '@/lib/permission-helpers'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { clientPath } from '@/lib/navigation/firm-paths'
import { SupportView } from '@/components/support/support-view'

/**
 * Support (.claude/plans/app-design-refinements.md, section 14): the firm's requests to the Firma team,
 * for its firm admins. The table, the request sidebar and New request live in SupportView; this loads
 * who is asking, and the engagements New request can be about.
 */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ firmSlug?: string }>
}) {
  const { firmSlug } = await searchParams

  if (!firmSlug) redirect('/d')

  const firm = await prisma.firm.findUnique({
    where: { slug: firmSlug },
    select: { id: true, group: { select: { slug: true } } },
  })
  if (!firm) redirect('/d')

  const canManage = await canManageOrganization(firm.id)
  if (!canManage) redirect('/d')

  const supabase = await createClient()
  const [{ data: { user } }, firmName, shell] = await Promise.all([
    supabase.auth.getUser(),
    getFirmName(firmSlug),
    getShellSidebarData(firmSlug).catch(() => null),
  ])

  const engagements = (shell?.clients ?? []).flatMap((c) =>
    c.engagements.map((e) => ({ clientSlug: c.slug, clientName: c.name, engagementSlug: e.slug, engagementName: e.name }))
  )

  return (
    <SupportView
      firmSlug={firmSlug}
      firmName={firmName || 'your firm'}
      myEmail={user?.email ?? null}
      engagements={engagements}
      engagementHrefTemplate={`${clientPath(firm.group.slug, firmSlug, '{client}')}/e/{engagement}`}
    />
  )
}
