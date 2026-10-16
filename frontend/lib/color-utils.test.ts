import { describe, it, expect } from 'vitest'
import { brandAccentTokens, contrastRatioAgainstWhite, hexToHsl } from './color-utils'

const hslToHex = (hsl: string) => {
    const [h, s, l] = hsl.replace(/%/g, '').split(' ').map(Number)
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
    const f = (n: number) => {
        const k = (n + h / 30) % 12
        const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
        return Math.round(c * 255).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
}

describe('brandAccentTokens', () => {
    it('keeps a brand color that already reads on white', () => {
        // Navy passes 4.5:1 as is.
        expect(brandAccentTokens('#1e3a8a').action).toBe('224 64% 33%')
    })

    it('darkens a light brand color, keeping its hue, until white text and links pass 4.5:1', () => {
        const { action, hover, fg } = brandAccentTokens('#f5c518') // a bright yellow
        const [hue, sat] = hexToHsl('#f5c518')
        expect(action.startsWith(`${hue} ${sat}% `)).toBe(true)
        expect(contrastRatioAgainstWhite(hslToHex(action))).toBeGreaterThanOrEqual(4.5)
        expect(Number(hover.split(' ')[2].replace('%', ''))).toBeLessThan(Number(action.split(' ')[2].replace('%', '')))
        expect(fg).toBe('0 0% 100%')
    })

    it('gives the adjusted color as r, g, b too', () => {
        expect(brandAccentTokens('#1e3a8a').rgb).toMatch(/^\d+, \d+, \d+$/)
    })
})
