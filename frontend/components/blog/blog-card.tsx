'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, Clock } from 'lucide-react'

import { TextToSpeech } from '@/components/blog/text-to-speech'
import { formatBlogCategoryName } from '@/lib/blog-format'
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav'
import { cn, formatFullDate } from '@/lib/utils'

interface BlogCardProps {
  post: {
    id?: string
    slug: string
    title: string
    date: string
    excerpt: string
    tags: string[]
    category: string
    image: string
    readingTime?: number
    content?: string
  }
}

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

function truncateExcerpt(text: string, maxLength = 140): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}…`
}

function listenPlainText(post: BlogCardProps['post']): string {
  if (post.content && post.content.length > 0) {
    let contentText = post.content
    if (post.excerpt) {
      const normalizedExcerpt = post.excerpt.trim().toLowerCase().replace(/\s+/g, ' ')
      const normalizedContent = contentText.trim().toLowerCase().replace(/\s+/g, ' ')
      if (normalizedContent.startsWith(normalizedExcerpt)) {
        contentText = contentText.substring(post.excerpt.length).trim()
        contentText = contentText.replace(/^[.,;:\s]+/, '').trim()
      }
    }
    return `${post.title}. ${contentText}`
  }
  return `${post.title}. ${post.excerpt}`
}

export function BlogCard({ post }: BlogCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isAudioPaused, setIsAudioPaused] = useState(false)

  const categoryUpper = formatBlogCategoryName(post.category).toUpperCase()
  const href = `${BLOG_BASE_PATH}/${post.category}/${post.slug}`
  const imageZoom = isHovered || (isAudioPlaying && !isAudioPaused)

  return (
    <article
      className="group flex h-full flex-col"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative mb-6 aspect-video overflow-hidden bg-[#f0edee]">
        <Link
          href={href}
          className="absolute inset-0 z-0 block outline-none focus-visible:ring-2 focus-visible:ring-[#001256] focus-visible:ring-inset"
          aria-label={`Open article: ${post.title}`}
        >
          <Image
            src={post.image}
            alt=""
            fill
            className={cn(
              'object-cover transition-transform duration-500 ease-out',
              imageZoom ? 'scale-105' : 'scale-100',
            )}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </Link>
        <div className="pointer-events-none absolute left-4 top-4 z-[1]">
          <span
            className={`bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#1b1b1d] shadow-sm backdrop-blur-sm ${H}`}
          >
            {categoryUpper}
          </span>
        </div>
        <div className="absolute right-3 top-3 z-[2]">
          <TextToSpeech
            text={listenPlainText(post)}
            title={`Listen: ${post.title}`}
            size="sm"
            tone="kinetic"
            cardHovered={isHovered}
            onPlayingStateChange={(playing, paused) => {
              setIsAudioPlaying(playing)
              setIsAudioPaused(paused)
            }}
          />
        </div>
      </div>

      <Link
        href={href}
        className="flex flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-[#001256] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fcf8fa]"
      >
        <div
          className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-widest text-[#45474c] ${H}`}
        >
          <time dateTime={post.date}>{formatFullDate(post.date).toUpperCase()}</time>
          {post.readingTime ? (
            <>
              <span className="text-[#c6c6cc]" aria-hidden>
                •
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                {String(post.readingTime).padStart(2, '0')} min read
              </span>
            </>
          ) : null}
        </div>

        <h2
          className={`mb-3 text-2xl font-bold leading-snug tracking-tight text-[#1b1b1d] transition-colors duration-300 group-hover:text-[#006e16] ${H}`}
        >
          {post.title}
        </h2>
        <p className={`mb-6 flex-1 text-[#45474c] ${B}`}>{truncateExcerpt(post.excerpt)}</p>
        <span
          className={`mt-auto inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#006e16] transition-colors group-hover:text-[#004a0f] ${H}`}
        >
          Read more
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    </article>
  )
}
