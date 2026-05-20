import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import matter from 'gray-matter'
import { History } from 'lucide-react'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { MarketingBreadcrumb } from '@/components/marketing/marketing-breadcrumb'
import { KineticSectionIntro, kineticSectionLeadClassName } from '@/components/kinetic/kinetic-section-intro'
import { MARKETING_PAGE_SHELL } from '@/lib/marketing/target-audience-nav'
import { BrandName } from '@/components/brand/BrandName'
import { BRAND_NAME } from '@/config/brand'
import { cn } from '@/lib/utils'
import { ChangelogReleases } from '@/components/changelog/changelog-releases'

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

export default function ChangelogPage() {
  const filePath = path.join(process.cwd(), 'content/releases.mdx')
  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'))
  const releases: ReleaseFrontmatter[] = data.releases ?? []
  const sections = parseReleaseSections(content, releases)

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />

      <main className={cn(MARKETING_PAGE_SHELL, 'relative z-10 w-full flex-1 pb-16 md:pb-24')}>
        <MarketingBreadcrumb
          items={[{ label: 'Resources' }, { label: 'Changelog' }]}
          className="mb-8"
        />

        <header className="mb-10 md:mb-12">
          <KineticSectionIntro
            compact
            heading="h1"
            titleScale="hero"
            badge={{
              variant: 'lime',
              icon: <History className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />,
              label: 'Product // Changelog',
            }}
            title={
              <>
                <span className="text-[#1b1b1d]">What&apos;s new in </span>
                <BrandName className="inline [font-size:inherit] [line-height:inherit]" gradient />
              </>
            }
            description={
              <p className={cn(kineticSectionLeadClassName, 'max-w-2xl')}>
                Release notes, feature announcements, and improvements — every update in one place.
              </p>
            }
            descriptionClassName=""
          />
        </header>

        <ChangelogReleases sections={sections} />
      </main>

      <Footer />
    </div>
  )
}
