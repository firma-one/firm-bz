import { describe, it, expect } from 'vitest'
import { ENGAGEMENT_ROOT_LABEL, folderPathLabels } from './engagement-root'

describe('folderPathLabels', () => {
    it('starts at the engagement\'s top folder, under the label Files uses', () => {
        expect(folderPathLabels(['Acme', 'Q3 Strategy', 'General', 'Research', 'Sources'])).toEqual([ENGAGEMENT_ROOT_LABEL, 'Research', 'Sources'])
    })

    it('keeps the name of the other top folders', () => {
        expect(folderPathLabels(['Q3 Strategy', 'Confidential', 'Pricing'])).toEqual(['Confidential', 'Pricing'])
    })

    it('renames only the top folder, not a subfolder that shares its name', () => {
        expect(folderPathLabels(['General', 'Research', 'General'])).toEqual([ENGAGEMENT_ROOT_LABEL, 'Research', 'General'])
    })

    it('leaves a path with no top folder as it is', () => {
        expect(folderPathLabels(['Research'])).toEqual(['Research'])
        expect(folderPathLabels([])).toEqual([])
    })
})
