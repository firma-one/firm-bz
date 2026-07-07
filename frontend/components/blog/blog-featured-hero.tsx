import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import type { BlogPost } from '@/lib/blog-types'
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav'

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'

export function BlogFeaturedHero({
  post,
  categoryLabel,
}: {
  post: BlogPost
  categoryLabel: string
}) {
  const readLabel = post.readingTime
    ? `${String(post.readingTime).padStart(2, '0')} min read`
    : null

  return (
    <Link
      href={`${BLOG_BASE_PATH}/${post.category}/${post.slug}`}
      className="group relative block min-h-[220px] w-full overflow-hidden rounded-[4px] aspect-[21/9]"
    >
      <div className="absolute inset-0">
        <Image
          src={post.image}
          alt={post.title}
          fill
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          sizes="(max-width: 1024px) 100vw, min(92rem, 100vw)"
          priority
        />
      </div>
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent"
        aria-hidden
      />
      <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-10 lg:p-12">
        <div className="w-full max-w-[min(100%,48rem)]">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className={cnChip('bg-[#006e16] text-white')}>Featured</span>
            <span className={cnChip('bg-white/15 text-white backdrop-blur-sm')}>
              {categoryLabel.toUpperCase()}
            </span>
            {readLabel ? (
              <span className={cnChip('text-white/90')}>{readLabel.toUpperCase()}</span>
            ) : null}
          </div>
          <h2
            className={`mb-6 text-3xl font-bold leading-[1.05] tracking-tighter text-white sm:text-4xl md:text-5xl ${H}`}
          >
            {post.title}
          </h2>
          <span
            className={`inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#72ff70] transition-transform duration-300 group-hover:translate-x-1 ${H}`}
          >
            Read article
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  )
}

function cnChip(extra: string) {
  return `rounded px-3 py-1 text-[10px] font-bold uppercase tracking-widest [font-family:var(--font-kinetic-headline),system-ui,sans-serif] ${extra}`
}
