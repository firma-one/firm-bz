import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))

let serverVersion: string | null = '100'

/** The prompt reads the page's build when its module loads, so each test loads it fresh. */
async function mountPrompt(loadedVersion: string | undefined) {
    vi.resetModules()
    if (loadedVersion === undefined) vi.stubEnv('NEXT_PUBLIC_BUILD_TIMESTAMP', '')
    else vi.stubEnv('NEXT_PUBLIC_BUILD_TIMESTAMP', loadedVersion)
    const { NewVersionPrompt } = await import('./new-version-prompt')
    render(<NewVersionPrompt />)
}

/** Brings the tab back into view, which makes the prompt ask the server. */
async function returnToTab() {
    await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
        await new Promise((r) => setTimeout(r, 0))
    })
}

beforeEach(() => {
    addToast.mockReset()
    serverVersion = '100'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ version: serverVersion }) }) as Response))
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

describe('NewVersionPrompt', () => {
    it('stays quiet while the server runs the build this page came from', async () => {
        await mountPrompt('100')
        await returnToTab()
        expect(addToast).not.toHaveBeenCalled()
    })

    it('offers a reload once a new build is deployed, and only once for it', async () => {
        await mountPrompt('100')
        serverVersion = '200'
        await returnToTab()
        await returnToTab()
        expect(addToast).toHaveBeenCalledTimes(1)
        expect(addToast.mock.calls[0][0]).toMatchObject({
            type: 'info',
            title: 'A new version of Firma is available',
            message: 'Reload to get the latest. You stay signed in.',
            action: { label: 'Reload' },
        })
    })

    it('asks at once when a call fails the way stale code does', async () => {
        await mountPrompt('100')
        serverVersion = '200'
        await act(async () => {
            const event = new Event('unhandledrejection') as PromiseRejectionEvent
            Object.defineProperty(event, 'reason', { value: new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.') })
            window.dispatchEvent(event)
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(addToast).toHaveBeenCalledTimes(1)
    })

    it('does nothing in `next dev`, where there is no build version', async () => {
        await mountPrompt(undefined)
        serverVersion = '200'
        await returnToTab()
        expect(fetch).not.toHaveBeenCalled()
    })
})
