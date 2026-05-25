/**
 * Central brand configuration. Change the brand name in one place to rebrand across the app.
 */
export const PLATFORM_BRAND_COOKIE = 'platform_brand_name'

const DEFAULT_BRAND_NAME = 'firma'
/** Default platform accent (e.g. UI highlights); override via `NEXT_PUBLIC_PLATFORM_BRAND_COLOR`. */
const DEFAULT_BRAND_COLOR = '#ECC0AA'
/** Darker peach for logo grid + `BrandName` (stronger contrast than `DEFAULT_BRAND_COLOR`). */
const DEFAULT_BRAND_LOGO_COLOR = '#A87562'

const resolveBrandName = (): string => {
  // Use NEXT_PUBLIC_* only so server and client resolve the same value.
  // Falling back to server-only env vars here can cause hydration mismatches.
  const candidates = [
    process.env.NEXT_PUBLIC_PLATFORM_BRAND_NAME,
    process.env.NEXT_PUBLIC_BRAND_NAME,
  ]
  const first = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)
  return (first ?? DEFAULT_BRAND_NAME).trim() || DEFAULT_BRAND_NAME
}

const resolveBrandColor = (): string => {
  const candidates = [
    process.env.NEXT_PUBLIC_PLATFORM_BRAND_COLOR,
    process.env.PLATFORM_BRAND_COLOR,
    process.env.NEXT_PUBLIC_BRAND_COLOR,
    process.env.BRAND_COLOR,
  ]
  const first = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)
  const trimmed = (first ?? DEFAULT_BRAND_COLOR).trim()
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : DEFAULT_BRAND_COLOR
}

const resolveBrandLogoColor = (): string => {
  const candidates = [
    process.env.NEXT_PUBLIC_PLATFORM_BRAND_LOGO_COLOR,
    process.env.NEXT_PUBLIC_BRAND_LOGO_COLOR,
  ]
  const first = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)
  const trimmed = (first ?? DEFAULT_BRAND_LOGO_COLOR).trim()
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : DEFAULT_BRAND_LOGO_COLOR
}

export const BRAND_NAME = resolveBrandName()
export const BRAND_PRIMARY_COLOR = resolveBrandColor()
/** Logo icon + `BrandName` default text color (darker than `BRAND_PRIMARY_COLOR`). */
export const BRAND_LOGO_COLOR = resolveBrandLogoColor()

/**
 * Default wordmark gradient (left → mid → right), same as `BrandName` / `app/icon.svg`.
 * Update `BrandName` Tailwind classes when changing these (JIT cannot see dynamic class names).
 */
export const BRAND_WORDMARK_GRADIENT_STOPS = ["#4d4d4d", "#2d6d3a", "#4aba5e"] as const

/**
 * Wordmark / mark hover gradient — must stay aligned with `BrandName` `hover:` / `group-hover:` stops.
 */
export const BRAND_WORDMARK_GRADIENT_HOVER_STOPS = ["#000000", "#00380c", "#006e16"] as const

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Safe HTML snippet for rich text (e.g. FAQ `displayAnswer`) — matches default BrandName styling.
 */
export function brandNameInlineHtml(): string {
  const [a, b, c] = BRAND_WORDMARK_GRADIENT_STOPS
  return `<span data-brand-name style="font-family:var(--font-kinetic-headline),system-ui,sans-serif;font-weight:700;letter-spacing:-0.02em;background-image:linear-gradient(90deg,${a},${b},${c});-webkit-background-clip:text;background-clip:text;color:transparent">${escapeHtml(BRAND_NAME)}</span>`
}

/** e.g. "Pockett Team" for metadata authors */
export const BRAND_NAME_TEAM = `${BRAND_NAME} Team`
