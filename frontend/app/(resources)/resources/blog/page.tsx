import { Metadata } from 'next'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { BlogListing } from '@/components/blog/blog-listing'
import { MarketingBreadcrumb } from '@/components/marketing/marketing-breadcrumb'
import { BRAND_NAME } from '@/config/brand'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import { getAllPosts } from '@/lib/blog-utils'
import { BLOG_BASE_PATH, MARKETING_PAGE_SHELL } from '@/lib/marketing/target-audience-nav'
import { cn } from '@/lib/utils'

const siteOrigin = getPlatformSiteOrigin()

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

export const metadata: Metadata = {
  title: `Blog | ${BRAND_NAME} - Articles, Guides & Insights`,
  description: `Read the latest articles, guides, and insights from ${BRAND_NAME}. Learn about document management, Google Drive integration, client portals, and productivity tips.`,
  keywords: ['blog', 'articles', 'guides', 'document management', 'Google Drive', 'productivity', 'client portals'],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: `Blog | ${BRAND_NAME}`,
    description: `Read the latest articles, guides, and insights from ${BRAND_NAME}`,
    type: 'website',
    url: `${siteOrigin}${BLOG_BASE_PATH}`,
  },
  alternates: {
    canonical: `${siteOrigin}${BLOG_BASE_PATH}`,
  },
}

export default function BlogPage() {
  const posts = getAllPosts()
  const categories = ['comparisons', 'use-cases', 'guides', 'product']

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${BRAND_NAME} Blog`,
    description: 'Articles, guides, and insights about document management and productivity',
    url: `${siteOrigin}${BLOG_BASE_PATH}`,
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      author: {
        '@type': 'Organization',
        name: BRAND_NAME,
      },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="relative flex min-h-screen flex-col">
        <Header />

        <main className={cn(MARKETING_PAGE_SHELL, 'relative z-10 w-full flex-1 pb-16 pt-24 md:pb-24 lg:pt-28')}>
          <MarketingBreadcrumb
            items={[{ label: 'Resources' }, { label: 'Blog' }]}
            className="mb-8 md:mb-10"
          />

          <header className="mb-14 md:mb-20">
            <div className="flex flex-col items-start gap-12 md:flex-row md:gap-12">
              <div className="min-w-0 flex-1 md:w-7/12">
                <span
                  className={`mb-6 block text-sm font-bold uppercase tracking-[0.2em] text-[#006e16] ${H}`}
                >
                  Perspectives
                </span>
                <h1
                  className={`text-4xl font-bold leading-[0.92] tracking-tighter text-[#1b1b1d] sm:text-5xl md:text-6xl lg:text-7xl ${H}`}
                >
                  Explore our most recent articles and fresh perspectives
                </h1>
              </div>
              <div className="w-full shrink-0 border-l-4 border-[#006e16] bg-[#f6f3f4] p-8 md:mt-2 md:w-5/12 md:max-w-xl md:rounded-[4px]">
                <p className={cn('text-lg font-light leading-relaxed text-[#45474c] md:text-xl', B)}>
                  Practical ideas for running a client-facing firm without the busywork: portals, permissions,
                  documents, and workflows that stay under your control.
                </p>
              </div>
            </div>
          </header>

          {posts.length === 0 ? (
            <p className={cn('text-center text-[#45474c]', B)}>No blog posts available yet. Check back soon!</p>
          ) : (
            <BlogListing posts={posts} categories={categories} activeCategory="all" showFeatured />
          )}
        </main>

        <Footer />
      </div>
    </>
  )
}
