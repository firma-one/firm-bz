'use client'

import { useEffect } from 'react'
import { useBranding } from '@/lib/use-branding'
import { brandAccentTokens } from '@/lib/color-utils'

const HEX = /^#[0-9a-f]{6}$/i

const ACCENT_VARS = [
    '--ui-action',
    '--ui-action-hover',
    '--ui-action-fg',
    '--primary',
    '--primary-foreground',
    '--primary-rgb',
    '--ring',
] as const

/**
 * Puts the firm's brand color (or, on a client's pages, the client's) on the New UI accent:
 * primary buttons, links, selected states, and the older styles that still read --primary.
 * The legacy top bar did this for v1; the New UI shell never did, so branding stopped reaching
 * any color once v1 was retired.
 *
 * The color goes through brandAccentTokens, which darkens a brand color too light to read on white
 * (keeping its hue) until it reaches 4.5:1, so a pale brand never makes buttons or links illegible.
 * The values are set inline on <html> with priority "important". ui-tokens.css pins --primary
 * and --ring with !important so the raw, unchecked brand color that the root layout's pre-paint
 * script and the legacy top bar write can't reach the New UI; an inline !important outranks that
 * pin, so only this checked color gets through. Pages without a firm in the URL (the cross-firm
 * Home and Inbox) and firms without a brand color keep the default accent.
 */
export function useBrandAccent(): void {
    const branding = useBranding()
    const color = branding?.themeColor ?? null

    useEffect(() => {
        const root = document.documentElement
        const clear = () => ACCENT_VARS.forEach((name) => root.style.removeProperty(name))
        if (!color || !HEX.test(color)) {
            clear()
            return
        }
        const t = brandAccentTokens(color)
        const set = (name: (typeof ACCENT_VARS)[number], value: string) => root.style.setProperty(name, value, 'important')
        set('--ui-action', t.action)
        set('--ui-action-hover', t.hover)
        set('--ui-action-fg', t.fg)
        set('--primary', t.action)
        set('--primary-foreground', t.fg)
        set('--primary-rgb', t.rgb)
        set('--ring', t.action)
        return clear
    }, [color])
}
