import { NextResponse } from 'next/server'

/*
 * Serving user-uploaded images (firm logo, client brand logo) from the app's own origin
 * (.claude/plans/access-gates.md, P0 #9).
 *
 * Both logo routes are public — the URLs go into <img> tags and emails — and used to answer with
 * whatever Content-Type was stored: an SVG with <script>, or a brand logo stored as a
 * `data:text/html` URL, ran as the app for anyone who opened the link. Now:
 *   - raster images are served only when their bytes really are PNG/JPEG/GIF/WebP, as that type;
 *   - SVG is served as SVG with a sandboxing CSP, so opened directly it can't run script (in an
 *     <img> it never could);
 *   - anything else is refused;
 *   - every response carries `nosniff` and the sandbox CSP.
 */

const SANDBOX_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    'Content-Disposition': 'inline; filename="logo"',
}

/** The image type the bytes actually are, or null. */
export function sniffImageType(buf: Uint8Array, declaredType?: string | null): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml' | null {
    const b = buf
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
    if ((declaredType ?? '').toLowerCase() === 'image/svg+xml') {
        const head = Buffer.from(b.subarray(0, 512)).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase()
        if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml'
    }
    return null
}

export function safeImageResponse(buf: ArrayBuffer | Uint8Array, declaredType?: string | null, cacheControl = 'public, max-age=3600'): NextResponse {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    const type = sniffImageType(bytes, declaredType)
    if (!type) {
        return NextResponse.json({ error: 'Not an image' }, { status: 415, headers: { 'X-Content-Type-Options': 'nosniff' } })
    }
    return new NextResponse(bytes as unknown as BodyInit, {
        status: 200,
        headers: { 'Content-Type': type, 'Cache-Control': cacheControl, ...SANDBOX_HEADERS },
    })
}
