'use client'

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReleaseFrontmatter, ReleaseType } from '@/app/(resources)/resources/changelog/page'

const labelFont = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const bodyFont = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

const filterBtn = (active: boolean) =>
  cn(
    labelFont,
    'rounded-none px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors active:scale-[0.98]',
    active
      ? 'border border-[#006e16]/20 bg-[#72ff70] text-[#002203]'
      : 'border border-[#c6c6cc]/30 bg-white text-[#45474c] hover:border-[#c6c6cc]/50 hover:bg-[#f6f3f4]'
  )

interface Section {
  version: string
  meta: ReleaseFrontmatter | undefined
  body: string
}

interface Props {
  sections: Section[]
}

const TYPE_BADGE: Record<ReleaseType, { label: string }> = {
  major: { label: 'Major' },
  minor: { label: 'Minor' },
  patch: { label: 'Patch' },
}

const TYPE_FILTERS: Array<{ key: 'all' | ReleaseType; label: string }> = [
  { key: 'all', label: 'All Versions' },
  { key: 'major', label: 'Major' },
  { key: 'minor', label: 'Minor' },
  { key: 'patch', label: 'Patch' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getYear(iso: string) {
  return new Date(iso).getFullYear().toString()
}

export function ChangelogReleases({ sections }: Props) {
  const [typeFilter, setTypeFilter] = useState<'all' | ReleaseType>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map((s, i) => [s.version, i !== 0]))
  )

  const years = useMemo(() => {
    const ys = Array.from(
      new Set(sections.map((s) => (s.meta?.date ? getYear(s.meta.date) : null)).filter(Boolean))
    ) as string[]
    return ys.sort((a, b) => Number(b) - Number(a))
  }, [sections])

  const filtered = useMemo(() =>
    sections.filter((s) => {
      const matchType = typeFilter === 'all' || s.meta?.type === typeFilter
      const matchYear = yearFilter === 'all' || (s.meta?.date && getYear(s.meta.date) === yearFilter)
      return matchType && matchYear
    }),
    [sections, typeFilter, yearFilter]
  )

  const toggle = (version: string) =>
    setCollapsed((prev) => ({ ...prev, [version]: !prev[version] }))

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Type filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        {TYPE_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeFilter(key)}
            className={cn(filterBtn(typeFilter === key), key === 'all' && 'w-36')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Year filters */}
      <div className="mb-8 flex flex-wrap gap-3 md:mb-10">
        <button
          type="button"
          onClick={() => setYearFilter('all')}
          className={cn(filterBtn(yearFilter === 'all'), 'w-36')}
        >
          All Years
        </button>
        {years.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => setYearFilter(year)}
            className={filterBtn(yearFilter === year)}
          >
            {year}
          </button>
        ))}
      </div>

      {/* Release cards */}
      {filtered.length === 0 ? (
        <p className={cn(bodyFont, 'text-sm text-[#76777d]')}>No releases match this filter.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((section, i) => {
            const isCollapsed = collapsed[section.version] ?? i !== 0
            const isLatest = section.version === sections[0].version
            const badge = section.meta?.type ? TYPE_BADGE[section.meta.type] : null
            const title = section.meta?.title ?? section.version
            const date = section.meta?.date ? formatDate(section.meta.date) : null

            return (
              <div
                key={section.version}
                className={cn(
                  'overflow-hidden rounded-none border transition-shadow duration-300',
                  isLatest
                    ? 'border-[#c6c6cc]/40 bg-white shadow-sm hover:shadow-md'
                    : 'border-[#c6c6cc]/30 bg-[#f9f9fb] shadow-sm hover:shadow-md'
                )}
              >
                {/* Header — always visible */}
                <button
                  type="button"
                  onClick={() => toggle(section.version)}
                  className={cn(
                    'group flex w-full items-start gap-4 p-8 text-left transition-colors',
                    isLatest ? 'hover:bg-[#f9f9fb]' : 'hover:bg-[#f3f4f6]'
                  )}
                >
                  {/* Left meta column: version pill + type badge */}
                  <div className="flex shrink-0 flex-col items-stretch gap-2 pt-1">
                    <span
                      className={cn(
                        labelFont,
                        'rounded-none border border-[#c6c6cc]/40 bg-white px-3 py-1 text-center text-[10px] font-bold uppercase tracking-widest',
                        isLatest ? 'text-[#3f4757]' : 'text-[#45474c]'
                      )}
                    >
                      v{section.version}
                    </span>
                    {badge && (
                      <span
                        className={cn(
                          labelFont,
                          'rounded-none border border-[#c6c6cc]/40 bg-white px-3 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-[#45474c]'
                        )}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>

                  {/* Title + date */}
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        labelFont,
                        'mb-1 block text-2xl font-bold leading-snug text-neutral-950 transition-colors group-hover:text-[#006e16]'
                      )}
                    >
                      {title}
                    </span>
                    {date && (
                      <span className={cn(bodyFont, 'block text-base text-[#76777d]')}>
                        {date}
                      </span>
                    )}
                  </span>

                  {/* Chevron */}
                  <ChevronDown
                    className={cn(
                      'mt-1.5 h-5 w-5 shrink-0 text-[#9ca3af] transition-transform duration-200 group-hover:text-[#45474c]',
                      !isCollapsed && 'rotate-180'
                    )}
                  />
                </button>

                {/* Collapsible body */}
                {!isCollapsed && section.body && (
                  <div className={cn('border-t border-[#c6c6cc]/20 bg-white px-8 pb-10 pt-8', bodyFont)}>
                    <div
                      className={cn(
                        'prose prose-p:my-2 prose-strong:font-semibold prose-strong:text-neutral-950 max-w-none text-lg leading-relaxed text-[#45474c]',
                        bodyFont,
                        // h3 — category-label style matching FAQ card labels
                        '[&_h3]:!mb-4 [&_h3]:!mt-16 [&_h3]:rounded-none [&_h3]:border [&_h3]:border-[#c6c6cc]/40 [&_h3]:bg-white [&_h3]:px-3 [&_h3]:py-1 [&_h3]:text-[10px] [&_h3]:font-bold [&_h3]:uppercase [&_h3]:not-italic [&_h3]:tracking-widest [&_h3]:text-[#45474c] [&_h3]:first:!mt-0',
                        '[&_h3]:[font-family:var(--font-kinetic-headline),system-ui,sans-serif]',
                        // h4
                        '[&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-bold [&_h4]:text-[#1b1b1d]',
                        '[&_h4]:[font-family:var(--font-kinetic-headline),system-ui,sans-serif]',
                        // lists
                        '[&_ul]:!mt-3 [&_ul]:!mb-10 [&_ul]:space-y-2 [&_ul]:pl-0',
                        '[&_li]:list-none [&_li]:relative [&_li]:pl-5',
                        '[&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.55em] [&_li]:before:h-1.5 [&_li]:before:w-1.5 [&_li]:before:rounded-full [&_li]:before:bg-[#c6c6cc] [&_li]:before:content-[""]',
                        // inline
                        '[&_em]:text-[#76777d]',
                        // hr
                        '[&_hr]:my-8 [&_hr]:border-[#e5e7eb]',
                        // table
                        '[&_table]:w-full [&_table]:border-collapse',
                        '[&_th]:border-b-2 [&_th]:border-[#e5e7eb] [&_th]:pb-2 [&_th]:pt-1 [&_th]:text-left [&_th]:text-[10px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-widest [&_th]:text-[#76777d]',
                        '[&_th]:[font-family:var(--font-kinetic-headline),system-ui,sans-serif]',
                        '[&_td]:border-b [&_td]:border-[#f3f4f6] [&_td]:py-3 [&_td]:text-base [&_td]:text-[#374151]',
                        '[&_td:first-child]:font-semibold [&_td:first-child]:text-[#1b1b1d]',
                        // code
                        '[&_code]:rounded-none [&_code]:bg-[#f3f4f6] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-[#374151]',
                      )}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
