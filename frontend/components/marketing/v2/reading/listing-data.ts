/**
 * Server-side data for the blog listings: every post, and the category pills (every category from
 * `getAllCategories()`, with its post count). Reads the content folder, so server components only.
 */
import { getAllCategories, getAllPosts } from '@/lib/blog-utils';
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav';
import type { CategoryPill } from './blog-listing';
import { categoryLabel } from './format';

export function blogListingData() {
  const posts = getAllPosts();
  const categories: CategoryPill[] = getAllCategories().map((slug) => ({
    slug,
    label: categoryLabel(slug),
    href: `${BLOG_BASE_PATH}/${slug}`,
    count: posts.filter((p) => p.category === slug).length,
  }));
  return { posts, categories };
}
