import 'server-only'
import { readFile } from 'fs/promises'
import path from 'path'
import type { EmailAttachment } from '@/lib/email'
import { campaignImageUrls } from './index'

/**
 * Puts a rendered template's images inside the message itself.
 *
 * Hosted images wait behind Outlook's "Download external images" prompt, which is the first thing a
 * prospect would see: no logo, no screens, no slants. Images carried as inline attachments show
 * straight away, and don't depend on what is deployed on the live site. The cost is a message of
 * about 450 KB rather than 35 KB.
 *
 * Only `<img>` can be embedded reliably, because Gmail doesn't render `cid:` in a CSS background.
 * `campaigns.test.ts` keeps templates to that.
 */

const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
}

/**
 * The image's bytes. From disk where they ship with the function (see `outputFileTracingIncludes` in
 * next.config.js) and from the site otherwise, so a tracing change can't silently break sending.
 */
async function loadImage(url: string, pathname: string): Promise<Buffer> {
    const relative = pathname.replace(/^\/email\//, '')
    try {
        return await readFile(path.join(process.cwd(), 'public', 'email', relative))
    } catch {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) {
            throw new Error(`Could not load the email image ${pathname}`)
        }
        return Buffer.from(await res.arrayBuffer())
    }
}

/**
 * Swaps every image URL for a `cid:` reference and returns the attachments that back them. An image
 * used several times, like Brio's sparkle, is attached once. Throws if any image can't be loaded, so
 * nothing goes out with a hole in it.
 */
export async function embedCampaignImages(html: string): Promise<{ html: string; attachments: EmailAttachment[] }> {
    const urls = campaignImageUrls(html)
    const attachments = await Promise.all(urls.map(async (url): Promise<EmailAttachment> => {
        const { pathname } = new URL(url)
        const contentType = CONTENT_TYPES[path.extname(pathname).toLowerCase()]
        if (!contentType) throw new Error(`Can't embed the email image ${pathname}`)
        return {
            filename: path.basename(pathname),
            content: await loadImage(url, pathname),
            contentType,
            cid: `${pathname.replace(/^\/email\//, '').replace(/[^a-zA-Z0-9.-]+/g, '-')}@firma.bz`,
        }
    }))
    const embedded = urls.reduce((out, url, i) => out.split(url).join(`cid:${attachments[i].cid}`), html)
    return { html: embedded, attachments }
}
