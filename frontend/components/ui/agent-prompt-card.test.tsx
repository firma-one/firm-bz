import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentPromptCard } from './agent-prompt-card'

const OPTIONS = [
    { value: 'a', label: 'Rename them', description: 'Bring both in line' },
    { value: 'b', label: 'Leave them' },
]

describe('AgentPromptCard', () => {
    it('stacks every option as its own control', () => {
        render(<AgentPromptCard question="What next?" options={OPTIONS} onAnswer={() => {}} />)
        expect(screen.getByText('Rename them')).toBeTruthy()
        expect(screen.getByText('Leave them')).toBeTruthy()
        expect(screen.getByText('Bring both in line')).toBeTruthy()
    })

    it('returns the option value, not its label', () => {
        let got: string | null = null
        render(<AgentPromptCard question="What next?" options={OPTIONS} onAnswer={(v) => { got = v }} />)
        fireEvent.click(screen.getByText('Rename them'))
        expect(got).toBe('a')
    })

    /** The escape hatch: none of the options fits. */
    it('accepts free text and returns it verbatim', () => {
        let got: string | null = null
        render(<AgentPromptCard question="What next?" options={OPTIONS} onAnswer={(v) => { got = v }} />)
        fireEvent.click(screen.getByText('Something else'))
        const input = screen.getByPlaceholderText('Type your answer')
        fireEvent.change(input, { target: { value: 'archive the older one' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(got).toBe('archive the older one')
    })

    it('ignores empty free text', () => {
        let called = false
        render(<AgentPromptCard question="What next?" options={OPTIONS} onAnswer={() => { called = true }} />)
        fireEvent.click(screen.getByText('Something else'))
        fireEvent.keyDown(screen.getByPlaceholderText('Type your answer'), { key: 'Enter' })
        expect(called).toBe(false)
    })

    /** Answered cards stay in the thread showing the decision. */
    it('shows the chosen label and hides the options once answered', () => {
        render(<AgentPromptCard question="What next?" options={OPTIONS} onAnswer={() => {}} answer="a" />)
        expect(screen.getByText('Rename them')).toBeTruthy()
        expect(screen.queryByText('Leave them')).toBeNull()
    })

    /** A free-text answer has no matching option, so it must render itself. */
    it('shows a free-text answer back', () => {
        render(<AgentPromptCard question="What next?" options={OPTIONS} onAnswer={() => {}} answer="archive it" />)
        expect(screen.getByText('archive it')).toBeTruthy()
    })

    /** The rule: no question may be asked without a way to answer it in the user's own words. */
    it('always offers the free-text escape', () => {
        render(<AgentPromptCard question="What next?" options={OPTIONS} onAnswer={() => {}} />)
        expect(screen.getByText('Something else')).toBeTruthy()
    })

    it('offers it last, after every fixed option', () => {
        const { container } = render(
            <AgentPromptCard question="What next?" options={OPTIONS} onAnswer={() => {}} />,
        )
        const rows = Array.from(container.querySelectorAll('li'))
        expect(rows[rows.length - 1].textContent).toContain('Something else')
    })
})

describe('AgentPromptCard — sequence and dismissal', () => {
    it('numbers every option', () => {
        render(<AgentPromptCard question="What next?" options={OPTIONS} onAnswer={() => {}} />)
        expect(screen.getByText('1')).toBeTruthy()
        expect(screen.getByText('2')).toBeTruthy()
    })

    it('shows the position whenever one is given, including 1 of 1', () => {
        const { rerender } = render(
            <AgentPromptCard question="Q" options={OPTIONS} onAnswer={() => {}} step={1} stepCount={3} />,
        )
        expect(screen.getByText('1 of 3')).toBeTruthy()
        // "1 of 1" still answers "how many more?", which is the question the counter is for.
        rerender(<AgentPromptCard question="Q" options={OPTIONS} onAnswer={() => {}} step={1} stepCount={1} />)
        expect(screen.getByText('1 of 1')).toBeTruthy()
        // Without a position there is nothing to state.
        rerender(<AgentPromptCard question="Q" options={OPTIONS} onAnswer={() => {}} />)
        expect(screen.queryByText(/ of /)).toBeNull()
    })

    it('offers dismiss and skip only when handled', () => {
        const { rerender } = render(<AgentPromptCard question="Q" options={OPTIONS} onAnswer={() => {}} />)
        expect(screen.queryByText('Skip')).toBeNull()
        expect(screen.queryByLabelText('Dismiss this question')).toBeNull()

        rerender(
            <AgentPromptCard
                question="Q" options={OPTIONS} onAnswer={() => {}}
                onSkip={() => {}} onDismiss={() => {}}
            />,
        )
        expect(screen.getByText('Skip')).toBeTruthy()
        expect(screen.getByLabelText('Dismiss this question')).toBeTruthy()
    })

    it('calls skip and dismiss without answering', () => {
        let skipped = false
        let dismissed = false
        let answered = false
        render(
            <AgentPromptCard
                question="Q" options={OPTIONS}
                onAnswer={() => { answered = true }}
                onSkip={() => { skipped = true }}
                onDismiss={() => { dismissed = true }}
            />,
        )
        fireEvent.click(screen.getByText('Skip'))
        fireEvent.click(screen.getByLabelText('Dismiss this question'))
        expect(skipped).toBe(true)
        expect(dismissed).toBe(true)
        expect(answered).toBe(false)
    })

    /** Escape backs out of the editor without losing the question. */
    it('returns to the options on Escape', () => {
        render(<AgentPromptCard question="Q" options={OPTIONS} onAnswer={() => {}} />)
        fireEvent.click(screen.getByText('Something else'))
        fireEvent.keyDown(screen.getByPlaceholderText('Type your answer'), { key: 'Escape' })
        expect(screen.getByText('Something else')).toBeTruthy()
        expect(screen.queryByPlaceholderText('Type your answer')).toBeNull()
    })

    /** An answered card keeps no controls: it is a record, not a live question. */
    it('hides skip and the options once answered', () => {
        render(
            <AgentPromptCard question="Q" options={OPTIONS} onAnswer={() => {}} answer="a" onSkip={() => {}} />,
        )
        expect(screen.queryByText('Skip')).toBeNull()
        expect(screen.queryByText('Something else')).toBeNull()
    })
})

describe('recommendation', () => {
    /** A property of the option, not of where it sits in the list. */
    it('highlights the option marked recommended, wherever it is', () => {
        render(
            <AgentPromptCard
                question="Q"
                options={[
                    { value: 'a', label: 'First' },
                    { value: 'b', label: 'Second', recommended: true },
                ]}
                onAnswer={() => {}}
            />,
        )
        const badge = screen.getByText('Recommended')
        expect(badge.closest('button')?.textContent).toContain('Second')
        expect(badge.closest('button')?.textContent).not.toContain('First')
    })

    /** A recommendation nobody meant is worse than none. */
    it('marks nothing when no option is recommended', () => {
        render(
            <AgentPromptCard
                question="Q"
                options={[{ value: 'a', label: 'First' }, { value: 'b', label: 'Second' }]}
                onAnswer={() => {}}
            />,
        )
        expect(screen.queryByText('Recommended')).toBeNull()
    })

    /** Said in words, not only in shading — a tint tells a screen reader nothing. */
    it('labels the recommendation in text', () => {
        render(
            <AgentPromptCard
                question="Q"
                options={[{ value: 'a', label: 'First', recommended: true }]}
                onAnswer={() => {}}
            />,
        )
        expect(screen.getByText('Recommended')).toBeTruthy()
    })

    it('takes the first when several are marked', () => {
        render(
            <AgentPromptCard
                question="Q"
                options={[
                    { value: 'a', label: 'First', recommended: true },
                    { value: 'b', label: 'Second', recommended: true },
                ]}
                onAnswer={() => {}}
            />,
        )
        expect(screen.getAllByText('Recommended')).toHaveLength(1)
    })
})
