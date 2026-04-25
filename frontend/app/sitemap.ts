import { MetadataRoute } from 'next'
import { getAllPosts, getAllCategories } from '@/lib/blog-utils'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import { BLOG_BASE_PATH, TRUST_CENTER_PATH } from '@/lib/marketing/target-audience-nav'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getPlatformSiteOrigin()
  
  try {
    // Static pages. `/resources/docs/**` is intentionally omitted while the in-app user guide is stale / not surfaced in marketing nav.
    const staticPages: MetadataRoute.Sitemap = [
      {
        url: baseUrl,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 1,
      },
      {
        url: `${baseUrl}${BLOG_BASE_PATH}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.9,
      },
      {
        url: `${baseUrl}/contact`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.7,
      },
      {
        url: `${baseUrl}/resources/faq`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.7,
      },
      {
        url: `${baseUrl}/privacy`,
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
      {
        url: `${baseUrl}/terms`,
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
      {
        url: `${baseUrl}${TRUST_CENTER_PATH}`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.6,
      },
      {
        url: `${baseUrl}/pricing`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.8,
      },
      {
        url: `${baseUrl}/waitlist`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.7,
      },
    ]

    // Blog category pages
    const categories = getAllCategories()
    const categoryPages: MetadataRoute.Sitemap = categories.map((category) => ({
      url: `${baseUrl}${BLOG_BASE_PATH}/${category}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }))

    // Blog post pages — pillar posts get higher priority
    const posts = getAllPosts()
    const blogPostPages: MetadataRoute.Sitemap = posts.map((post) => ({
      url: `${baseUrl}${BLOG_BASE_PATH}/${post.category}/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'weekly',
      priority: post.pillar ? 0.9 : 0.7,
    }))

    return [...staticPages, ...categoryPages, ...blogPostPages]
  } catch (error) {
    console.error('Error generating sitemap:', error)
    // Return at least static pages if blog posts fail
    return [
      {
        url: baseUrl,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 1,
      },
      {
        url: `${baseUrl}${BLOG_BASE_PATH}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.9,
      },
    ]
  }
}
