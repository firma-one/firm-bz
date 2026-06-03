'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getCanCreateAdditionalFirm, getFirmCreationGateReasonForCurrentUser } from '@/lib/actions/firms'
import type { FirmCreationGateResult } from '@/lib/billing/firm-creation-gate'

/**
 * Client hook: whether the user may add another non-sandbox firm (subscription gate).
 */
export function useCanCreateAdditionalFirm(userId: string | undefined) {
    const [canCreate, setCanCreate] = useState<boolean | null>(null)
    const [gateResult, setGateResult] = useState<FirmCreationGateResult | null>(null)
    const pathname = usePathname()

    useEffect(() => {
        if (!userId) {
            setCanCreate(null)
            setGateResult(null)
            return
        }
        let cancelled = false
        const load = () => {
            Promise.all([
                getCanCreateAdditionalFirm(),
                getFirmCreationGateReasonForCurrentUser(),
            ]).then(([ok, result]) => {
                if (!cancelled) {
                    setCanCreate(ok)
                    setGateResult(result)
                }
            })
        }
        load()
        return () => {
            cancelled = true
        }
    }, [userId, pathname])

    useEffect(() => {
        if (!userId) return
        const refresh = () => {
            if (document.visibilityState !== 'visible') return
            Promise.all([
                getCanCreateAdditionalFirm(),
                getFirmCreationGateReasonForCurrentUser(),
            ]).then(([ok, result]) => {
                setCanCreate(ok)
                setGateResult(result)
            })
        }
        document.addEventListener('visibilitychange', refresh)
        window.addEventListener('focus', refresh)
        return () => {
            document.removeEventListener('visibilitychange', refresh)
            window.removeEventListener('focus', refresh)
        }
    }, [userId])

    const loadingEntitlement = Boolean(userId) && canCreate === null
    const canCreateAdditionalFirm = canCreate === true

    return { canCreateAdditionalFirm, loadingEntitlement, gateReason: gateResult?.reason ?? null, gateCap: gateResult?.cap ?? null }
}
