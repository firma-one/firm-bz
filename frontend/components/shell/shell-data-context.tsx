"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { getShellSidebarData, type ShellSidebarData } from "@/lib/actions/shell"
import { getInboxCounts, type InboxCounts } from "@/lib/actions/inbox"
import { INBOX_CHANGED_EVENT } from "@/components/inbox/inbox-items"
import { useVisiblePoll } from "@/lib/hooks/use-visible-poll"
import { useSidebarFirms } from "@/lib/sidebar-firms-context"
import { useViewAs } from "@/lib/view-as-context"
import { failureFrom, failureReason } from "@/lib/files/action-failure"

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
    /**
     * Set when the sidebar's data failed to load, so the sidebar says it couldn't load rather than
     * "No active engagements yet." `refresh` tries again.
     */
    loadFailed: boolean
    /** Firm-level can_manage, with View As applied. */
    canManage: boolean
    /**
     * Why the caller's permissions didn't load, when they didn't. `canManage` is false then, which
     * would hide Settings and Members from an admin as though they lacked access; the sidebar says so.
     */
    permissionsError: string | null
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
    const [loadFailed, setLoadFailed] = useState(false)
    const [orgCanManage, setOrgCanManage] = useState(false)
    const [permissionsError, setPermissionsError] = useState<string | null>(null)
    const requestId = useRef(0)
    const [inboxCounts, setInboxCounts] = useState<InboxCounts>({ byFirm: {}, platform: 0 })

    const loadCounts = useCallback(async () => {
        const counts = await getInboxCounts().catch(() => null)
        if (counts) setInboxCounts(counts)
    }, [])

    // Badges: on load, whenever the Inbox changes something, and whenever the tab is brought
    // back. The timer behind it is only a backstop for a tab left open and in front for hours,
    // so it runs every five minutes rather than every minute — getInboxCounts fans out across
    // the user's firms, reminders and work, which is far too much to spend once a minute on a
    // badge that changes a few times a day.
    useEffect(() => {
        const onChange = () => void loadCounts()
        window.addEventListener(INBOX_CHANGED_EVENT, onChange)
        return () => window.removeEventListener(INBOX_CHANGED_EVENT, onChange)
    }, [loadCounts])

    useVisiblePoll(loadCounts, 5 * 60_000)

    // Moving around the app refreshes the badge too, so someone actively working sees a count
    // that keeps up with them rather than one that waits for the backstop above. The first
    // pathname is skipped: useVisiblePoll has already loaded once on mount.
    const countedPath = useRef<string | null>(null)
    useEffect(() => {
        if (countedPath.current === null) { countedPath.current = pathname; return }
        if (countedPath.current === pathname) return
        countedPath.current = pathname
        void loadCounts()
    }, [pathname, loadCounts])

    const load = useCallback(async () => {
        if (!firmSlug) {
            setData(null)
            setLoading(false)
            return
        }
        const id = ++requestId.current
        setLoading(true)
        const [sidebar, perms] = await Promise.all([
            getShellSidebarData(firmSlug).then((d) => ({ ok: true as const, d }), () => ({ ok: false as const })),
            fetch(`/api/permissions/firm?firmSlug=${encodeURIComponent(firmSlug)}`)
                .then(async (r) => {
                    if (!r.ok) throw await failureFrom(r)
                    return { ok: true as const, d: await r.json() as { canManage?: boolean } }
                })
                .catch((e: unknown) => ({ ok: false as const, reason: failureReason(e) })),
        ])
        if (id !== requestId.current) return
        // A failed refresh keeps what the sidebar already shows for this firm; another firm's data
        // is never left standing in for it.
        if (sidebar.ok) setData(sidebar.d)
        else setData((prev) => (prev?.firm.slug === firmSlug ? prev : null))
        setLoadFailed(!sidebar.ok)
        setOrgCanManage(perms.ok ? perms.d.canManage === true : false)
        setPermissionsError(perms.ok ? null : perms.reason)
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
            loadFailed,
            canManage,
            permissionsError,
            inboxCountFor: (firmId) => (firmId ? (inboxCounts.byFirm[firmId] ?? 0) + inboxCounts.platform : 0),
            inboxTotal: firms.reduce((n, f) => n + (inboxCounts.byFirm[f.id] ?? 0), inboxCounts.platform),
            refresh: () => void load(),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [firms, firmSlug, groupSlug, Boolean(match), data, loading, loadFailed, canManage, permissionsError, load, inboxCounts]
    )

    return <ShellDataContext.Provider value={value}>{children}</ShellDataContext.Provider>
}

export function useShellData(): ShellDataValue {
    const ctx = useContext(ShellDataContext)
    if (!ctx) throw new Error("useShellData must be used within ShellDataProvider")
    return ctx
}

/** The shell data, or null outside the app shell (onboarding, the /tour demo) — for chrome mounted in both. */
export function useOptionalShellData(): ShellDataValue | null {
    return useContext(ShellDataContext)
}
