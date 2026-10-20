import { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BlogListing } from '@/components/marketing/v2/reading/blog-listing'
import { ReadingFinalCta } from '@/components/marketing/v2/reading/closing'
import { categoryLabel, toCardData } from '@/components/marketing/v2/reading/format'
import { blogListingData } from '@/components/marketing/v2/reading/listing-data'
import { ListingHeader } from '@/components/marketing/v2/reading/listing-header'
import { BRAND_NAME } from '@/config/brand'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import {
  formatBlogCategoryName,
  getAllCategories,
  getPostsByCategory,
} from '@/lib/blog-utils'
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav'

interface CategoryPageProps {
  params: Promise<{
    category: string
  }>
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params
  const categoryName = formatBlogCategoryName(category)
  const posts = getPostsByCategory(category)
  const siteOrigin = getPlatformSiteOrigin()

  return {
    title: `${categoryName} | Blog | ${BRAND_NAME}`,
    description: `Browse ${posts.length} ${categoryName.toLowerCase()} articles and guides from ${BRAND_NAME}. ${posts
      .slice(0, 3)
      .map((p) => p.title)
      .join(', ')}`,
    keywords: [categoryName.toLowerCase(), 'blog', 'articles', 'guides'],
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
      title: `${categoryName} | Blog | ${BRAND_NAME}`,
      description: `Browse ${categoryName.toLowerCase()} articles and guides from ${BRAND_NAME}`,
      type: 'website',
      url: `${siteOrigin}${BLOG_BASE_PATH}/${category}`,
    },
    alternates: {
      canonical: `${siteOrigin}${BLOG_BASE_PATH}/${category}`,
    },
  }
}

export async function generateStaticParams() {
  const categories = getAllCategories()
  return categories.map((category) => ({
    category,
  }))
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params
  const categories = getAllCategories()

  if (!categories.includes(category)) {
    notFound()
  }

  const { posts: allPosts, categories: pills } = blogListingData()
  const posts = allPosts.filter((post) => post.category === category)
  const label = categoryLabel(category)

  return (
    <>
      <ListingHeader
        crumbs={[
          { label: 'Resources' },
          { label: 'Blog', href: BLOG_BASE_PATH },
          { label, href: `${BLOG_BASE_PATH}/${category}` },
        ]}
        title={label}
        lede={`${posts.length} ${posts.length === 1 ? 'article' : 'articles'} in this category`}
      />
      <BlogListing
        posts={posts.map(toCardData)}
        categories={pills}
        allHref={BLOG_BASE_PATH}
        allCount={allPosts.length}
        activeCategory={category}
        showFeatured={false}
        gridTitle="All articles"
      />
      <ReadingFinalCta />
    </>
  )
}
