import { Lock } from "lucide-react"
import { Tag } from "./tag"
import { Hint } from "./tooltip"

/**
 * "Internal only", with the lock the engagement's tabs show (AccessLock): the one badge for what only
 * the firm sees, so it reads the same everywhere (the RAID card, memos, the memo sheet, /tour).
 */
export function InternalOnlyTag({ className }: { className?: string }) {
    return (
        <Tag color="gray" icon={<Lock />} className={className}>
            Internal only
        </Tag>
    )
}

/**
 * On a member who sees Internal only items and internal notes (Leads and Contributors · Full Access,
 * lib/comments/internal-notes.ts): the same lock, so "Internal only" on an item points to "Internal"
 * on the people who see it. Others get nothing, never a counter-label.
 */
export function InternalMemberTag() {
    return (
        <Hint label="Sees everything in this engagement, including Internal only items and internal notes">
            <span className="inline-flex shrink-0 cursor-default">
                <Tag color="gray" icon={<Lock />}>
                    Internal
                </Tag>
            </span>
        </Hint>
    )
}
