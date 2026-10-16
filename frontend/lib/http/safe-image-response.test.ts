import { describe, it, expect } from 'vitest'
import { safeImageResponse } from './safe-image-response'

/** User-uploaded logos served from the app origin (.claude/plans/access-gates.md, P0 #9). */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const svg = (body: string) => new TextEncoder().encode(body)

describe('safeImageResponse', () => {
    it('serves real raster images as their true type, sandboxed and nosniff', () => {
        const res = safeImageResponse(PNG, 'image/jpeg')
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('x-content-type-options')).toBe('nosniff')
        expect(res.headers.get('content-security-policy')).toContain('sandbox')
        expect(safeImageResponse(JPEG, 'image/jpeg').headers.get('content-type')).toBe('image/jpeg')
    })

    it('serves SVG only with the sandboxing CSP, so script in it cannot run', () => {
        const res = safeImageResponse(svg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml')
        expect(res.headers.get('content-type')).toBe('image/svg+xml')
        expect(res.headers.get('content-security-policy')).toMatch(/default-src 'none'.*sandbox/)
    })

    it('refuses HTML however it is labelled', () => {
        expect(safeImageResponse(svg('<html><script>alert(1)</script></html>'), 'text/html').status).toBe(415)
        expect(safeImageResponse(svg('<html><script>alert(1)</script></html>'), 'image/png').status).toBe(415)
        expect(safeImageResponse(svg('<html></html>'), 'image/svg+xml').status).toBe(415)
    })
})
