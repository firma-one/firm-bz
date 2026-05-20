import { getUserReminders } from '@/lib/actions/user-reminders'
import { RemindersTable } from './reminders-table'

export const metadata = { title: 'Reminders' }

export default async function RemindersPage() {
  const reminders = await getUserReminders()
  return <RemindersTable initialReminders={reminders} />
}
