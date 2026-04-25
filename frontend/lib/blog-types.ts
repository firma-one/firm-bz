export interface BlogPost {
  id: string
  slug: string
  title: string
  date: string
  excerpt: string
  tags: string[]
  category: string
  image: string
  content?: string
  readingTime?: number
  author?: string
  authorTitle?: string
  focusKeyword?: string
  series?: string
  tldr?: string
  pillar?: boolean
}
