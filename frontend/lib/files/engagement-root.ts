/**
 * What the Files views call the engagement's own top folder — Drive's "General" folder, a name users
 * never see — always beside the engagement's Briefcase icon: the breadcrumb's first crumb, the
 * Move/Copy picker's root, and the upload texts at the top level (2026-10-23).
 */
export const ENGAGEMENT_ROOT_LABEL = 'Engagement root'

/** An engagement's top folders in Drive. Anything above them is plumbing nobody navigates. */
const ENGAGEMENT_TOP_FOLDERS = ['general', 'confidential', 'staging']

/**
 * A document's folders as the Files views name them, from its ancestors' names, root first: starting at
 * the engagement's top folder, with "General" under the label users know.
 */
export function folderPathLabels(ancestors: readonly string[]): string[] {
    const top = ancestors.findIndex((name) => ENGAGEMENT_TOP_FOLDERS.includes(name.toLowerCase()))
    if (top === -1) return [...ancestors]
    const [first, ...rest] = ancestors.slice(top)
    return [first.toLowerCase() === 'general' ? ENGAGEMENT_ROOT_LABEL : first, ...rest]
}
