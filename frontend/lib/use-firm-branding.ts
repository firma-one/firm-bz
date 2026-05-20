'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { OrganizationBranding } from '@/components/Logo'

const brandingCache = new Map<string, { branding: OrganizationBranding | null; firmId?: string }>()
const SESSION_STORAGE_KEY = (slug: string) => `fm_firm_branding_${slug}`

function getBrandingFromSession(slug: string | null): OrganizationBranding | null {
  if (typeof window === 'undefined' || !slug) return null
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY(slug))
    return raw ? (JSON.parse(raw) as OrganizationBranding) : null
  } catch {
    return null
  }
}

function setBrandingInSession(slug: string, branding: OrganizationBranding | null): void {
  if (typeof window === 'undefined' || !slug) return
  try {
    if (branding) sessionStorage.setItem(SESSION_STORAGE_KEY(slug), JSON.stringify(branding))
    else sessionStorage.removeItem(SESSION_STORAGE_KEY(slug))
  } catch {
    // ignore
  }
}

/**
 * Returns firm branding for the current route (from pathname slug).
 * Uses same cache/sessionStorage as AppTopbar so overlay can show custom branding.
 */
export function useFirmBranding(): OrganizationBranding | null {
  const { user } = useAuth()
  const pathname = usePathname()
  const [branding, setBranding] = useState<OrganizationBranding | null>(null)
  const currentSlugRef = useRef<string | null>(null)

  const slug = pathname?.match(/^\/d\/(?:o|f)\/([^/]+)/)?.[1] ?? null

  useLayoutEffect(() => {
    if (!pathname?.startsWith('/d') || !slug) return
    const cached = getBrandingFromSession(slug)
    if (cached) setBranding(cached)
  }, [pathname, slug])

  useEffect(() => {
    if (!pathname?.startsWith('/d')) {
      setBranding(null)
      currentSlugRef.current = null
      return
    }
    if (!user) {
      setBranding(null)
      currentSlugRef.current = null
      return
    }
    if (slug && currentSlugRef.current === slug && brandingCache.has(slug)) {
      setBranding(brandingCache.get(slug)!.branding)
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
        const org = data.organization || data.firm || data
        const settings = (org?.settings as Record<string, unknown>) || {}
        const b = (settings.branding as Record<string, string | undefined>) || {}

        // Read exclusively from settings.branding
        const brandingData: OrganizationBranding | null =
          (b.logoUrl || b.primaryColor || org?.name)
            ? {
                logoUrl: b.logoUrl ?? null,
                name: (org?.name as string) ?? null,
                subtext: b.subtext ?? null,
                themeColor: b.primaryColor ?? null,
                secondaryColor: b.secondaryColor ?? null,
              }
            : null
        setBranding(brandingData)
        if (slug) {
          brandingCache.set(slug, { branding: brandingData, firmId: org?.id })
          currentSlugRef.current = slug
          setBrandingInSession(slug, brandingData)
        }
      } catch {
        // ignore
      }
    }
    load()
    const onBrandingUpdated = () => {
      if (slug) {
        brandingCache.delete(slug)
        currentSlugRef.current = null
      }
      load()
    }
    window.addEventListener('firm-branding-updated', onBrandingUpdated)
    return () => window.removeEventListener('firm-branding-updated', onBrandingUpdated)
  }, [user, pathname, slug])

  return branding
}
