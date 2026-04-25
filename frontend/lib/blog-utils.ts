import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

import type { BlogPost } from '@/lib/blog-types'

export type { BlogPost } from '@/lib/blog-types'
export { formatBlogCategoryName } from '@/lib/blog-format'

const postsDirectory = path.join(process.cwd(), 'content', 'blog')

// Extract plain text from markdown content
// Preserves headings (with #) for text-to-speech pause detection
export function extractPlainText(content: string | undefined): string {
  if (!content) return ''
  
  // Remove markdown syntax and extract text
  // Keep headings (# ## ### etc.) for text-to-speech pause detection
  const text = content
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Replace markdown links with text
    .replace(/[*\-_]/g, '') // Remove markdown formatting (but keep # for headings)
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1') // Replace image alt text
    // Keep headings with # markers - they'll be processed by text-to-speech
    .replace(/\n+/g, '\n') // Normalize newlines (keep them for heading detection)
    .replace(/[ \t]+/g, ' ') // Normalize spaces
    .trim()
  
  return text
}

// Calculate reading time in minutes based on word count
// Average reading speed: 200 words per minute
export function getReadingTime(content: string | undefined): number {
  if (!content) return 1
  
  const text = extractPlainText(content)
  const wordCount = text.split(/\s+/).filter(word => word.length > 0).length
  const readingTime = Math.ceil(wordCount / 200)
  
  return Math.max(1, readingTime) // Minimum 1 minute
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(postsDirectory)) {
    return []
  }

  const categories = ['comparisons', 'use-cases', 'guides', 'product', 'best-practices']
  const allPosts: BlogPost[] = []

  categories.forEach((category) => {
    const categoryPath = path.join(postsDirectory, category)
    if (!fs.existsSync(categoryPath)) {
      return
    }

    const fileNames = fs.readdirSync(categoryPath)
    const categoryPosts = fileNames
      .filter((name) => name.endsWith('.mdx'))
      .map((fileName) => {
        const fullPath = path.join(categoryPath, fileName)
        const fileContents = fs.readFileSync(fullPath, 'utf8')
        const { data, content } = matter(fileContents)
        const slug = fileName.replace(/\.mdx$/, '')
        
        // Generate unique ID: use provided id, or fallback to category-slug-date combination
        const id = data.id || `${category}-${slug}-${data.date || ''}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase()

        return {
          id,
          slug,
          title: data.title || '',
          date: data.date || '',
          excerpt: data.excerpt || '',
          tags: data.tags || [],
          category,
          image: data.image || `/images/blog/${category}-default.jpg`,
          content,
          readingTime: getReadingTime(content),
          author: data.author,
          authorTitle: data.authorTitle,
          focusKeyword: data.focusKeyword,
          series: data.series,
          tldr: data.tldr,
          pillar: data.pillar ?? false,
        } as BlogPost
      })

    allPosts.push(...categoryPosts)
  })

  // Sort by date, newest first
  return allPosts.sort((a, b) => {
    if (a.date < b.date) {
      return 1
    } else {
      return -1
    }
  })
}

export function getPostsByCategory(category: string): BlogPost[] {
  return getAllPosts().filter((post) => post.category === category)
}

export function getPostBySlug(category: string, slug: string): BlogPost | null {
  // Validate inputs
  if (!category || !slug || typeof category !== 'string' || typeof slug !== 'string') {
    return null
  }

  const filePath = path.join(postsDirectory, category, `${slug}.mdx`)
  
  if (!fs.existsSync(filePath)) {
    return null
  }

  const fileContents = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(fileContents)
  
  // Generate unique ID: use provided id, or fallback to category-slug-date combination
  const id = data.id || `${category}-${slug}-${data.date || ''}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase()

  return {
    id,
    slug,
    title: data.title || '',
    date: data.date || '',
    excerpt: data.excerpt || '',
    tags: data.tags || [],
    category,
    image: data.image || `/images/blog/${category}-default.jpg`,
    content,
    readingTime: getReadingTime(content),
    author: data.author,
    authorTitle: data.authorTitle,
    focusKeyword: data.focusKeyword,
    series: data.series,
    tldr: data.tldr,
    pillar: data.pillar ?? false,
  } as BlogPost
}

export function getAllCategories(): string[] {
  return ['comparisons', 'use-cases', 'guides', 'product', 'best-practices']
}

// Map audience types to relevant blog tags for filtering
const audienceTagMap: Record<string, string[]> = {
  'fractional-cmo': ['fractional-cmo', 'cmo', 'consultants', 'client-portal', 'perception', 'branding'],
  'fulltime-cmo': ['fulltime-cmo', 'cmo', 'alignment', 'strategy', 'team', 'marketing-leadership'],
  'marketing-agencies': ['agencies', 'client-delivery', 'client-portal', 'competitive-advantage', 'pricing'],
}

export function getPostsByAudienceId(audienceId: string, limit = 3): BlogPost[] {
  const tags = audienceTagMap[audienceId]
  if (!tags) return []

  try {
    return getAllPosts()
      .filter(post => post.tags.some(tag => tags.includes(tag)))
      .slice(0, limit)
  } catch (error) {
    console.error(`Error fetching posts for audience ${audienceId}:`, error)
    return []
  }
}
