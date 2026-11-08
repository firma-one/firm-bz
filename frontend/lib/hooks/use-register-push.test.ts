import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/*
 * The push switch follows what the server stored (OT-1, P2-29): a refused subscribe is taken back in
 * the browser and says why; a refused unsubscribe keeps the switch On and says why.
 */

import { useRegisterPush } from './use-register-push'

const fetchMock = vi.fn()
let current: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null = null
const newSubscription = () => ({
    endpoint: 'https://push.example/abc',
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn(async () => { current = null; return true }),
})
const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => { current = newSubscription(); return current }),
}
const requestPermission = vi.fn(async () => 'granted')

beforeEach(() => {
    vi.clearAllMocks()
    current = null
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U')
    Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true })
    vi.stubGlobal('Notification', Object.assign(function Notification() {}, { permission: 'default', requestPermission }))
    Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: vi.fn(async () => ({})), ready: Promise.resolve({ pushManager }) },
        configurable: true,
    })
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

async function mounted() {
    const hook = renderHook(() => useRegisterPush())
    await waitFor(() => expect(hook.result.current.subscribed).not.toBeNull())
    return hook
}

describe('useRegisterPush', () => {
    it('turns on when the server stores the subscription', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
        const { result } = await mounted()
        let answer: unknown
        await act(async () => { answer = await result.current.subscribe() })
        expect(answer).toEqual({ ok: true })
        expect(result.current.subscribed).toBe(true)
        expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({ method: 'POST' }))
    })

    it('stays off, takes the browser subscription back and says why when the server refuses (OT-1)', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
        const { result } = await mounted()
        let answer: unknown
        await act(async () => { answer = await result.current.subscribe() })
        expect(answer).toEqual({ ok: false, error: 'Unauthorized' })
        expect(result.current.subscribed).toBe(false)
        expect(current).toBeNull() // unsubscribed in the browser too
    })

    it('says notifications are blocked when permission is denied', async () => {
        requestPermission.mockResolvedValueOnce('denied')
        const { result } = await mounted()
        let answer: { ok: boolean; error?: string } | undefined
        await act(async () => { answer = await result.current.subscribe() })
        expect(answer?.ok).toBe(false)
        expect(answer?.error).toMatch(/blocked for this site/)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('says the browser could not set it up, not the push service\'s own words', async () => {
        pushManager.subscribe.mockRejectedValueOnce(Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError' }))
        const { result } = await mounted()
        let answer: { ok: boolean; error?: string } | undefined
        await act(async () => { answer = await result.current.subscribe() })
        expect(answer).toEqual({ ok: false, error: "This browser couldn't set up notifications. Try again, or try another browser." })
    })

    it('keeps the switch on and says why when turning off is refused (P2-29)', async () => {
        current = newSubscription()
        fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
        const { result } = await mounted()
        expect(result.current.subscribed).toBe(true)
        let answer: unknown
        await act(async () => { answer = await result.current.unsubscribe() })
        expect(answer).toEqual({ ok: false, error: 'The server answered 500. Try again.' })
        expect(result.current.subscribed).toBe(true)
        expect(current).not.toBeNull() // still subscribed in the browser, as on the server
    })

    it('turns off once the server forgets the subscription', async () => {
        current = newSubscription()
        const held = current
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
        const { result } = await mounted()
        await act(async () => { await result.current.unsubscribe() })
        expect(result.current.subscribed).toBe(false)
        expect(held.unsubscribe).toHaveBeenCalled()
    })
})
