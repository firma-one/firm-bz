'use client'

import { useState } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'
import { failureReason } from '@/lib/files/action-failure'

/**
 * "Sign out of all devices". The menu's Sign out ends this browser only, so this is the one place
 * to end every sign-in at once: a lost laptop, a shared computer left signed in.
 */
export function SessionsCard() {
    const { signOutEverywhere } = useAuth()
    const { addToast } = useToast()
    const [confirming, setConfirming] = useState(false)
    const [working, setWorking] = useState(false)

    const run = async () => {
        setWorking(true)
        try {
            await signOutEverywhere()
            window.location.href = '/signin'
        } catch (e) {
            setWorking(false)
            // Why, where known: the request never left, or the server couldn't end the sessions
            // (this browser is still signed in either way, so trying again is safe).
            addToast({
                type: 'error',
                title: "Couldn't sign out of all devices",
                message: e instanceof TypeError
                    ? failureReason(e)
                    : "Something went wrong on our side, so you're still signed in everywhere. Try again.",
            })
        }
    }

    return (
        <section>
            <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Signed-in devices</h3>
            <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0 flex-1">
                    <p className="text-ui font-medium text-fg">Sign out of all devices</p>
                    <p className="mt-0.5 text-small text-fg-muted">
                        Ends your sign-in on every browser and device, this one included. Sign out in
                        the menu ends this browser only.
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)} className="shrink-0">
                    <MonitorSmartphone className="h-3.5 w-3.5" />
                    Sign out everywhere
                </Button>
            </div>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                icon={<MonitorSmartphone className="h-5 w-5" />}
                iconVariant="red"
                title="Sign out of all devices?"
                description="Every browser and device signed in to your account is signed out, this one included. Each will need to sign in again."
                confirmLabel="Sign out everywhere"
                confirmVariant="red"
                loading={working}
                onCancel={() => setConfirming(false)}
                onConfirm={() => void run()}
            />
        </section>
    )
}
