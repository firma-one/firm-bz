import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterPill, summarizePicks } from './filter-pill'
import { FilterMenuRow } from './filter-pill'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './dropdown-menu'

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

describe('FilterPill collapsible', () => {
    it('keeps the label as the name and tooltip, drawing it only where the bar has room', () => {
        render(<FilterPill icon={<span />} label="Visibility" collapsible />)
        const pill = screen.getByRole('button', { name: /Visibility/ })
        expect(pill.getAttribute('title')).toBe('Visibility')
        const label = screen.getByText('Visibility')
        expect(label.className).toContain('sr-only')
        expect(label.className).toContain('@[34rem]/filter-bar:not-sr-only')
    })

    it('shows the chosen value, collapsing only the "Label:" before it', () => {
        render(<FilterPill icon={<span />} label="Visibility" value="Internal notes" collapsible onClear={() => {}} />)
        expect(screen.getByText('Internal notes').className).not.toContain('sr-only')
        expect(screen.getByText('Visibility:').className).toContain('sr-only')
    })

    it('is drawn in full when not collapsible', () => {
        render(<FilterPill icon={<span />} label="People" />)
        expect(screen.getByText('People').className).not.toContain('sr-only')
        expect(screen.getByRole('button').getAttribute('title')).toBeNull()
    })
})

describe('FilterMenuRow markers', () => {
    const openRow = (props: Partial<React.ComponentProps<typeof FilterMenuRow>> = {}) => {
        render(
            <DropdownMenu open>
                <DropdownMenuTrigger>Open</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <FilterMenuRow selected={false} onSelect={() => {}} {...props}>Row</FilterMenuRow>
                </DropdownMenuContent>
            </DropdownMenu>,
        )
    }

    it('leads a single-choice row with a round marker, and says it is one', () => {
        openRow({ selected: true })
        const row = screen.getByRole('menuitemradio', { name: 'Row' })
        expect(row.getAttribute('aria-checked')).toBe('true')
        expect(row.querySelector('span.rounded-full svg')).not.toBeNull()
    })

    it('leaves the marker empty on a single-choice row that is not chosen', () => {
        openRow()
        const row = screen.getByRole('menuitemradio', { name: 'Row' })
        expect(row.getAttribute('aria-checked')).toBe('false')
        expect(row.querySelector('span.rounded-full')).not.toBeNull()
        expect(row.querySelector('span.rounded-full svg')).toBeNull()
    })

    it('keeps a square checkbox on a multi-select row', () => {
        openRow({ multi: true, selected: true })
        const row = screen.getByRole('menuitemcheckbox', { name: 'Row' })
        expect(row.querySelector('span.rounded-full')).toBeNull()
        expect(row.querySelector('svg')).not.toBeNull()
    })
})
