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
