"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

const VIEW_AS_COOKIE = "fm_view_as"

export type EffectivePermissions = {
  canView: boolean
  canEdit: boolean
  canManage: boolean
  canViewClients: boolean
  canEditClients: boolean
  canManageClients: boolean
  viewAsPersona: string
}

/** Personas available in the View As dropdown (excludes sys_admin). */
export const RBAC_PERSONAS = [
  { slug: "firm_admin", displayName: "Firm Administrator", description: "Manages a specific firm within the platform. Can manage firm members, clients, engagements, and firm-level settings." },
  { slug: "firm_member", displayName: "Firm Member", description: "Full-time internal member of the firm with access to firm resources and projects they are assigned to." },
  { slug: "eng_admin", displayName: "Engagement Lead", description: "Responsible for managing a specific engagement. Can manage engagement members, documents, and settings." },
  { slug: "eng_member", displayName: "Contributor (Internal)", description: "Internal team member contributing to engagement work. Can create and edit documents within assigned engagements." },
  { slug: "eng_ext_collaborator", displayName: "Contributor (External)", description: "External collaborator invited to contribute to an engagement. Can create and edit documents they have been granted access to." },
  { slug: "eng_viewer", displayName: "Reviewer", description: "External stakeholder with read-only access to engagement content. Cannot create or edit documents." },
] as const

type ViewAsContextValue = {
  viewAsPersonaSlug: string | null
  setViewAsPersonaSlug: (slug: string | null) => void
  effectivePermissions: EffectivePermissions | null
  isViewAsActive: boolean
  personas: readonly { slug: string; displayName: string; description?: string }[]
}

const ViewAsContext = createContext<ViewAsContextValue | null>(null)

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? decodeURIComponent(match[2]) : null
}

function setCookie(name: string, value: string | null) {
  if (typeof document === "undefined") return
  const sameSite = "Lax"
  const path = "/"
  if (value) {
    // Session cookie only (no max-age) — resets when user logs out or closes browser
    document.cookie = `${name}=${encodeURIComponent(value)}; path=${path}; SameSite=${sameSite}`
  } else {
    document.cookie = `${name}=; path=${path}; max-age=0; SameSite=${sameSite}`
  }
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [viewAsPersonaSlug, setViewAsPersonaSlugState] = useState<string | null>(null)
  const [effectivePermissions, setEffectivePermissions] = useState<EffectivePermissions | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const isOnboarding = pathname === "/d/onboarding"

  const setViewAsPersonaSlug = useCallback((slug: string | null) => {
    setViewAsPersonaSlugState(slug)
    setCookie(VIEW_AS_COOKIE, slug)
    if (slug) {
      fetch(`/api/rbac/effective-permissions?persona=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setEffectivePermissions(data ?? null))
        .catch(() => setEffectivePermissions(null))
    } else {
      setEffectivePermissions(null)
    }
  }, [])

  useEffect(() => {
    const fromCookie = getCookie(VIEW_AS_COOKIE)
    if (fromCookie && RBAC_PERSONAS.some((p) => p.slug === fromCookie) && !isOnboarding) {
      setViewAsPersonaSlugState(fromCookie)
      fetch(`/api/rbac/effective-permissions?persona=${encodeURIComponent(fromCookie)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setEffectivePermissions(data ?? null))
        .catch(() => setEffectivePermissions(null))
    }
    setHydrated(true)
  }, [isOnboarding])

  const value: ViewAsContextValue = {
    viewAsPersonaSlug,
    setViewAsPersonaSlug,
    effectivePermissions,
    isViewAsActive: hydrated && viewAsPersonaSlug != null,
    personas: RBAC_PERSONAS,
  }

  return (
    <ViewAsContext.Provider value={value}>
      {children}
    </ViewAsContext.Provider>
  )
}

export function useViewAs(): ViewAsContextValue {
  const ctx = useContext(ViewAsContext)
  if (!ctx) {
    return {
      viewAsPersonaSlug: null,
      setViewAsPersonaSlug: () => { },
      effectivePermissions: null,
      isViewAsActive: false,
      personas: RBAC_PERSONAS,
    }
  }
  return ctx
}
