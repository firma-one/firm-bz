import { verifyInvitation } from "@/lib/actions/invitations"
import { InviteLandingClient, InviteUnavailable } from "@/components/invite/invite-landing-client"
import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"

interface PageProps {
    params: Promise<{
        token: string
    }>
}

export default async function InvitePage({ params }: PageProps) {
    const { token } = await params

    if (!token) notFound()

    // 1. Verify Token & Fetch Invite Data
    let invite
    try {
        invite = await verifyInvitation(token)
    } catch (e: any) {
        const errorMessage = e?.message || 'Unknown error'

        // A token that doesn't exist stays a 404: nothing is revealed about tokens that don't exist.
        // (A revoked invitation is deleted, so it reads the same way.)
        if (errorMessage.includes('Invalid token')) notFound()

        // This token was real and has run out: say so, rather than "Page not found" (P1-17).
        if (errorMessage.includes('expired')) return <InviteUnavailable reason="expired" />

        // Anything else failed whatever the token was (the database, say), so saying so reveals
        // nothing about it; a 404 here told someone with a good link that it was dead.
        console.error("Invite Page Error:", e)
        return <InviteUnavailable reason="unavailable" />
    }

    if (!invite) notFound()

    // SUPERSEDED: the member joined and was later removed, so the old link is withdrawn. Say so
    // rather than trying to join again.
    if (invite.status === 'SUPERSEDED') return <InviteUnavailable reason="withdrawn" />

    // 2. Get Current User (if any)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // 3. Render Client Component
    return (
        <InviteLandingClient
            invitation={invite}
            userEmail={user?.email}
        />
    )
}
