// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest'
import { CAMPAIGN_TEMPLATES, renderCampaignTemplate } from './index'
import { embedCampaignImages } from './embed'

const ORIGIN = 'https://firma.bz'
/** Far under any mail limit; this is here to catch a template growing without anyone noticing. */
const MAX_IMAGE_BYTES = 800 * 1024

afterEach(() => vi.unstubAllGlobals())

describe.each(CAMPAIGN_TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, template) => {
    it('carries every image inside the message, each attached once', async () => {
        const { html, attachments } = await embedCampaignImages(renderCampaignTemplate(template, ORIGIN))

        expect(html).not.toContain(`${ORIGIN}/email/`)
        expect(html).not.toMatch(/src="https?:/)

        const used = Array.from(new Set(Array.from(html.matchAll(/src="cid:([^"]+)"/g), (m) => m[1])))
        const cids = attachments.map((a) => a.cid)
        expect(new Set(cids).size).toBe(cids.length)
        expect([...cids].sort()).toEqual([...used].sort())

        for (const a of attachments) {
            expect(a.contentType).toMatch(/^image\//)
            expect(a.content.length).toBeGreaterThan(0)
            expect(a.cid).toMatch(/^[a-zA-Z0-9.-]+@firma\.bz$/)
        }
    })

    it('stays small enough to send to every recipient', async () => {
        const { attachments } = await embedCampaignImages(renderCampaignTemplate(template, ORIGIN))
        expect(attachments.reduce((sum, a) => sum + a.content.length, 0)).toBeLessThan(MAX_IMAGE_BYTES)
    })
})

const page = (src: string) => `<html><body><img src="${src}" alt="" /></body></html>`

describe('when an image isn’t on disk', () => {
    it('falls back to the live site', async () => {
        const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }))
        vi.stubGlobal('fetch', fetchMock)
        const { html, attachments } = await embedCampaignImages(page(`${ORIGIN}/email/not-on-disk/pic.png`))
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(attachments[0].content.length).toBe(3)
        expect(attachments[0].filename).toBe('pic.png')
        expect(html).toContain('src="cid:not-on-disk-pic.png@firma.bz"')
    })

    it('refuses rather than sending a hole, when the site doesn’t have it either', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/html' } })))
        await expect(embedCampaignImages(page(`${ORIGIN}/email/not-on-disk/pic.png`))).rejects.toThrow('/email/not-on-disk/pic.png')
    })

    it('refuses a format it can’t label', async () => {
        await expect(embedCampaignImages(page(`${ORIGIN}/email/pic.svg`))).rejects.toThrow('/email/pic.svg')
    })
})
