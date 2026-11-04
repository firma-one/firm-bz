import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlertTriangle, Clock } from 'lucide-react'
import { ActionList, attentionCount, type ActionItem } from './action-list'

const item = (over: Partial<ActionItem> & Pick<ActionItem, 'key' | 'label' | 'count'>): ActionItem => ({
    severity: 'info',
    icon: Clock,
    ...over,
})

describe('ActionList', () => {
    const delivery = [
        item({ key: 'gaps', label: 'Planning gaps', count: 8, severity: 'warning' }),
        item({ key: 'overdue', label: 'Overdue deliverables', count: 1, severity: 'critical', icon: AlertTriangle }),
        item({ key: 'threads', label: 'Unanswered comments', count: 0 }),
    ]
    const housekeeping = [
        item({ key: 'sensitive', label: 'Sensitive files', count: 0, severity: 'critical' }),
        item({ key: 'large', label: 'Large files', count: 2 }),
    ]

    it('merges the groups into one list, most severe then largest first', () => {
        render(<ActionList groups={[{ title: 'Delivery', items: delivery }, { title: 'Housekeeping', items: housekeeping }]} />)
        const labels = screen.getAllByText(/Planning gaps|Overdue deliverables|Large files/).map((el) => el.textContent)
        expect(labels).toEqual(['Overdue deliverables', 'Planning gaps', 'Large files'])
        // Group names appear only among the passed checks.
        expect(screen.queryByText('Delivery')).toBeNull()
    })

    it('folds the passed checks into one line that opens them, grouped', () => {
        render(<ActionList groups={[{ title: 'Delivery', items: delivery }, { title: 'Housekeeping', items: housekeeping }]} />)
        const toggle = screen.getByRole('button', { name: /2 checks passed/ })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText('Sensitive files')).toBeNull()
        fireEvent.click(toggle)
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByText('Delivery').parentElement!.textContent).toContain('Unanswered comments')
        expect(screen.getByText('Housekeeping').parentElement!.textContent).toContain('Sensitive files')
    })

    it('says "All clear" on the one line when nothing needs doing', () => {
        render(<ActionList groups={[{ title: 'Delivery', items: [item({ key: 'a', label: 'Overdue', count: 0 })] }]} />)
        expect(screen.getByRole('button', { name: /All clear · 1 check passed/ })).toBeTruthy()
    })

    it('makes only critical work red', () => {
        render(<ActionList groups={[{ title: 'Delivery', items: delivery }]} />)
        const critical = screen.getByText('Overdue deliverables').closest('div.group\\/row')!
        const warning = screen.getByText('Planning gaps').closest('div.group\\/row')!
        expect(critical.innerHTML).toContain('text-danger')
        expect(warning.innerHTML).not.toContain('text-danger')
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
