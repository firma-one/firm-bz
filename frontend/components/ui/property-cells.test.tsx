import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StatusProperty, DateProperty, PersonProperty } from './property-cells'

describe('StatusProperty', () => {
    it('shows the value and offers only the given options', async () => {
        const onChange = vi.fn()
        render(<StatusProperty kind="engagement" value="ACTIVE" options={['PLANNED', 'ACTIVE', 'PAUSED']} onChange={onChange} />)
        fireEvent.click(screen.getByRole('button', { name: /Active/ }))
        expect(await screen.findByText('Planned')).toBeTruthy()
        expect(screen.queryByText('Completed')).toBeNull()
        fireEvent.click(screen.getByText('Paused'))
        await waitFor(() => expect(onChange).toHaveBeenCalledWith('PAUSED'))
    })

    it('is read-only when disabled', () => {
        render(<StatusProperty kind="engagement" value="ACTIVE" options={['PLANNED']} onChange={() => {}} disabled />)
        expect(screen.queryByRole('button')).toBeNull()
        expect(screen.getByText('Active')).toBeTruthy()
    })
})

describe('DateProperty', () => {
    it('saves a picked date and can clear it', async () => {
        const onChange = vi.fn()
        render(<DateProperty value="2026-10-18T00:00:00.000Z" onChange={onChange} />)
        fireEvent.click(screen.getByRole('button'))
        fireEvent.click(await screen.findByText('Clear date'))
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
    })

    it('shows the placeholder when empty and nothing to click when disabled', () => {
        render(<DateProperty value={null} placeholder="Due date" onChange={() => {}} disabled />)
        expect(screen.getByText('Due date')).toBeTruthy()
        expect(screen.queryByRole('button')).toBeNull()
    })
})

describe('PersonProperty', () => {
    it('filters people and assigns the chosen one', async () => {
        const onChange = vi.fn()
        const people = [{ id: 'u1', name: 'Pat Lee' }, { id: 'u2', name: 'Sam Roy' }]
        render(<PersonProperty value={null} people={people} onChange={onChange} />)
        fireEvent.click(screen.getByRole('button'))
        fireEvent.change(await screen.findByPlaceholderText('Search people…'), { target: { value: 'sam' } })
        expect(screen.queryByText('Pat Lee')).toBeNull()
        fireEvent.click(screen.getByText('Sam Roy'))
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(people[1]))
    })
})

describe('DateProperty calendar days', () => {
    it('shows a bare yyyy-MM-dd as that day in every time zone', () => {
        render(<DateProperty value="2026-03-01" onChange={() => {}} disabled />)
        expect(screen.getByText('Mar 1, 2026')).toBeTruthy()
    })
})
