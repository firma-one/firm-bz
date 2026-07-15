export type EngagementColor = { bg: string; border: string; text: string; dot: string }

const ENGAGEMENT_COLOR_PALETTE: EngagementColor[] = [
  { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-indigo-50', border: 'border-indigo-400', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  { bg: 'bg-violet-50', border: 'border-violet-400', text: 'text-violet-700', dot: 'bg-violet-500' },
  { bg: 'bg-teal-50', border: 'border-teal-400', text: 'text-teal-700', dot: 'bg-teal-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-pink-50', border: 'border-pink-400', text: 'text-pink-700', dot: 'bg-pink-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-400', text: 'text-cyan-700', dot: 'bg-cyan-500' },
]

/** Same order/length as ENGAGEMENT_COLOR_PALETTE — index must stay aligned. */
const ENGAGEMENT_COLOR_HEX: { bg: string; border: string; text: string }[] = [
  { bg: '#eff6ff', border: '#60a5fa', text: '#1d4ed8' },
  { bg: '#eef2ff', border: '#818cf8', text: '#4338ca' },
  { bg: '#f5f3ff', border: '#a78bfa', text: '#6d28d9' },
  { bg: '#f0fdfa', border: '#2dd4bf', text: '#0f766e' },
  { bg: '#ecfdf5', border: '#34d399', text: '#047857' },
  { bg: '#fffbeb', border: '#fbbf24', text: '#b45309' },
  { bg: '#fdf2f8', border: '#f472b6', text: '#be185d' },
  { bg: '#ecfeff', border: '#22d3ee', text: '#0e7490' },
]

function hashToIndex(id: string, length: number): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return hash % length
}

/** Tailwind classes for DOM elements you control directly (e.g. sidebar swatches). */
export function getEngagementColor(engagementId: string): EngagementColor {
  return ENGAGEMENT_COLOR_PALETTE[hashToIndex(engagementId, ENGAGEMENT_COLOR_PALETTE.length)]
}

/** Hex values for FullCalendar's own eventBackgroundColor/eventBorderColor/eventTextColor props. */
export function getEngagementColorHex(engagementId: string): { bg: string; border: string; text: string } {
  return ENGAGEMENT_COLOR_HEX[hashToIndex(engagementId, ENGAGEMENT_COLOR_HEX.length)]
}
