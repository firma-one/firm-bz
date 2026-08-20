import { redirect } from 'next/navigation'
import { firmSettingsPath } from '@/lib/navigation/firm-paths'

/**
 * Previously an unconditional redirect to the bare firm page — a dead URL with no linkable
 * address for connector setup. Document Storage lives inside the firm settings page's collapsible
 * sections (FirmSettingsForm), which already supports deep-linking to a specific section via
 * ?section=storage (see components/projects/firm-clients-view.tsx's initialSection wiring). This
 * route now lands directly on that section instead of the settings page's default view.
 */
export default async function ConnectorsRedirect({ params }: { params: Promise<{ groupSlug: string; firmSlug: string }> }) {
  const { groupSlug, firmSlug } = await params
  redirect(firmSettingsPath(groupSlug, firmSlug, 'storage'))
}
