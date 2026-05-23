'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AuthService } from '@/lib/auth-service'
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { supabase } from '@/lib/supabase'
import { CheckCircle2 } from 'lucide-react'

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'

function CallbackContent() {
    const searchParams = useSearchParams()
    const [firstName, setFirstName] = useState('')
    const [navTarget] = useState(() => {
        const next = searchParams.get('next')
        return (next && next.startsWith('/')) ? next : '/d/onboarding?choice=1'
    })
    const [countdown, setCountdown] = useState(5)
    const [skipReady, setSkipReady] = useState(false)

    useEffect(() => {
        const data = AuthService.getOnboardingData()
        if (data?.firstName) setFirstName(data.firstName)
        AuthService.clearOnboardingData()
    }, [])

    useEffect(() => {
        if (countdown <= 0) {
            window.location.href = navTarget
            return
        }
        const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
        return () => clearTimeout(t)
    }, [countdown, navTarget])

    useEffect(() => {
        const t = setTimeout(() => setSkipReady(true), 1500)
        return () => clearTimeout(t)
    }, [])

    const handleSkip = async () => {
        await supabase.auth.signOut()
        window.location.href = '/'
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f0edee]">
            <div className="w-full max-w-sm mx-auto px-6">
                <div className="bg-white border border-black/[0.06] shadow-[0_24px_60px_-16px_rgba(27,27,29,0.14)] px-8 py-10 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#72ff70]/15">
                            <CheckCircle2 className="h-8 w-8 text-[#006e16]" strokeWidth={1.5} />
                        </div>
                    </div>
                    <div className="text-center space-y-1">
                        <h2 className={`text-2xl font-bold tracking-tight text-[#1b1b1d] ${H}`}>
                            You&apos;re in{firstName ? `, ${firstName}` : ''}!
                        </h2>
                        <p className="text-sm text-[#45474c]">Auto redirecting to Onboarding&hellip;</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { if (skipReady) void handleSkip() }}
                        disabled={!skipReady}
                        className={`${H} relative w-full overflow-hidden rounded-md bg-slate-800 px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-slate-700 active:bg-slate-900 disabled:pointer-events-none`}
                    >
                        <span
                            className="pointer-events-none absolute inset-y-0 left-0 bg-white/10 transition-[width] duration-1000 ease-linear"
                            style={{ width: `${((5 - countdown) / 5) * 100}%` }}
                        />
                        <span className="relative flex items-center justify-between">
                            <span>Skip onboarding for now</span>
                            <span className="tabular-nums font-normal opacity-50">{countdown}s</span>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function OnboardingCallbackPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>}>
            <CallbackContent />
        </Suspense>
    )
}
