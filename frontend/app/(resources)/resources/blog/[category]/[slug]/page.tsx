import { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleView } from '@/components/marketing/v2/reading/article-view'
import {
  categoryLabel,
  extractToc,
  stripLeadingH1,
  toCardData,
} from '@/components/marketing/v2/reading/format'
import { BRAND_NAME, BRAND_NAME_TEAM } from '@/config/brand'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import { extractPlainText, getAllCategories, getAllPosts, getPostBySlug } from '@/lib/blog-utils'
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav'

interface BlogPostPageProps {
  params: Promise<{
    category: string
    slug: string
  }>
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { category, slug } = await params
  const post = getPostBySlug(category, slug)
  const siteOrigin = getPlatformSiteOrigin()

  if (!post) {
    return {
      title: `Post Not Found | ${BRAND_NAME}`,
    }
  }

  // Prefer a post-specific social card (1200x630) when provided; fall back to the hero image.
  const socialImage = post.ogImage || post.image

  return {
    title: `${post.title} | Blog | ${BRAND_NAME}`,
    description: post.excerpt,
    keywords: [...(post.focusKeyword ? [post.focusKeyword] : []), ...post.tags, category, 'blog', 'article'],
    authors: [{ name: post.author || BRAND_NAME_TEAM }],
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
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.date,
      tags: post.tags,
      images: [socialImage],
      url: `${siteOrigin}${BLOG_BASE_PATH}/${category}/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [socialImage],
    },
    alternates: {
      canonical: `${siteOrigin}${BLOG_BASE_PATH}/${category}/${slug}`,
    },
  }
}

export async function generateStaticParams() {
  const posts = getAllPosts()
  return posts.map((post) => ({
    category: post.category,
    slug: post.slug,
  }))
}

/** "Keep reading": the newest posts from the same category, topped up with the newest overall. */
function relatedPosts(category: string, slug: string, count = 3) {
  const others = getAllPosts().filter((p) => !(p.category === category && p.slug === slug))
  const sameCategory = others.filter((p) => p.category === category)
  const elsewhere = others.filter((p) => p.category !== category)
  return [...sameCategory, ...elsewhere].slice(0, count).map(toCardData)
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { category, slug } = await params
  const categories = getAllCategories()

  if (!categories.includes(category)) {
    notFound()
  }

  const post = getPostBySlug(category, slug)

  if (!post) {
    notFound()
  }

  const siteOrigin = getPlatformSiteOrigin()
  const markdown = stripLeadingH1(post.content || '')

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Organization',
      name: BRAND_NAME,
      url: siteOrigin,
    },
    publisher: {
      '@type': 'Organization',
      name: BRAND_NAME,
      logo: {
        '@type': 'ImageObject',
        url: `${siteOrigin}/logo-120x120.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteOrigin}${BLOG_BASE_PATH}/${category}/${slug}`,
    },
    image: post.ogImage || post.image,
    keywords: post.tags.join(', '),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ArticleView
        post={{
          title: post.title,
          excerpt: post.excerpt,
          date: post.date,
          readingTime: post.readingTime,
          authorName: post.author || BRAND_NAME_TEAM,
          authorTitle: post.authorTitle || BRAND_NAME,
          image: post.image,
          tldr: post.tldr,
          tags: post.tags,
          markdown,
          listenText: `${post.title}. ${extractPlainText(markdown)}`,
        }}
        crumbs={[
          { label: 'Resources' },
          { label: 'Blog', href: BLOG_BASE_PATH },
          { label: categoryLabel(category), href: `${BLOG_BASE_PATH}/${category}` },
        ]}
        toc={extractToc(markdown)}
        related={relatedPosts(category, slug)}
      />
    </>
  )
}
