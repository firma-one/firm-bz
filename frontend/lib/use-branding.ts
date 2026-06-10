'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { OrganizationBranding } from '@/components/Logo'

const firmBrandingCache = new Map<string, { branding: OrganizationBranding | null; firmId?: string }>()
const clientBrandingCache = new Map<string, OrganizationBranding | null>()

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

function parseSlugs(pathname: string | null): { firmSlug: string | null; clientSlug: string | null } {
  if (!pathname) return { firmSlug: null, clientSlug: null }
  const firmSlug = pathname.match(/^\/d\/(?:o|f)\/([^/]+)/)?.[1] ?? null
  const clientSlug = pathname.match(/^\/d\/(?:o|f)\/[^/]+\/c\/([^/]+)/)?.[1] ?? null
  return { firmSlug, clientSlug }
}

/**
 * Returns merged branding for the current route.
 * When inside /c/[clientSlug], overlays client Brand on top of firm branding.
 * Firm brand fields are the base; client brand fields override where set.
 */
export function useBranding(): OrganizationBranding | null {
  const { user } = useAuth()
  const pathname = usePathname()
  const [branding, setBranding] = useState<OrganizationBranding | null>(null)
  const currentFirmSlugRef = useRef<string | null>(null)
  const currentClientSlugRef = useRef<string | null>(null)

  const { firmSlug, clientSlug } = parseSlugs(pathname)

  useLayoutEffect(() => {
    if (!pathname?.startsWith('/d') || !firmSlug) return
    const cached = getBrandingFromSession(firmSlug)
    if (cached) setBranding(cached)
  }, [pathname, firmSlug])

  // Clear stale client brand immediately when clientSlug changes
  useLayoutEffect(() => {
    if (clientSlug !== currentClientSlugRef.current) {
      setBranding(null)
    }
  }, [clientSlug])

  useEffect(() => {
    if (!pathname?.startsWith('/d')) {
      setBranding(null)
      currentFirmSlugRef.current = null
      currentClientSlugRef.current = null
      return
    }
    if (!user) {
      setBranding(null)
      currentFirmSlugRef.current = null
      currentClientSlugRef.current = null
      return
    }

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        // --- Firm branding ---
        let firmBranding: OrganizationBranding | null = null
        const firmCacheHit = firmSlug && currentFirmSlugRef.current === firmSlug && firmBrandingCache.has(firmSlug)
        if (firmCacheHit) {
          firmBranding = firmBrandingCache.get(firmSlug!)!.branding
        } else {
          const url = firmSlug ? `/api/firm?slug=${encodeURIComponent(firmSlug)}` : '/api/firm'
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          if (res.ok) {
            const data = await res.json()
            const org = data.organization || data.firm || data
            const b = ((org?.settings as Record<string, unknown>)?.branding as Record<string, string | undefined>) || {}
            firmBranding = (b.logoUrl || b.logoData || b.primaryColor || org?.name)
              ? {
                  logoUrl: b.logoData ?? b.logoUrl ?? null,
                  logoAspectRatio: b.logoAspectRatio ?? null,
                  name: b.name ?? (org?.name as string) ?? null,
                  subtext: b.subtext ?? null,
                  themeColor: b.primaryColor ?? null,
                  secondaryColor: b.secondaryColor ?? null,
                  website: b.website ?? null,
                }
              : null
            if (firmSlug) {
              firmBrandingCache.set(firmSlug, { branding: firmBranding, firmId: org?.id })
              currentFirmSlugRef.current = firmSlug
              setBrandingInSession(firmSlug, firmBranding)
            }
          }
        }

        // --- Client brand overlay ---
        let merged = firmBranding
        if (clientSlug && firmSlug) {
          const clientCacheKey = `${firmSlug}:${clientSlug}`
          let clientBrand: OrganizationBranding | null = null
          const clientCacheHit = currentClientSlugRef.current === clientSlug && clientBrandingCache.has(clientCacheKey)
          if (clientCacheHit) {
            clientBrand = clientBrandingCache.get(clientCacheKey)!
          } else {
            const res = await fetch(
              `/api/clients/brand-by-slug?firmSlug=${encodeURIComponent(firmSlug)}&clientSlug=${encodeURIComponent(clientSlug)}`,
              { headers: { Authorization: `Bearer ${session.access_token}` } }
            )
            if (res.ok) {
              const { brand } = await res.json()
              if (brand) {
                clientBrand = {
                  logoUrl: brand.logoUrl ?? null,
                  logoAspectRatio: brand.logoAspectRatio ?? null,
                  name: brand.name ?? firmBranding?.name ?? null,
                  subtext: brand.subtext ?? firmBranding?.subtext ?? null,
                  themeColor: brand.primaryColor ?? firmBranding?.themeColor ?? null,
                  secondaryColor: brand.secondaryColor ?? firmBranding?.secondaryColor ?? null,
                  website: firmBranding?.website ?? null,
                }
              }
              clientBrandingCache.set(clientCacheKey, clientBrand)
              currentClientSlugRef.current = clientSlug
            }
          }
          if (clientBrand) merged = clientBrand
        } else {
          // Left client context — clear client cache ref
          currentClientSlugRef.current = null
        }

        setBranding(merged)
      } catch {
        // ignore
      }
    }

    load()

    const onBrandingUpdated = () => {
      if (firmSlug) {
        firmBrandingCache.delete(firmSlug)
        currentFirmSlugRef.current = null
      }
      if (clientSlug && firmSlug) {
        clientBrandingCache.delete(`${firmSlug}:${clientSlug}`)
        currentClientSlugRef.current = null
      }
      load()
    }
    window.addEventListener('firm-branding-updated', onBrandingUpdated)
    window.addEventListener('client-branding-updated', onBrandingUpdated)
    return () => {
      window.removeEventListener('firm-branding-updated', onBrandingUpdated)
      window.removeEventListener('client-branding-updated', onBrandingUpdated)
    }
  }, [user, pathname, firmSlug, clientSlug])

  return branding
}

/** @deprecated Use useBranding instead */
export const useFirmBranding = useBranding
