import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tabs } from '@/components/ui/tabs'
import { EngagementTabsList, type EngagementTabsConfig } from './engagement-tabs'

/** The RAID log's tab (2026-11-14): beside Discussions, for the people its routes allow. */

const BASE: EngagementTabsConfig = { canViewInternalTabs: true, canManage: true, canViewSettings: true }
const row = (c: Partial<EngagementTabsConfig>) =>
    render(<Tabs value="files"><EngagementTabsList {...BASE} {...c} /></Tabs>)

describe('EngagementTabsList · RAID', () => {
    it('sits after Discussions, with its count and the internal-only lock', () => {
        row({ canViewRaid: true, raidCount: 4 })
        const names = screen.getAllByRole('tab').map((t) => t.textContent ?? '')
        const at = names.findIndex((n) => n.startsWith('RAID'))
        expect(names[at - 1]).toMatch(/^Discussions/)
        expect(names[at]).toContain('4')
    })

    it('is not there for anyone the RAID log isn\'t for', () => {
        row({ canViewRaid: false, raidCount: 4 })
        expect(screen.queryByRole('tab', { name: /RAID/ })).toBeNull()
    })
})
