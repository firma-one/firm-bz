"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { getShellSidebarData, type ShellSidebarData } from "@/lib/actions/shell"
import { getInboxCounts, type InboxCounts } from "@/lib/actions/inbox"
import { INBOX_CHANGED_EVENT } from "@/components/inbox/inbox-items"
import { useSidebarFirms } from "@/lib/sidebar-firms-context"
import { useViewAs } from "@/lib/view-as-context"

/**
 * Shared data for the New UI shell (sidebar, header breadcrumbs, workspace switcher).
 *
 * The "current firm" is the one in the URL; on firm-less pages (/d/u/*, /d/support, /d/billing)
 * it falls back to the user's default firm so the sidebar keeps its navigation.
 */

export type ShellFirm = {
    id: string
    name: string
    slug: string
    groupSlug?: string | null
    groupName?: string | null
    isDefault?: boolean
    logoUrl?: string | null
    isFirmAdmin?: boolean
}

type ShellDataValue = {
    firms: ShellFirm[]
    /** Firm and group from the URL, or the default firm on firm-less pages. */
    firmSlug: string | null
    groupSlug: string | null
    /** True when the firm comes from the URL rather than the default-firm fallback. */
    firmInUrl: boolean
    data: ShellSidebarData | null
    loading: boolean
    /** Firm-level can_manage, with View As applied. */
    canManage: boolean
    /** Unread Inbox items per firm id (platform-wide notifications already added to each). */
    inboxCountFor: (firmId: string | null | undefined) => number
    /** Unread items across all the user's firms plus platform-wide ones — the cross-firm Inbox's badge. */
    inboxTotal: number
    refresh: () => void
}

const ShellDataContext = createContext<ShellDataValue | null>(null)

const FIRM_PATH = /^\/d\/([^/]+)\/f\/([^/]+)/

export function ShellDataProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname() ?? ""
    const firms = (useSidebarFirms() ?? []) as ShellFirm[]
    const { isViewAsActive, effectivePermissions } = useViewAs()

    const match = pathname.match(FIRM_PATH)
    // On firm-less pages (the cross-firm Home and Inbox, Profile) the sidebar stays on the firm the
    // user was last in, not the default firm, so stepping back to Home doesn't swap the sidebar.
    // Derived during render — React's pattern for state kept from earlier renders.
    const [lastUrlFirm, setLastUrlFirm] = useState<string | null>(null)
    if (match && match[2] !== lastUrlFirm) setLastUrlFirm(match[2])
    const fallbackFirm =
        firms.find((f) => f.slug === lastUrlFirm) ?? firms.find((f) => f.isDefault) ?? firms[0] ?? null
    const firmSlug = match?.[2] ?? fallbackFirm?.slug ?? null
    const groupSlug = match?.[1] ?? fallbackFirm?.groupSlug ?? null

    const [data, setData] = useState<ShellSidebarData | null>(null)
    const [loading, setLoading] = useState(true)
    const [orgCanManage, setOrgCanManage] = useState(false)
    const requestId = useRef(0)
    const [inboxCounts, setInboxCounts] = useState<InboxCounts>({ byFirm: {}, platform: 0 })

    const loadCounts = useCallback(async () => {
        const counts = await getInboxCounts().catch(() => null)
        if (counts) setInboxCounts(counts)
    }, [])

    // Badges: on load, whenever the Inbox changes something, and every minute.
    useEffect(() => {
        void loadCounts()
        const onChange = () => void loadCounts()
        window.addEventListener(INBOX_CHANGED_EVENT, onChange)
        const id = setInterval(onChange, 60_000)
        return () => {
            window.removeEventListener(INBOX_CHANGED_EVENT, onChange)
            clearInterval(id)
        }
    }, [loadCounts])

    const load = useCallback(async () => {
        if (!firmSlug) {
            setData(null)
            setLoading(false)
            return
        }
        const id = ++requestId.current
        setLoading(true)
        const [sidebar, perms] = await Promise.all([
            getShellSidebarData(firmSlug).catch(() => null),
            fetch(`/api/permissions/firm?firmSlug=${encodeURIComponent(firmSlug)}`)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null),
        ])
        if (id !== requestId.current) return
        setData(sidebar)
        setOrgCanManage(perms?.canManage === true)
        setLoading(false)
    }, [firmSlug])

    useEffect(() => {
        void load()
    }, [load])

    // Same refresh signals the legacy sidebar listens to, plus bookmark changes for Favorites.
    useEffect(() => {
        const refresh = () => void load()
        window.addEventListener("pockett:refresh-firms", refresh)
        window.addEventListener("pockett-bookmarks-updated", refresh)
        return () => {
            window.removeEventListener("pockett:refresh-firms", refresh)
            window.removeEventListener("pockett-bookmarks-updated", refresh)
        }
    }, [load])

    const canManage = isViewAsActive && effectivePermissions ? effectivePermissions.canManage : orgCanManage

    const value = useMemo<ShellDataValue>(
        () => ({
            firms,
            firmSlug,
            groupSlug,
            firmInUrl: Boolean(match),
            data,
            loading,
            canManage,
            inboxCountFor: (firmId) => (firmId ? (inboxCounts.byFirm[firmId] ?? 0) + inboxCounts.platform : 0),
            inboxTotal: firms.reduce((n, f) => n + (inboxCounts.byFirm[f.id] ?? 0), inboxCounts.platform),
            refresh: () => void load(),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [firms, firmSlug, groupSlug, Boolean(match), data, loading, canManage, load, inboxCounts]
    )

    return <ShellDataContext.Provider value={value}>{children}</ShellDataContext.Provider>
}

export function useShellData(): ShellDataValue {
    const ctx = useContext(ShellDataContext)
    if (!ctx) throw new Error("useShellData must be used within ShellDataProvider")
    return ctx
}
