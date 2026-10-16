import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlertTriangle, Clock, Inbox } from 'lucide-react'
import { ActionSection, attentionCount, type ActionItem } from './action-list'

const item = (over: Partial<ActionItem> & Pick<ActionItem, 'key' | 'label' | 'count'>): ActionItem => ({
    severity: 'info',
    icon: Clock,
    ...over,
})

describe('ActionSection', () => {
    it('lists rows needing attention most severe first, then largest', () => {
        render(
            <ActionSection
                title="Follow-ups"
                icon={Inbox}
                items={[
                    item({ key: 'a', label: 'Upcoming', count: 9 }),
                    item({ key: 'b', label: 'Overdue', count: 1, severity: 'critical', icon: AlertTriangle }),
                    item({ key: 'c', label: 'Waiting', count: 4, severity: 'warning' }),
                ]}
            />,
        )
        const labels = screen.getAllByText(/Upcoming|Overdue|Waiting/).map((el) => el.textContent)
        expect(labels).toEqual(['Overdue', 'Waiting', 'Upcoming'])
    })

    it('folds rows at zero into one line that opens them', () => {
        render(
            <ActionSection
                title="Documents"
                icon={Inbox}
                items={[
                    item({ key: 'a', label: 'Sensitive files', count: 2, severity: 'critical' }),
                    item({ key: 'b', label: 'Large files', count: 0 }),
                    item({ key: 'c', label: 'Sharing alerts', count: 0 }),
                ]}
            />,
        )
        expect(screen.queryByText('Large files')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /2 with nothing to do/ }))
        expect(screen.getByText('Large files')).toBeTruthy()
        expect(screen.getByText('Sharing alerts')).toBeTruthy()
    })

    it('says "All clear" when nothing needs attention, instead of a count', () => {
        render(<ActionSection title="Follow-ups" icon={Inbox} items={[item({ key: 'a', label: 'Overdue', count: 0 })]} />)
        expect(screen.getByText('All clear')).toBeTruthy()
    })

    it('opens a drill-down from a row with work, but not from a row at zero', () => {
        const onSelect = vi.fn()
        render(
            <ActionSection
                title="Follow-ups"
                icon={Inbox}
                items={[
                    item({ key: 'a', label: 'Overdue', count: 3, onSelect }),
                    item({ key: 'b', label: 'Upcoming', count: 0, onSelect }),
                ]}
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: /Overdue/ }))
        expect(onSelect).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: /1 with nothing to do/ }))
        expect(screen.queryByRole('button', { name: /^Upcoming/ })).toBeNull()
    })
})

describe('attentionCount', () => {
    it('counts rows above zero across groups', () => {
        expect(attentionCount(
            [item({ key: 'a', label: 'A', count: 2 }), item({ key: 'b', label: 'B', count: 0 })],
            [item({ key: 'c', label: 'C', count: 1 })],
        )).toBe(2)
    })
})
