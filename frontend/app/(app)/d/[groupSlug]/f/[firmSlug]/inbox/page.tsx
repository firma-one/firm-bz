import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/utils/supabase/server"
import { InboxView } from "@/components/inbox/inbox-view"

/**
 * New UI unified Inbox for one firm (.claude/plans/ui-ux-overhaul.md, Phase 4). Shows only the
 * caller's own notifications and reminders; it still requires firm membership so the URL can't be
 * used to learn a firm's name.
 */
export default async function InboxPage({ params }: { params: Promise<{ groupSlug: string; firmSlug: string }> }) {
    const { firmSlug } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) notFound()

    const firm = await prisma.firm.findUnique({ where: { slug: firmSlug }, select: { id: true, name: true } })
    if (!firm) notFound()
    const member = await prisma.firmMember.findFirst({ where: { userId: user.id, firmId: firm.id }, select: { id: true } })
    if (!member) notFound()

    return <InboxView firmId={firm.id} firmName={firm.name} />
}
