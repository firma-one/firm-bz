'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { loadCalendarData, type CalendarData } from '@/lib/calendar/calendar-data'

export type {
  CalendarData,
  CalendarEngagement,
  CalendarEvent,
  CalendarEventAssignee,
  CalendarEventType,
} from '@/lib/calendar/calendar-data'

const EMPTY_CALENDAR_DATA: CalendarData = { engagements: [], events: [] }

/**
 * Fetch all Engagement/Deliverable calendar events for a firm, scoped to the
 * requesting user's engagement memberships. The query and its visibility rules live in
 * loadCalendarData (lib/calendar/calendar-data.ts), shared with the cross-firm Home's agenda.
 */
export async function getFirmCalendarData(firmSlug: string): Promise<CalendarData> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) redirect('/signin')
  const user = session.user

  const firm = await prisma.firm.findUnique({
    where: { slug: firmSlug },
    select: { id: true, slug: true, group: { select: { slug: true } } },
  })
  if (!firm) return EMPTY_CALENDAR_DATA

  const anyMembership = await prisma.firmMember.findFirst({
    where: { userId: user.id, firmId: firm.id },
  })
  if (!anyMembership) return EMPTY_CALENDAR_DATA

  return loadCalendarData({
    userId: user.id,
    firms: [{ id: firm.id, slug: firm.slug, groupSlug: firm.group.slug }],
  })
}
