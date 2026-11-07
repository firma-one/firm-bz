import type { ReactNode } from 'react'
import { CircleDot, Clock3, Flag, HardDrive, Hash, Type, UserRound } from 'lucide-react'
import {
    DATE_MODIFIED_COL_CLASS,
    DUE_DATE_COL_CLASS,
    FILE_SIZE_COL_CLASS,
    FILE_TABLE_COL_LINE_CLASS,
    OWNER_COL_CLASS,
    STATUS_COL_CLASS,
} from '@/components/projects/engagement-file-table-grid'

function HeaderLabel({ label, icon }: { label: string; icon: ReactNode }) {
    return (
        <div className="flex select-none items-center gap-1.5 text-small font-normal text-fg-muted [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-fg-subtle">
            {icon}
            {label}
        </div>
    )
}

/**
 * The Files table's header cells, after its checkbox, inside its grid (engagement-file-table-grid.ts).
 * Shared by the app and /tour, so their columns are the same by construction.
 */
export function FileTableHeaderCells() {
    return (
        <>
            <div className="flex items-center"><HeaderLabel label="ID" icon={<Hash />} /></div>
            {/* Name spans the badge and quick-action tracks too, as each row's Name cell does */}
            <div className={`col-span-3 flex items-center ${FILE_TABLE_COL_LINE_CLASS}`}><HeaderLabel label="Name" icon={<Type />} /></div>
            <div className={`items-center ${STATUS_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><HeaderLabel label="Status" icon={<CircleDot />} /></div>
            <div className={`items-center ${DUE_DATE_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><HeaderLabel label="Due" icon={<Flag />} /></div>
            <div className={`items-center ${OWNER_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><HeaderLabel label="Assignee" icon={<UserRound />} /></div>
            <div className={`items-center ${DATE_MODIFIED_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><HeaderLabel label="Modified" icon={<Clock3 />} /></div>
            <div className={`items-center ${FILE_SIZE_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><HeaderLabel label="Size" icon={<HardDrive />} /></div>
        </>
    )
}
