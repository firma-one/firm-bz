
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ShieldCheck } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { acceptInvitationAction } from "@/lib/actions/invitations"
import type { VerifyInvitationResult } from "@/lib/actions/invitations"
import { useAuth } from "@/lib/auth-context"

interface InviteLandingProps {
    invitation: VerifyInvitationResult
    userEmail?: string | null
}

function inviteTitle(invitation: VerifyInvitationResult): string {
    switch (invitation.type) {
        case 'firm':
            return invitation.firm.name
        case 'client':
            return `${invitation.client.name} • ${invitation.firm.name}`
        case 'engagement':
            return `${invitation.project.name} • ${invitation.persona.organization.name}`
    }
}

function joinLabel(invitation: VerifyInvitationResult): string {
    switch (invitation.type) {
        case 'firm':
            return 'Joining Firm...'
        case 'client':
            return 'Joining Client...'
        case 'engagement':
            return 'Joining Engagement...'
    }
}

/** What the invite page says instead of joining. */
export type InviteUnavailableReason = 'expired' | 'withdrawn' | 'unavailable'

const UNAVAILABLE_COPY: Record<InviteUnavailableReason, { title: string; body: string }> = {
    expired: {
        title: 'This invitation has expired',
        body: 'Ask whoever invited you to send a new one.',
    },
    withdrawn: {
        title: 'This invitation is no longer active',
        body: 'Your access was removed after you joined. Ask whoever invited you to send a new invitation.',
    },
    unavailable: {
        title: "Couldn't open this invitation",
        body: 'Something went wrong on our side. Try again in a minute.',
    },
}

/**
 * An invitation that can't be used, said plainly instead of a 404 (P1-17). Only for a token that
 * exists (or a failure that happens whatever the token): an unknown token still gets the 404, so
 * nothing is revealed about tokens that don't exist.
 */
export function InviteUnavailable({ reason }: { reason: InviteUnavailableReason }) {
    const copy = UNAVAILABLE_COPY[reason]
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
            <div role="alert" className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md w-full text-center">
                <div className="mx-auto h-12 w-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mb-4">
                    <ShieldCheck className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 mb-2">{copy.title}</h2>
                <p className="text-slate-600 mb-6">{copy.body}</p>
                {reason === 'unavailable' ? (
                    <Button onClick={() => window.location.reload()} className="bg-slate-900 hover:bg-slate-800 text-white">
                        Try again
                    </Button>
                ) : null}
            </div>
        </div>
    )
}

/**
 * The words for a failed join. The action answers whatever it caught, Prisma text included (P2-56):
 * only the reasons written for people pass through.
 */
export function joinFailureMessage(raw: string | null | undefined): string {
    const m = (raw ?? '').trim()
    if (/^This invitation is for /.test(m)) return m
    if (/^Invitation expired$/i.test(m)) return 'This invitation has expired. Ask whoever invited you to send a new one.'
    if (/already joined/i.test(m)) return "You've already joined. Open the app to find it."
    if (/currently accepting this invitation/i.test(m)) return 'This invitation is being accepted already. Wait a moment, then try again.'
    if (/^Inviting members is restricted/.test(m)) return m
    return "Couldn't join just now. Try again."
}

export function InviteLandingClient({ invitation, userEmail }: InviteLandingProps) {
    const router = useRouter()
    const { signOut } = useAuth()
    const [status, setStatus] = useState<'IDLE' | 'JOINING' | 'REDIRECTING' | 'ERROR'>('IDLE')
    const [error, setError] = useState<string | null>(null)
    /** Signed in as someone else: the fix is to sign out, then back in as the invitee. */
    const [wrongAccount, setWrongAccount] = useState(false)
    const [signingOut, setSigningOut] = useState(false)

    /**
     * The app's own sign-out (this browser only), then back to sign-in with the invitee's address
     * and this invite as the destination. There is no `/api/auth/signout` (P1-18).
     */
    const signOutAndReturn = async () => {
        setSigningOut(true)
        try {
            await signOut()
        } catch (e) {
            console.error("Invite sign-out failed", e)
            setError("Couldn't sign you out just now. Try again.")
            setSigningOut(false)
            return
        }
        const returnUrl = `/invite/${invitation.token}`
        // Email in the fragment, never the query string (see below).
        window.location.href = `/signin?next=${encodeURIComponent(returnUrl)}#email=${encodeURIComponent(invitation.email)}`
    }

    useEffect(() => {
        const processInvitation = async () => {
            // Give a small delay for UX so it doesn't flash too fast? 
            // Or just instant. Instant is better.

            if (invitation.status === 'JOINED') {
                setStatus('REDIRECTING')
                const target = 'redirectUrl' in invitation && invitation.redirectUrl ? invitation.redirectUrl : '/d'
                if (userEmail) router.push(target)
                // Email goes in the fragment, never the query string — it is never sent over HTTP,
                // so it stays out of request logs and Referer. use-sign-in-flow.ts reads it there.
                else router.push(`/signin?redirect=${encodeURIComponent(target)}#email=${encodeURIComponent(invitation.email)}`)
                return
            }

            // Invitation is ACCEPTED (because server verifies PENDING -> ACCEPTED)
            if (!userEmail) {
                setStatus('REDIRECTING')
                const returnUrl = `/invite/${invitation.token}`
                // Fragment, not query string — see the JOINED branch above.
                router.replace(`/signin?next=${encodeURIComponent(returnUrl)}#email=${encodeURIComponent(invitation.email)}`)
                return
            }

            // Logged In -> Accept/Join
            // Verify user matches email? 
            // "if invitees click on the link first time or on same email link again... redirect to signup"
            // If logged in user != invite email, we should technically warn.
            // But if we want auto-join, we might just join the current user?
            // "wrong account" check is good practice. 
            // Logic: "Invite sent to X, you are Y". 
            // If strict: Show error.
            if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
                setError(`This invitation was sent to ${invitation.email}, but you're signed in as ${userEmail}. Sign out, then sign in as ${invitation.email}.`)
                setWrongAccount(true)
                setStatus('ERROR')
                return
            }

            setStatus('JOINING')
            try {
                const result = await acceptInvitationAction(invitation.token)
                if (result.success && 'redirectUrl' in result && result.redirectUrl) {
                    setStatus('REDIRECTING')
                    router.replace(result.redirectUrl)
                } else {
                    setError(joinFailureMessage('error' in result ? result.error : null))
                    setStatus('ERROR')
                }
            } catch (e: any) {
                console.error("Auto-join error", e)
                setError(joinFailureMessage(e?.message))
                setStatus('ERROR')
            }
        }

        processInvitation()
    }, [invitation, userEmail, router])

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md w-full text-center">
                    <div className="mx-auto h-12 w-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mb-4">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mb-2">
                        {wrongAccount ? 'Signed in as someone else' : "Couldn't join"}
                    </h2>
                    <p role="alert" className="text-slate-600 mb-6">{error}</p>
                    <div className="flex flex-col gap-3">
                        {wrongAccount ? (
                            <Button
                                onClick={() => void signOutAndReturn()}
                                disabled={signingOut}
                                className="bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {signingOut ? 'Signing out…' : 'Sign out'}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => window.location.reload()}
                                className="bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                Try again
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white relative overflow-hidden">
            <div className="relative z-10 flex flex-col items-center bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <LoadingSpinner size="md" className="mb-4" />
                <h1 className="text-xl font-semibold text-slate-900">
                    {status === 'JOINING' ? joinLabel(invitation) : 'Processing Invitation...'}
                </h1>
                <p className="text-slate-500 mt-2 text-sm">
                    {inviteTitle(invitation)}
                </p>
            </div>
        </div>
    )
}
