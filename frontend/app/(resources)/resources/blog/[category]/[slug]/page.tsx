import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { MarketingBreadcrumb } from '@/components/marketing/marketing-breadcrumb'
import { RecentPostCard } from '@/components/blog/recent-post-card'
import { TextToSpeech } from '@/components/blog/text-to-speech'
import { BRAND_NAME, BRAND_NAME_TEAM } from '@/config/brand'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import {
  extractPlainText,
  formatBlogCategoryName,
  getAllCategories,
  getAllPosts,
  getPostBySlug,
} from '@/lib/blog-utils'
import { BLOG_BASE_PATH, MARKETING_PAGE_SHELL } from '@/lib/marketing/target-audience-nav'
import { cn, formatFullDate } from '@/lib/utils'

interface BlogPostPageProps {
  params: Promise<{
    category: string
    slug: string
  }>
}

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { category, slug } = await params
  const post = getPostBySlug(category, slug)
  const siteOrigin = getPlatformSiteOrigin()

  if (!post) {
    return {
      title: `Post Not Found | ${BRAND_NAME}`,
    }
  }

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
      images: [post.image],
      url: `${siteOrigin}${BLOG_BASE_PATH}/${category}/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [post.image],
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
  const categoryLabel = formatBlogCategoryName(category)

  const allPosts = getAllPosts()
  const recentPosts = allPosts
    .filter((p) => `${p.category}/${p.slug}` !== `${category}/${slug}`)
    .slice(0, 5)

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
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
    image: post.image,
    keywords: post.tags.join(', '),
  }

  const hx = 'font-bold tracking-tight text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] mt-10 mb-4 first:mt-0'

  const authorName = post.author || BRAND_NAME_TEAM
  const authorLabel = post.authorTitle || BRAND_NAME

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <article className="relative flex min-h-screen flex-col">
        <Header />

        <main className={cn(MARKETING_PAGE_SHELL, 'relative z-10 w-full flex-1 pb-16 md:pb-24')}>
          <div className="mb-10 flex flex-col gap-6 md:flex-row md:flex-wrap md:items-start md:justify-between lg:mb-12">
            <MarketingBreadcrumb
              className="mb-0"
              items={[
                { label: 'Resources' },
                { label: 'Blog', href: BLOG_BASE_PATH },
                { label: categoryLabel, href: `${BLOG_BASE_PATH}/${category}` },
                { label: post.title },
              ]}
            />
            <div
              className={cn(
                'flex flex-wrap items-stretch gap-8 md:border-l md:border-[#c6c6cc]/25 md:pl-8',
                H,
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#76777d]">
                  Published
                </span>
                <time className="text-sm font-bold text-[#1b1b1d]" dateTime={post.date}>
                  {formatFullDate(post.date)}
                </time>
              </div>
              {post.readingTime ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#76777d]">
                    Read time
                  </span>
                  <span className="text-sm font-bold text-[#1b1b1d]">{post.readingTime} min</span>
                </div>
              ) : null}
              <div className="flex flex-col justify-end">
                <span className="sr-only">Listen to this article</span>
                <TextToSpeech
                  text={`${post.title}. ${extractPlainText(post.content)}`}
                  size="md"
                  tone="kinetic"
                />
              </div>
            </div>
          </div>

          <header className="mb-12 max-w-4xl lg:mb-16">
            <h1
              className={`mb-8 text-4xl font-bold leading-[0.92] tracking-tighter text-[#1b1b1d] sm:text-5xl md:text-6xl lg:text-7xl ${H}`}
            >
              {post.title}
            </h1>
            <div className="flex items-center gap-4">
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#f0edee] text-sm font-bold text-[#006e16] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
                aria-hidden
              >
                {BRAND_NAME_TEAM.charAt(0)}
              </div>
              <div>
                <p className={cn('text-sm font-bold text-[#1b1b1d]', H)}>{authorName}</p>
                <p className={cn('text-xs text-[#45474c]', B)}>{authorLabel}</p>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-8">
              {post.tldr ? (
                <div
                  className={cn(
                    'mb-10 rounded-[4px] border border-[#72ff70]/30 bg-[#f0fff0] px-6 py-5',
                    B,
                  )}
                >
                  <p className={cn('mb-1 text-[10px] font-bold uppercase tracking-widest text-[#006e16]', H)}>
                    TL;DR
                  </p>
                  <p className="text-sm leading-relaxed text-[#1b1b1d]">{post.tldr}</p>
                </div>
              ) : null}

              {post.image ? (
                <div className="relative mb-12 aspect-[21/9] w-full overflow-hidden rounded-[4px] bg-[#f6f3f4] lg:mb-16">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, min(48rem, 50vw)"
                    priority
                  />
                </div>
              ) : null}

              <div
                className={cn(
                  'max-w-none text-base leading-relaxed text-[#1b1b1d] md:text-lg',
                  '[&_p]:mb-5 [&_p]:text-[#45474c]',
                  '[&_a]:font-medium [&_a]:text-[#006e16] [&_a]:no-underline hover:[&_a]:underline',
                  '[&_strong]:font-semibold [&_strong]:text-[#1b1b1d]',
                  '[&_code]:rounded-sm [&_code]:bg-[#f6f3f4] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:text-[#1b1b1d]',
                  '[&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-[4px] [&_pre]:border [&_pre]:border-[#eae7e9] [&_pre]:bg-[#f6f3f4] [&_pre]:p-4 [&_pre]:text-sm',
                  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
                  '[&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6',
                  '[&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6',
                  '[&_li]:my-2 [&_li]:text-[#45474c]',
                  '[&_blockquote]:my-8 [&_blockquote]:border-l-4 [&_blockquote]:border-[#006e16] [&_blockquote]:py-1 [&_blockquote]:pl-6 [&_blockquote]:italic [&_blockquote]:text-[#45474c]',
                  '[&_hr]:my-10 [&_hr]:border-[#eae7e9]',
                  '[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
                  '[&_th]:border [&_th]:border-[#eae7e9] [&_th]:bg-[#f6f3f4] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_th]:text-[#1b1b1d]',
                  '[&_td]:border [&_td]:border-[#eae7e9] [&_td]:px-3 [&_td]:py-2 [&_td]:text-[#45474c]',
                  '[&_img]:my-6 [&_img]:max-h-[min(70vh,520px)] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-[4px]',
                  B,
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node: _node, ...props }) => (
                      <h1 {...props} className={cn(hx, 'text-3xl md:text-4xl')} />
                    ),
                    h2: ({ node: _node, ...props }) => (
                      <h2 {...props} className={cn(hx, 'text-2xl md:text-3xl')} />
                    ),
                    h3: ({ node: _node, ...props }) => (
                      <h3 {...props} className={cn(hx, 'text-xl md:text-2xl')} />
                    ),
                    h4: ({ node: _node, ...props }) => (
                      <h4 {...props} className={cn(hx, 'text-lg md:text-xl')} />
                    ),
                  }}
                >
                  {post.content || ''}
                </ReactMarkdown>
              </div>

              {post.tags.length > 0 ? (
                <div className="mt-14 flex flex-col gap-6 border-t border-[#c6c6cc]/25 pt-10 md:mt-20 md:pt-12">
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className={cn(
                          'rounded-[4px] bg-[#f0edee] px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#45474c]',
                          H,
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-28 lg:space-y-10">
                <div className="mb-10 rounded-[4px] bg-[#141c2a] p-8 lg:mb-0">
                  <h2 className={`mb-2 text-lg font-bold text-[#72ff70] ${H}`}>Stay in the loop</h2>
                  <p className={cn('mb-6 text-sm leading-relaxed text-[#7c8496]', B)}>
                    Questions, demos, or product updates — we read every message.
                  </p>
                  <Link
                    href="/contact"
                    className={cn(
                      'inline-flex w-full items-center justify-center rounded-[4px] bg-[#72ff70] px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-[#002203] transition-all duration-200',
                      'hover:brightness-110',
                      H,
                    )}
                  >
                    Contact us
                  </Link>
                </div>

                <div>
                  <h2 className={`mb-8 text-xl font-bold tracking-tight text-[#1b1b1d] ${H}`}>
                    Recent insights
                  </h2>
                  <div className="flex flex-col gap-10">
                    {recentPosts.map((recentPost) => (
                      <RecentPostCard key={recentPost.id} post={recentPost} />
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </main>

        <Footer />
      </article>
    </>
  )
}
