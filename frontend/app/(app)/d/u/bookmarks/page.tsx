import { getUserBookmarks } from '@/lib/actions/user-bookmarks'
import { BookmarksTable } from './bookmarks-table'
import { MovedPage } from '../moved-page'

export const metadata = { title: 'Bookmarks' }

/** Bookmarks live on Home now (each firm shows its own); this forwards there. */
export default async function BookmarksPage() {
  const bookmarks = await getUserBookmarks()
  const atCap = bookmarks.length >= 50
  return (
    <MovedPage to="home">
      <BookmarksTable initialBookmarks={bookmarks} atCap={atCap} />
    </MovedPage>
  )
}
