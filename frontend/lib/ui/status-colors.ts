/**
 * Notion's tag palette (app/ui-tokens.css) as classes, for Tag and color dots. Statuses have their
 * own language in lib/ui/status.ts. Class strings are written out in full so Tailwind's scanner
 * (which reads lib/) generates them.
 */

export type TagColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

export const TAG_CLASSES: Record<TagColor, string> = {
    gray: 'bg-tag-gray-bg text-tag-gray-fg',
    brown: 'bg-tag-brown-bg text-tag-brown-fg',
    orange: 'bg-tag-orange-bg text-tag-orange-fg',
    yellow: 'bg-tag-yellow-bg text-tag-yellow-fg',
    green: 'bg-tag-green-bg text-tag-green-fg',
    blue: 'bg-tag-blue-bg text-tag-blue-fg',
    purple: 'bg-tag-purple-bg text-tag-purple-fg',
    pink: 'bg-tag-pink-bg text-tag-pink-fg',
    red: 'bg-tag-red-bg text-tag-red-fg',
}

/** Solid dot color for each tag (the tag's text color), for list rows and the board. */
export const TAG_DOT_CLASSES: Record<TagColor, string> = {
    gray: 'bg-tag-gray-fg',
    brown: 'bg-tag-brown-fg',
    orange: 'bg-tag-orange-fg',
    yellow: 'bg-tag-yellow-fg',
    green: 'bg-tag-green-fg',
    blue: 'bg-tag-blue-fg',
    purple: 'bg-tag-purple-fg',
    pink: 'bg-tag-pink-fg',
    red: 'bg-tag-red-fg',
}
