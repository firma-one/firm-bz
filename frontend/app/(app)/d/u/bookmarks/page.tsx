import { getUserBookmarks } from '@/lib/actions/user-bookmarks'
import { BookmarksTable } from './bookmarks-table'

export const metadata = { title: 'Bookmarks' }

export default async function BookmarksPage() {
  const bookmarks = await getUserBookmarks()
  const atCap = bookmarks.length >= 50
  return <BookmarksTable initialBookmarks={bookmarks} atCap={atCap} />
}
