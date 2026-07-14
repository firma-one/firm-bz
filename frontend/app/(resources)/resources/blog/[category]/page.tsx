import { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { BlogListing } from '@/components/blog/blog-listing'
import { MarketingBreadcrumb } from '@/components/marketing/marketing-breadcrumb'
import { BRAND_NAME } from '@/config/brand'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import {
  formatBlogCategoryName,
  getAllCategories,
  getPostsByCategory,
} from '@/lib/blog-utils'
import { BLOG_BASE_PATH, MARKETING_PAGE_SHELL } from '@/lib/marketing/target-audience-nav'
import { cn } from '@/lib/utils'

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

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params
  const categories = getAllCategories()

  if (!categories.includes(category)) {
    notFound()
  }

  const posts = getPostsByCategory(category)
  const categoryName = formatBlogCategoryName(category)

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />

      <main className={cn(MARKETING_PAGE_SHELL, 'relative z-10 w-full flex-1 pb-16 pt-24 md:pb-24 lg:pt-28')}>
        <MarketingBreadcrumb
          items={[
            { label: 'Resources' },
            { label: 'Blog', href: BLOG_BASE_PATH },
            { label: categoryName },
          ]}
          className="mb-8 md:mb-10"
        />

        <header className="mb-12 md:mb-14">
          <h1
            className={`mb-3 text-4xl font-bold capitalize tracking-tighter text-[#1b1b1d] sm:text-5xl md:text-6xl ${H}`}
          >
            {categoryName}
          </h1>
          <p className={cn('text-lg text-[#45474c] md:text-xl', B)}>
            {posts.length} {posts.length === 1 ? 'article' : 'articles'} in this category
          </p>
        </header>

        {posts.length === 0 ? (
          <p className={cn('text-center text-[#45474c]', B)}>No posts in this category yet. Check back soon!</p>
        ) : (
          <BlogListing
            posts={posts}
            categories={categories}
            activeCategory={category}
            showFeatured={false}
          />
        )}
      </main>

      <Footer />
    </div>
  )
}
