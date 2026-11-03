"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

/**
 * Sessions → Sign out everyone. Ends every sign-in on the platform except the admin's own
 * (DELETE /api/system/sessions). For a release that needs everyone to sign in again, or a
 * suspected leak — deploys never sign anyone out by themselves.
 */
export function SignOutEveryoneCard() {
    const { addToast } = useToast()
    const [confirming, setConfirming] = useState(false)
    const [working, setWorking] = useState(false)
    const [lastResult, setLastResult] = useState<string | null>(null)

    const run = async () => {
        setWorking(true)
        try {
            const res = await fetch("/api/system/sessions", { method: "DELETE" })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
            const ended = Number(body.ended ?? 0)
            const summary = `${ended} session${ended === 1 ? "" : "s"} ended`
            setLastResult(`${summary} · ${new Date().toLocaleTimeString()}`)
            addToast({ type: "success", title: "Everyone else is signed out", message: `${summary}. Your own sign-in is kept.` })
            setConfirming(false)
        } catch (error) {
            addToast({
                type: "error",
                title: "Couldn't sign everyone out",
                message: error instanceof Error ? error.message : "Please try again.",
            })
        } finally {
            setWorking(false)
        }
    }

    return (
        <div className="rounded-xl p-3 border bg-white border-gray-200 flex flex-col">
            <div className="rounded-lg p-4 border bg-gray-50 border-gray-100 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm border bg-white border-gray-200 text-gray-900">
                    <LogOut className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold leading-none text-gray-900">Sessions</h3>
                </div>
                <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                >
                    Sign out everyone
                </button>
            </div>
            <div className="px-2 pt-4 pb-2 flex items-end justify-between gap-4">
                <p className="text-sm leading-relaxed text-left text-gray-500">
                    Ends every sign-in on the platform except yours, at once: nobody can renew their login,
                    and each person signs in again on their next visit. Use it when a release needs everyone
                    to sign in again, or if a sign-in may have leaked. Deploys never sign anyone out.
                </p>
                {lastResult && <span className="shrink-0 text-xs font-medium text-gray-500 whitespace-nowrap">{lastResult}</span>}
            </div>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                icon={<LogOut className="h-5 w-5" />}
                iconVariant="red"
                title="Sign out everyone?"
                subtitle="Everyone except you, on every device."
                description="Every other user is signed out at once and must sign in again. Pages they already have open keep working for up to an hour, until their current login expires."
                confirmLabel="Sign out everyone"
                confirmVariant="red"
                loading={working}
                onCancel={() => setConfirming(false)}
                onConfirm={() => void run()}
            />
        </div>
    )
}
