"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { importLegacyRecents, recordVisit } from "@/lib/actions/recents"

const SETTLE_MS = 1200
const IMPORTED_KEY = "fm_v2_recents_imported"

/**
 * New UI only: records where the user is (path, tab, query and hash) once they settle on a page,
 * so Home's "Continue" and the sign-in landing can bring them back. Also imports the legacy
 * per-device recents once per browser.
 */
export function useRecordVisits() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const lastRecorded = useRef<string | null>(null)

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null
        const schedule = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                const path = `${window.location.pathname}${window.location.search}${window.location.hash}`
                if (path === lastRecorded.current) return
                lastRecorded.current = path
                void recordVisit(path)
            }, SETTLE_MS)
        }
        schedule()
        window.addEventListener("hashchange", schedule)
        return () => {
            if (timer) clearTimeout(timer)
            window.removeEventListener("hashchange", schedule)
        }
    }, [pathname, searchParams])

    useEffect(() => {
        try {
            if (localStorage.getItem(IMPORTED_KEY)) return
            const items: { href: string; visitedAt: string }[] = []
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (!key?.startsWith("fm_nav_recents_")) continue
                const parsed = JSON.parse(localStorage.getItem(key) || "[]")
                if (Array.isArray(parsed)) {
                    for (const r of parsed) {
                        // Legacy entries store visitedAt as epoch milliseconds.
                        const at = typeof r?.visitedAt === "number" || typeof r?.visitedAt === "string" ? new Date(r.visitedAt) : null
                        if (typeof r?.href === "string" && at && !Number.isNaN(at.getTime())) items.push({ href: r.href, visitedAt: at.toISOString() })
                    }
                }
            }
            localStorage.setItem(IMPORTED_KEY, "1")
            if (items.length) void importLegacyRecents(items)
        } catch {
            // Best-effort: without the import, Home simply starts from the next visit.
        }
    }, [])
}
