'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

type OrgSandboxInfo = { sandboxOnly: boolean; orgId?: string }

const sandboxCache = new Map<string, OrgSandboxInfo>()
/** v2: prior keys cached wrong flags because API shape is `{ firm }` not `{ organization }` */
const SESSION_STORAGE_KEY = (slug: string) => `fm_firm_sandbox_v2_${slug}`

function getFromSession(slug: string | null): OrgSandboxInfo | null {
  if (typeof window === 'undefined' || !slug) return null
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY(slug))
    return raw ? (JSON.parse(raw) as OrgSandboxInfo) : null
  } catch {
    return null
  }
}

function setInSession(slug: string, info: OrgSandboxInfo | null): void {
  if (typeof window === 'undefined' || !slug) return
  try {
    if (info) sessionStorage.setItem(SESSION_STORAGE_KEY(slug), JSON.stringify(info))
    else sessionStorage.removeItem(SESSION_STORAGE_KEY(slug))
  } catch {
    // ignore
  }
}

/**
 * Returns sandbox info for the current org (derived from pathname slug).
 * Intended for UI gating; server-side enforcement is still required.
 */
export function useOrgSandbox(): OrgSandboxInfo | null {
  const { user } = useAuth()
  const pathname = usePathname()
  const [info, setInfo] = useState<OrgSandboxInfo | null>(null)
  const currentSlugRef = useRef<string | null>(null)

  // Firm routes use /d/[groupSlug]/f/[firmSlug]
  const slug = pathname?.match(/^\/d\/[^/]+\/f\/([^/]+)/)?.[1] ?? null

  useLayoutEffect(() => {
    if (!pathname?.startsWith('/d') || !slug) return
    const cached = getFromSession(slug)
    if (cached) setInfo(cached)
  }, [pathname, slug])

  useEffect(() => {
    if (!pathname?.startsWith('/d')) {
      setInfo(null)
      currentSlugRef.current = null
      return
    }
    if (!user) {
      setInfo(null)
      currentSlugRef.current = null
      return
    }
    if (slug && currentSlugRef.current === slug && sandboxCache.has(slug)) {
      setInfo(sandboxCache.get(slug)!)
      return
    }

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const url = slug ? `/api/firm?slug=${encodeURIComponent(slug)}` : '/api/firm'
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        })
        if (!res.ok) return
        const data = await res.json()
        const org = data.firm ?? data.organization ?? null
        const loaded: OrgSandboxInfo = {
          sandboxOnly: Boolean(org && typeof org === 'object' && org.sandboxOnly),
          orgId: org && typeof org === 'object' ? org.id : undefined,
        }
        setInfo(loaded)
        if (slug) {
          sandboxCache.set(slug, loaded)
          currentSlugRef.current = slug
          setInSession(slug, loaded)
        }
      } catch {
        // ignore
      }
    }

    load()
    const onSandboxUpdated = () => {
      if (slug) {
        sandboxCache.delete(slug)
        currentSlugRef.current = null
      }
      load()
    }
    window.addEventListener('organization-sandbox-updated', onSandboxUpdated)
    return () => window.removeEventListener('organization-sandbox-updated', onSandboxUpdated)
  }, [user, pathname, slug])

  return info
}

