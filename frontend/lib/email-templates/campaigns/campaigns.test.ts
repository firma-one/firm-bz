// @vitest-environment node
import { existsSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { CAMPAIGN_TEMPLATES, campaignImageUrls, getCampaignTemplate, listCampaignTemplates, renderCampaignTemplate } from './index'

/**
 * The checks every campaign template has to pass. New ones are written by hand and sent to real
 * people with one click, so what can be checked mechanically is checked here.
 */

const ORIGIN = 'https://firma.bz'
/** Gmail clips a message at 102 KB and hides the rest, including the unsubscribe link. */
const GMAIL_CLIP_BYTES = 102 * 1024

describe('the template list', () => {
    it('has unique, slug ids, and lists newest first', () => {
        const ids = CAMPAIGN_TEMPLATES.map((t) => t.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
        const dates = listCampaignTemplates().map((t) => t.createdAt)
        expect(dates).toEqual([...dates].sort().reverse())
    })

    it('finds a template by id and nothing else', () => {
        expect(getCampaignTemplate(CAMPAIGN_TEMPLATES[0].id)).toBe(CAMPAIGN_TEMPLATES[0])
        expect(getCampaignTemplate('no-such-template')).toBeUndefined()
    })
})

describe.each(CAMPAIGN_TEMPLATES.map((t) => [t.id, t] as const))('%s', (id, template) => {
    const html = renderCampaignTemplate(template, ORIGIN)
    const attributes = (pattern: RegExp) => Array.from(html.matchAll(pattern), (m) => m[1].replace(/&amp;/g, '&'))

    it('has the fields the picker shows', () => {
        expect(template.name).not.toBe('')
        expect(template.description).not.toBe('')
        expect(template.subject).not.toBe('')
        expect(template.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('is a full document, so sendEmail does not wrap it in the plain shell', () => {
        expect(html).toMatch(/^<!DOCTYPE html>/)
        expect(html).toMatch(/<html[\s>]/i)
        expect(html.trimEnd()).toMatch(/<\/html>$/)
        expect(html).toContain(template.preheader)
    })

    it('stays under Gmail’s clipping limit', () => {
        expect(Buffer.byteLength(html)).toBeLessThan(GMAIL_CLIP_BYTES)
    })

    it('uses nothing email clients strip', () => {
        expect(html).not.toMatch(/<(svg|script|canvas|video|form)[\s>]/i)
    })

    it('relies on nothing Outlook ignores: gradients only over a solid color, no aligned tables', () => {
        for (const style of html.match(/style="[^"]*linear-gradient[^"]*"/g) ?? []) {
            expect(style).toMatch(/background-color:#[0-9a-f]{6}/i)
            expect(style).not.toContain('background-size')
        }
        expect(html).not.toMatch(/<table[^>]*\salign="right"/)
    })

    it('keeps em dashes out of its copy', () => {
        expect(`${html} ${template.subject} ${template.preheader}`).not.toContain('—')
    })

    it('links only to absolute addresses, tagged with this campaign', () => {
        const links = attributes(/<a\s[^>]*href="([^"]+)"/g)
        expect(links.length).toBeGreaterThan(0)
        for (const link of links) {
            if (link.startsWith('mailto:')) continue
            expect(link.startsWith(`${ORIGIN}/`)).toBe(true)
            expect(new URL(link).searchParams.get('utm_campaign')).toBe(id)
        }
    })

    it('offers a way to opt out', () => {
        expect(html).toMatch(/mailto:[^"]+Unsubscribe/)
    })

    it('gives every image alt text, and every hosted image exists', () => {
        for (const tag of html.match(/<img\s[^>]*>/g) ?? []) expect(tag).toMatch(/\salt="/)
        const images = campaignImageUrls(html)
        expect(images.length).toBeGreaterThan(0)
        for (const src of images) {
            expect(src.startsWith(`${ORIGIN}/email/`)).toBe(true)
            const file = path.join(process.cwd(), 'public', new URL(src).pathname)
            expect(existsSync(file), `${src} is missing from public/`).toBe(true)
        }
    })
})
