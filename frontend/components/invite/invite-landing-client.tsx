
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ShieldCheck } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { acceptInvitationAction } from "@/lib/actions/invitations"
import type { VerifyInvitationResult } from "@/lib/actions/invitations"

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

export function InviteLandingClient({ invitation, userEmail }: InviteLandingProps) {
    const router = useRouter()
    const [status, setStatus] = useState<'IDLE' | 'JOINING' | 'REDIRECTING' | 'ERROR'>('IDLE')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const processInvitation = async () => {
            // Give a small delay for UX so it doesn't flash too fast? 
            // Or just instant. Instant is better.

            if (invitation.status === 'JOINED') {
                setStatus('REDIRECTING')
                const target = 'redirectUrl' in invitation && invitation.redirectUrl ? invitation.redirectUrl : '/d'
                if (userEmail) router.push(target)
                else router.push(`/signin?redirect=${encodeURIComponent(target)}&email=${encodeURIComponent(invitation.email)}`)
                return
            }

            // Invitation is ACCEPTED (because server verifies PENDING -> ACCEPTED)
            if (!userEmail) {
                // Not logged in -> Signup
                setStatus('REDIRECTING')
                const returnUrl = `/invite/${invitation.token}`
                router.replace(`/signup?next=${encodeURIComponent(returnUrl)}&email=${encodeURIComponent(invitation.email)}`)
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
                setError(`This invitation was sent to ${invitation.email}, but you are logged in as ${userEmail}. Please sign out.`)
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
                    throw new Error(('error' in result ? result.error : null) || "Failed to join project")
                }
            } catch (e: any) {
                console.error("Auto-join error", e)
                setError(e.message)
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
                    <h2 className="text-lg font-bold text-slate-900 mb-2">Invitation Error</h2>
                    <p className="text-slate-600 mb-6">{error}</p>
                    <div className="flex flex-col gap-3">
                        <Button
                            onClick={() => router.push('/api/auth/signout')}
                            variant="outline"
                        >
                            Sign Out
                        </Button>
                        <Button
                            onClick={() => window.location.reload()}
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            Retry
                        </Button>
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
