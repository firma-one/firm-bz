import { redirect } from 'next/navigation'

/**
 * Previously an unconditional redirect to the bare firm page — a dead URL with no linkable
 * address for connector setup. Document Storage lives inside the firm settings page's collapsible
 * sections (FirmSettingsForm), which already supports deep-linking to a specific section via
 * ?section=storage (see components/projects/firm-clients-view.tsx's initialSection wiring). This
 * route now lands directly on that section instead of the settings page's default view.
 */
export default async function ConnectorsRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/d/f/${slug}?tab=settings&section=storage`)
}
