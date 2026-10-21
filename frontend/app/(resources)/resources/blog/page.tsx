import { Metadata } from 'next'

import { BlogListing } from '@/components/marketing/v2/reading/blog-listing'
import { ReadingFinalCta } from '@/components/marketing/v2/reading/closing'
import { toCardData } from '@/components/marketing/v2/reading/format'
import { blogListingData } from '@/components/marketing/v2/reading/listing-data'
import { ListingHeader } from '@/components/marketing/v2/reading/listing-header'
import { BRAND_NAME } from '@/config/brand'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav'

const siteOrigin = getPlatformSiteOrigin()

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
  const { posts, categories } = blogListingData()

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
      <ListingHeader
        crumbs={[
          { label: 'Resources' },
          { label: 'Blog', href: BLOG_BASE_PATH },
        ]}
        title={
          <>
            How good firms <em>deliver client work</em>
          </>
        }
        lede="Practical ideas for running a client-facing firm without the busywork: portals, permissions, documents, and workflows that stay under your control."
      />
      <BlogListing
        posts={posts.map(toCardData)}
        categories={categories}
        allHref={BLOG_BASE_PATH}
        allCount={posts.length}
        activeCategory="all"
        showFeatured
        gridTitle="Latest articles"
      />
      <ReadingFinalCta />
    </>
  )
}
