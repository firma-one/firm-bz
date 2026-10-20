import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import matter from 'gray-matter'

import { DocView, FinalCtaOnWhite } from '@/components/marketing/v2/reading/doc-view'
import { formatLongDate, slugify } from '@/components/marketing/v2/reading/format'
import { ReleaseSection, type ReleaseSectionData } from '@/components/marketing/v2/reading/release-notes'
import { BRAND_NAME } from '@/config/brand'

export const metadata: Metadata = {
  title: `Changelog | ${BRAND_NAME}`,
  description: `See what's new in ${BRAND_NAME} — release notes, feature announcements, and improvements.`,
}

export type ReleaseType = 'major' | 'minor' | 'patch'

export interface ReleaseFrontmatter {
  version: string
  commit: string
  date: string
  title: string
  type: ReleaseType
}

function parseReleaseSections(content: string, releases: ReleaseFrontmatter[]) {
  const sections = content.split(/(?=^## v)/m).filter(Boolean)
  return sections
    .map((section) => {
      const versionMatch = section.match(/^## v(\d+\.\d+\.\d+)/)
      const version = versionMatch?.[1] ?? ''
      const meta = releases.find((r) => r.version === version)
      const body = section.replace(/^## .+\n/, '').trim()
      return { version, meta, body }
    })
    .filter((s) => s.version)
}

const TYPE_LABEL: Record<ReleaseType, string> = { major: 'Major', minor: 'Minor', patch: 'Patch' }

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/** "September 27, 2026" → "2026-09-27" (no Date parsing, so no time-zone drift). */
function isoFromLongDate(text: string): string | undefined {
  const m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/)
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
  if (!m || month < 0) return undefined
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

const RELEASED_LINE = /^\*Released ([^*]+)\*\s*(?:\n|$)/
const EDGE_RULE = /^(?:-{3,}\s*\n+)+|(?:\n+\s*-{3,})+\s*$/g

/**
 * A release's header data and notes. The notes' own "*Released …*" line becomes the header date (it
 * is the release author's calendar day; the frontmatter date is the UTC day, sometimes one earlier),
 * and the `---` separators at either end give way to the sections' own rules.
 */
function toReleaseData(
  section: ReturnType<typeof parseReleaseSections>[number],
  latest: boolean,
): ReleaseSectionData {
  let body = section.body
  let date: string | undefined
  let dateLabel: string | undefined

  const released = body.match(RELEASED_LINE)
  if (released) {
    const label = released[1].trim()
    const iso = isoFromLongDate(label)
    if (iso) {
      date = iso
      dateLabel = label
      body = body.slice(released[0].length)
    }
  }
  if (!date && section.meta?.date) {
    date = section.meta.date
    dateLabel = formatLongDate(section.meta.date)
  }
  body = body.trim().replace(EDGE_RULE, '').trim()

  return {
    version: section.version,
    title: section.meta?.title ?? `Version ${section.version}`,
    date,
    dateLabel,
    typeLabel: section.meta?.type ? TYPE_LABEL[section.meta.type] : undefined,
    latest,
    body,
  }
}

export default function ChangelogPage() {
  const filePath = path.join(process.cwd(), 'content/releases.mdx')
  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'))
  const releases: ReleaseFrontmatter[] = data.releases ?? []
  const sections = parseReleaseSections(content, releases).map((s, i) => toReleaseData(s, i === 0))
  const withIds = sections.map((release) => ({ release, id: slugify(`v${release.version}`) }))
  const latest = sections[0]

  return (
    <>
      <DocView
        crumbs={[
          { label: 'Resources' },
          { label: 'Changelog', href: '/resources/changelog' },
        ]}
        title={<>What’s new in {BRAND_NAME}</>}
        dek="Release notes, feature announcements, and improvements — every update in one place."
        meta={
          latest ? (
            <>
              Latest release <strong>v{latest.version}</strong>
              {latest.date && latest.dateLabel ? (
                <>
                  <span aria-hidden="true" className="mk-doc-meta-dot" />
                  <time dateTime={latest.date}>{latest.dateLabel}</time>
                </>
              ) : null}
            </>
          ) : undefined
        }
        toc={withIds.map(({ release, id }) => ({ id, text: `v${release.version} — ${release.title}` }))}
      >
        {withIds.length > 0 ? (
          withIds.map(({ release, id }) => <ReleaseSection key={release.version} release={release} id={id} />)
        ) : (
          <p className="mk-doc-lead">The first release notes are on the way.</p>
        )}
      </DocView>
      <FinalCtaOnWhite />
    </>
  )
}
