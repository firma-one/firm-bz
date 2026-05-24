'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { AuthService } from '@/lib/auth-service'

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'

interface SignupSuccessProps {
    firstName?: string
    navTarget?: string
}

export function SignupSuccess({ firstName: firstNameProp, navTarget = '/d/onboarding?choice=1' }: SignupSuccessProps) {
    const [firstName, setFirstName] = useState(firstNameProp ?? '')
    const [countdown, setCountdown] = useState(8)
    const [skipReady, setSkipReady] = useState(false)

    useEffect(() => {
        if (firstNameProp) return
        const data = AuthService.getOnboardingData()
        if (data?.firstName) setFirstName(data.firstName)
        AuthService.clearOnboardingData()
    }, [firstNameProp])

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

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-300">
            <div className="flex justify-start">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#72ff70]/15">
                    <CheckCircle2 className="h-8 w-8 text-[#006e16]" strokeWidth={1.5} />
                </div>
            </div>
            <div className="text-left">
                <h2 className={`mb-1.5 text-xl font-bold tracking-tight text-[#1b1b1d] ${H}`}>
                    You&apos;re in{firstName ? `, ${firstName}` : ''}!
                </h2>
                <p className="text-sm text-[#45474c]">Auto redirecting to Onboarding&hellip;</p>
            </div>
            <button
                type="button"
                onClick={() => { if (skipReady) window.location.href = '/d' }}
                disabled={!skipReady}
                className={`${H} relative w-full overflow-hidden rounded-md bg-slate-800 px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-slate-700 active:bg-slate-900 disabled:pointer-events-none`}
            >
                <span
                    className="pointer-events-none absolute inset-y-0 left-0 bg-white/10 transition-[width] duration-1000 ease-linear"
                    style={{ width: `${((8 - countdown) / 8) * 100}%` }}
                />
                <span className="relative flex items-center justify-between">
                    <span>Skip onboarding for now</span>
                    <span className="tabular-nums font-normal opacity-50">{countdown}s</span>
                </span>
            </button>
        </div>
    )
}
