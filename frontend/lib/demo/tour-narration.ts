import manifest from '@/public/tour/narration/manifest.json'
import type { TourNodeId } from '@/lib/demo/tour-chapters'

/**
 * The step cards read aloud, in Brio's voice (.claude/plans/tour-chapters.md, Narration): clips
 * made ahead with Kokoro by scripts/tour-narration/generate.py, one per step, in
 * public/tour/narration with a manifest of each clip's text hash and length. This module is what
 * the page needs: which clip a step plays and how long it runs. The text read aloud is worked out
 * in tour-narration-text.ts, which only the generator and the tests load.
 */

/** Brio's voice: Kokoro's am_michael and am_fenrir, blended. Changing it marks every clip for remaking. */
export const NARRATION_VOICE = 'am_michael,am_fenrir'

/** Where the visitor's choice is remembered: narration is off until they turn it on. */
export const NARRATION_STORAGE_KEY = 'fm_demo_tour_narration'

/** Autopilot's pause after a clip ends, before the next step: a beat to look at what was described. */
export const NARRATION_BEAT_MS = 1200

export interface NarrationManifest {
    voice: string
    clips: Record<string, { hash: string; seconds: number }>
}

export const NARRATION_MANIFEST = manifest as NarrationManifest

/** A step's clip name: its node and its place in the node, from 1 (files-2). */
export function narrationKey(step: { node: TourNodeId; indexInNode: number }): string {
    return `${step.node}-${step.indexInNode + 1}`
}

/** The step's clip and its length, or null when it has none yet. */
export function narrationClip(step: { node: TourNodeId; indexInNode: number }): { src: string; seconds: number } | null {
    const key = narrationKey(step)
    const clip = NARRATION_MANIFEST.clips[key]
    return clip ? { src: `/tour/narration/${key}.m4a`, seconds: clip.seconds } : null
}
