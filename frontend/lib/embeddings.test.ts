import { describe, it, expect } from 'vitest'
import { prepareTextForEmbedding } from './embeddings'

// What a document's vector is built from: its name, and since 2026-10-29 the description the firm wrote.

describe('prepareTextForEmbedding', () => {
    it('is the name alone when there is nothing else', () => {
        expect(prepareTextForEmbedding('  Plan.xlsx ')).toBe('Plan.xlsx')
    })

    it('adds the description, then any summary', () => {
        expect(prepareTextForEmbedding('Plan.xlsx', null, 'Fee schedule for the renewal')).toBe('File: Plan.xlsx | Description: Fee schedule for the renewal')
        expect(prepareTextForEmbedding('Plan.xlsx', 'Q3 numbers', 'Fees')).toBe('File: Plan.xlsx | Description: Fees | Summary: Q3 numbers')
        expect(prepareTextForEmbedding('Plan.xlsx', 'Q3 numbers')).toBe('File: Plan.xlsx | Summary: Q3 numbers')
    })

    it("cuts a long description, which the model wouldn't read past anyway", () => {
        const text = prepareTextForEmbedding('Plan.xlsx', null, 'x'.repeat(5000))
        expect(text.length).toBeLessThan(1100)
    })
})
