import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The old top bar (shown on onboarding only): its notification controls say when they fail, and a
 * failed load isn't "No notifications". They used to swallow every failure.
 */

const { addToast, auth } = vi.hoisted(() => ({ addToast: vi.fn(), auth: { user: { id: 'u1', email: 'pat@acme.test', user_metadata: {} } } }))
// Mounted on onboarding today, where it skips loading the list; the load is checked on a firm page.
let pathname = '/d/onboarding'
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children, ...rest }: any) => <a {...rest}>{children}</a> }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))
vi.mock('@/components/Logo', () => ({ default: () => null }))
vi.mock('@/components/app/ai-credits-indicator', () => ({ AiCreditsIndicator: () => null }))
vi.mock('@/components/app/reminders-panel', () => ({ RemindersPanel: () => null }))
vi.mock('@/components/app/command-palette', () => ({ CommandPalette: () => null }))

import { AppTopbar } from './app-topbar'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
    addToast.mockReset()
    pathname = '/d/onboarding'
})
afterEach(() => vi.unstubAllGlobals())

describe('AppTopbar notifications', () => {
    it('a failed load says it couldn’t load, not "No notifications"', async () => {
        pathname = '/d/acme-group/f/acme'
        vi.stubGlobal('fetch', vi.fn(async (url: string) => (
            String(url).startsWith('/api/notifications') ? json({ error: 'Something went wrong on our side. Try again.' }, 500) : json({})
        )))
        render(<AppTopbar />)
        fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
        expect(await screen.findByText("Couldn't load notifications")).toBeTruthy()
        expect(screen.queryByText('No notifications')).toBeNull()
    })

    it('Clear all that the server refuses says so', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if (String(url).startsWith('/api/notifications') && init?.method === 'PATCH') return json({ error: 'Something went wrong on our side. Try again.' }, 500)
            if (String(url).startsWith('/api/notifications')) return json({ notifications: [], unreadCount: 0 })
            return json({})
        }))
        render(<AppTopbar />)
        fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
        fireEvent.click(await screen.findByTitle('Clear all notifications'))
        await waitFor(() => expect(addToast).toHaveBeenCalledWith({
            type: 'error',
            title: "Couldn't clear notifications",
            message: 'Something went wrong on our side. Try again.',
        }))
    })
})
