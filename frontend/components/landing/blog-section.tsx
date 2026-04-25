"use client"

import { ArrowRight } from "lucide-react"
import { BlogCard } from "@/components/blog/blog-card"
import { BLOG_BASE_PATH, MARKETING_PAGE_SHELL } from "@/lib/marketing/target-audience-nav"
import type { BlogPost } from "@/lib/blog-types"

interface BlogSectionProps {
  posts: BlogPost[]
  audienceLabel: string
}

export function BlogSection({ posts, audienceLabel }: BlogSectionProps) {
  if (!posts || posts.length === 0) {
    return null
  }

  return (
    <section className="py-16 md:py-24 border-t border-[#c6c6cc]/20">
      <div className={MARKETING_PAGE_SHELL}>
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1b1b1d] mb-2">
              Latest Articles for {audienceLabel}
            </h2>
            <p className="text-lg text-[#45474c]">
              Stay updated with insights, best practices, and product updates tailored to your role.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {posts.map((post) => (
              <BlogCard key={post.id || post.slug} post={post} />
            ))}
          </div>

          <div className="flex justify-center">
            <a
              href={BLOG_BASE_PATH}
              className="inline-flex items-center gap-2 px-6 py-3 text-[#001256] font-semibold hover:text-[#5a78ff] transition-colors group"
            >
              View all articles
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
      </div>
    </section>
  )
}
