/**
 * The tab a secure open shows while Firma checks or grants access (.claude/plans/secure-open-tab.md).
 *
 * `useSecureOpenDocument` opens `/open#…` on the click, so the browser allows it, and runs the grant
 * itself; the page only shows what's happening. The two talk over a BroadcastChannel named by a key
 * that's random for each open. The page decides nothing about access and never navigates anywhere
 * on its own: the hook alone points the tab at the document, from the grant's answer.
 *
 * The file name and provider ride in the hash, which never reaches the server or its logs. They are
 * display text only.
 */

export const SECURE_OPEN_PATH = '/open'

export type SecureOpenProvider = 'onedrive' | 'google'

export interface HoldingTabInfo {
    /** Names this open's channel. */
    key: string
    fileName: string
    mimeType?: string
    provider?: SecureOpenProvider
}

/** What the hook tells the page. */
export type HoldingTabState =
    | { state: 'waiting' }
    /** Access is ready and the tab is moving to the document. */
    | { state: 'done'; provider?: SecureOpenProvider }
    /** `retry`: worth asking again (a timeout or a network failure), so the page offers Try again. */
    | { state: 'error'; reason: string; retry: boolean }

export type HoldingTabMessage =
    | ({ type: 'state' } & HoldingTabState)
    /** Page → hook: mounted (or reloaded), send the latest state. */
    | { type: 'ready' }
    /** Page → hook: Try again. */
    | { type: 'retry' }

const KEY_PATTERN = /^[a-z0-9]{8,64}$/
const MAX_NAME = 300
const MAX_MIME = 120

export function holdingTabChannelName(key: string): string {
    return `firma-secure-open:${key}`
}

/** A fresh channel key; not a secret, only unique. */
export function newHoldingTabKey(): string {
    const bytes = new Uint8Array(12)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function holdingTabUrl(info: HoldingTabInfo): string {
    const params = new URLSearchParams({ k: info.key, n: info.fileName.slice(0, MAX_NAME) })
    if (info.mimeType) params.set('m', info.mimeType.slice(0, MAX_MIME))
    if (info.provider) params.set('p', info.provider)
    return `${SECURE_OPEN_PATH}#${params.toString()}`
}

/** The page's reading of its own hash; null when it isn't one the hook wrote. */
export function parseHoldingTabHash(hash: string): HoldingTabInfo | null {
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    const key = params.get('k') ?? ''
    const fileName = (params.get('n') ?? '').trim().slice(0, MAX_NAME)
    if (!KEY_PATTERN.test(key) || !fileName) return null
    const p = params.get('p')
    const m = params.get('m')
    return {
        key,
        fileName,
        mimeType: m ? m.slice(0, MAX_MIME) : undefined,
        provider: p === 'onedrive' || p === 'google' ? p : undefined,
    }
}

/** The provider's own name, for "opening it in OneDrive". */
export function providerName(provider: SecureOpenProvider): string {
    return provider === 'onedrive' ? 'OneDrive' : 'Google Drive'
}

/** Where the file lives, under its name. */
export function providerPlace(provider: SecureOpenProvider): string {
    return provider === 'onedrive' ? 'OneDrive · SharePoint' : 'Google Drive'
}

/** The connector type the app stores (`ONEDRIVE`, `GOOGLE_DRIVE`) as a provider; unknown stays unknown. */
export function providerFromConnectorType(type: string | null | undefined): SecureOpenProvider | undefined {
    if (!type) return undefined
    if (type === 'ONEDRIVE') return 'onedrive'
    if (type === 'GOOGLE_DRIVE') return 'google'
    return undefined
}
