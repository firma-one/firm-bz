import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterPill, summarizePicks } from './filter-pill'

describe('FilterPill', () => {
    it('reads as the bare label when empty, with no clear control', () => {
        render(<FilterPill icon={<span />} label="Type" />)
        expect(screen.getByRole('button').textContent).toBe('Type')
        expect(screen.queryByLabelText('Clear Type filter')).toBeNull()
    })

    it('reads "Label: value" when set, and clears without triggering the pill', () => {
        const onClear = vi.fn()
        const onClick = vi.fn()
        render(<FilterPill icon={<span />} label="Client" value="Contoso" onClear={onClear} onClick={onClick} />)
        expect(screen.getByText('Client:')).toBeTruthy()
        expect(screen.getByText('Contoso')).toBeTruthy()
        expect(screen.getByText('Contoso').closest('button')!.className).toContain('text-action')
        fireEvent.click(screen.getByLabelText('Clear Client filter'))
        expect(onClear).toHaveBeenCalled()
        expect(onClick).not.toHaveBeenCalled()
    })

    it('stays neutral for a control that always has a value, like Sort', () => {
        render(<FilterPill icon={<span />} label="Sort" value="Name" neutral />)
        expect(screen.getByRole('button').className).not.toContain('text-action')
    })
})

describe('summarizePicks', () => {
    it('names up to two picks, then counts the rest', () => {
        expect(summarizePicks(['Folders'])).toBe('Folders')
        expect(summarizePicks(['Folders', 'Documents'])).toBe('Folders, Documents')
        expect(summarizePicks(['Folders', 'Documents', 'Images'])).toBe('Folders +2')
    })
})
