import { getUserReminders } from '@/lib/actions/user-reminders'
import { RemindersTable } from './reminders-table'
import { MovedPage } from '../moved-page'

export const metadata = { title: 'Reminders' }

export default async function RemindersPage() {
  const reminders = await getUserReminders()
  // Reminders live in the firm Inbox now; this forwards there (the table stays for firm-less users).
  return (
    <MovedPage to="reminders">
      <RemindersTable initialReminders={reminders} />
    </MovedPage>
  )
}
