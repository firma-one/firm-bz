import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMarkdown, linkDocIds } from './chat-markdown'

const sources = [
    { docId: 'QSR-9', documentId: 'doc_9', name: 'Market Report', isFolder: true },
    { docId: 'QSR-49', documentId: 'doc_49', name: '01-Content-Archive.docx', isFolder: false },
]

describe('linkDocIds', () => {
    it('turns a cited doc ID into a link, dropping the brackets the chip replaces', () => {
        expect(linkDocIds('"01-Content-Archive.docx" (QSR-49) is late.', sources))
            .toBe('"01-Content-Archive.docx" [QSR-49](#doc-file:doc_49) is late.')
    })

    it('keeps the brackets around anything else inside them', () => {
        expect(linkDocIds('(QSR-49, in Internal)', sources)).toBe('([QSR-49](#doc-file:doc_49), in Internal)')
    })

    it('does not confuse QSR-9 with QSR-49, nor touch ids it was not given or code', () => {
        expect(linkDocIds('QSR-9 and QSR-490 and QSR-7 and `QSR-9`', sources))
            .toBe('[QSR-9](#doc-file:doc_9) and QSR-490 and QSR-7 and `QSR-9`')
    })

    it('leaves text alone with no sources', () => {
        expect(linkDocIds('QSR-9 is due.', undefined)).toBe('QSR-9 is due.')
    })
})

describe('ChatMarkdown', () => {
    it('renders a cited doc ID as a chip that opens the item through the Files deep link', () => {
        render(<ChatMarkdown content={'| File | Id |\n|---|---|\n| Report | QSR-9 |'} sources={sources} />)
        const chip = screen.getByRole('link', { name: 'QSR-9' })
        expect(chip.getAttribute('href')).toBe('#doc-file:doc_9')
    })

    it('opens any other link in a new tab', () => {
        render(<ChatMarkdown content={'See [the docs](https://example.com).'} />)
        const link = screen.getByRole('link', { name: 'the docs' })
        expect(link.getAttribute('target')).toBe('_blank')
    })
})
