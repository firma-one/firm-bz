/**
 * Returns the "r, g, b" string for use in rgba(var(--primary-rgb), alpha).
 */
export function hexToRgbStr(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

/**
 * Converts a hex color string to HSL components.
 * Returns [hue (0-360), saturation (0-100), lightness (0-100)].
 */
export function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/**
 * Returns a WCAG-safe foreground HSL string ('0 0% 98%' or '0 0% 9%')
 * for text/icons placed on top of a color defined by the given HSL components.
 * Uses WCAG relative luminance (linearized RGB), not HSL L value.
 */
export function getContrastForegroundHsl(h: number, s: number, l: number): string {
  // Convert HSL back to RGB for accurate WCAG luminance
  const sl = s / 100
  const ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * sl
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ll - c / 2

  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }

  // Linearize sRGB channels
  const lin = (v: number) => {
    const n = v + m
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
  }

  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

  // WCAG contrast against white (L=1): (1+0.05)/(L+0.05)
  // Use white text when contrast >= 4.5, else dark text
  const contrastWithWhite = 1.05 / (luminance + 0.05)
  return contrastWithWhite >= 4.5 ? '0 0% 98%' : '0 0% 9%'
}

/**
 * Computes the WCAG contrast ratio of a hex color against white.
 * Used to show accessibility warnings in the color picker.
 */
export function contrastRatioAgainstWhite(hex: string): number {
  const [h, s, l] = hexToHsl(hex)
  const sl = s / 100
  const ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * sl
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ll - c / 2

  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }

  const lin = (v: number) => {
    const n = v + m
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
  }

  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return parseFloat((1.05 / (luminance + 0.05)).toFixed(2))
}

/** WCAG contrast of an HSL color (0-360, 0-100, 0-100) against white. */
function contrastHslAgainstWhite(h: number, s: number, l: number): number {
  const sl = s / 100
  const ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * sl
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ll - c / 2

  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }

  const lin = (v: number) => {
    const n = v + m
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return 1.05 / (luminance + 0.05)
}

/**
 * The New UI accent for a brand color, as "h s% l%" strings for --ui-action, --ui-action-hover and
 * --ui-action-fg. The accent fills primary buttons (with white text) and colors links and selected
 * states on white, so it must reach 4.5:1 against white either way round. A lighter brand color is
 * darkened, keeping its hue and saturation, until it does; a color that already passes is used as
 * is. Hover is a step darker.
 */
export function brandAccentTokens(hex: string): { action: string; hover: string; fg: string; rgb: string } {
  const [h, s, start] = hexToHsl(hex)
  let l = start
  while (l > 0 && contrastHslAgainstWhite(h, s, l) < 4.5) l -= 1
  const hover = Math.max(0, l - 5)
  // The adjusted color as "r, g, b", for rgba(var(--primary-rgb), alpha) in older styles.
  const sl = s / 100, ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * sl
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ll - c / 2
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const to255 = (v: number) => Math.round((v + m) * 255)
  return {
    action: `${h} ${s}% ${l}%`,
    hover: `${h} ${s}% ${hover}%`,
    fg: '0 0% 100%',
    rgb: `${to255(r1)}, ${to255(g1)}, ${to255(b1)}`,
  }
}
