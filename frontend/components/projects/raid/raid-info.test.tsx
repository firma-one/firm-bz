import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { RaidInfo, withRaidInfo } from './raid-info'
import { RaidTypeBadge } from './raid-tab'

/**
 * RAID explained wherever the app says it: an info icon after the term, and each letter's full word on
 * hover, since not everyone knows what R, A, I and D stand for.
 */

afterEach(cleanup)

describe('withRaidInfo', () => {
    it('puts the icon after the first RAID term and keeps the words', () => {
        const { container } = render(<p>{withRaidInfo('Its action items and RAID suggestions wait on it. The RAID log too.')}</p>)
        expect(container.textContent).toBe('Its action items and RAID suggestions wait on it. The RAID log too.')
        expect(screen.getAllByTestId('raid-info')).toHaveLength(1)
        expect(screen.getByText('RAID suggestions').className).toContain('whitespace-nowrap')
    })

    it('leaves text without RAID as it is', () => {
        expect(withRaidInfo('Nothing changes on its own.')).toBe('Nothing changes on its own.')
    })
})

describe('RaidInfo', () => {
    it('says what RAID stands for on hover', async () => {
        render(<RaidInfo />)
        fireEvent.focus(screen.getByRole('button', { name: 'What RAID means' }))
        await waitFor(() => expect(screen.getAllByText(/Risks, Assumptions, Issues and Decisions/).length).toBeGreaterThan(0))
    })

    it('inside a tab or link, is a plain mark rather than a second button', () => {
        render(<button type="button">RAID <RaidInfo nested /></button>)
        expect(screen.getAllByRole('button')).toHaveLength(1)
    })
})

describe('RaidTypeBadge', () => {
    it.each([['RISK', 'Risk'], ['ASSUMPTION', 'Assumption'], ['ISSUE', 'Issue'], ['DECISION', 'Decision']] as const)(
        '%s shows its full word on hover',
        async (type, word) => {
            render(<RaidTypeBadge type={type} decorative />)
            const badge = screen.getByText(word[0]).parentElement as HTMLElement
            fireEvent.pointerMove(badge)
            fireEvent.mouseEnter(badge)
            fireEvent.focus(badge)
            await waitFor(() => expect(screen.getAllByText(word).length).toBeGreaterThan(0))
        },
    )
})
