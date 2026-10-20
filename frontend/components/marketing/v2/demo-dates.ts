/**
 * Dates for the marketing product scenes, relative to today.
 *
 * The /tour demo data was written as if today were Oct 18, 2026 ("14 days left" to Nov 1). Every date
 * keeps its distance from today, so days-left, the percentages used and "behind pace" stay true.
 * Upcoming due dates and follow-ups land on business days.
 *
 * Display: Today / Tomorrow / Yesterday, a weekday inside the current week, otherwise "Oct 9" (the
 * year only when the date is more than six months away and in another year). Tables keep full dates.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type DemoCalendarDay = {
  /** "Today" or a short weekday. */
  name: string;
  num: number;
  isToday: boolean;
  event?: { label: string; bg: string; fg: string };
};

export type DemoDates = {
  /** Engagement window, full dates (Q2 – Product Launch Campaign). */
  q2Start: string;
  q2End: string;
  q2EndShort: string;
  /** Due dates of the other three engagements on Firm Overview. */
  r2Due: string;
  r3Due: string;
  r4Due: string;
  /** 01 GTM Plan (approved), 02 Creative & Landing Page Assets (overdue), 03 PR & Media Pack (next). */
  d01: string;
  d01Short: string;
  d02: string;
  d02Short: string;
  /** In prose: "was due Monday", "was due Oct 9". */
  d02Rel: string;
  d03: string;
  d03Short: string;
  d03Rel: string;
  /** Comment and reminder timestamps. */
  c6: string;
  c7: string;
  c8: string;
  /** Next client follow-up ("Thu" this week, otherwise "Thu, Oct 29"). */
  follow: string;
  /** Doc Search result dates, one per file. */
  search: [string, string, string, string, string, string];
  /** The next five business days from today, today highlighted. */
  week: DemoCalendarDay[];
  weekLabel: string;
};

/** Days between dates in the same local calendar (DST-safe). */
const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

export function demoDates(now: Date = new Date()): DemoDates {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = (from: Date, n: number) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
  const day = (n: number) => add(today, n);
  const isBiz = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
  const biz = (n: number) => {
    let d = today;
    let k = 0;
    while (k < n) {
      d = add(d, 1);
      if (isBiz(d)) k++;
    }
    return d;
  };
  const diff = (d: Date) => dayDiff(d, today);
  const monday = (d: Date) => add(d, -((d.getDay() + 6) % 7));
  const thisWeek = (d: Date) => monday(d).getTime() === monday(today).getTime();
  const md = (d: Date) =>
    `${MONTHS[d.getMonth()]} ${d.getDate()}` +
    (d.getFullYear() !== today.getFullYear() && Math.abs(diff(d)) > 182 ? `, ${d.getFullYear()}` : '');
  const mdy = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const short = (d: Date) => {
    const n = diff(d);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return thisWeek(d) ? WEEKDAYS[d.getDay()] : md(d);
  };
  const rel = (d: Date) => {
    const n = diff(d);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return thisWeek(d) ? WEEKDAYS_LONG[d.getDay()] : md(d);
  };

  const prDue = biz(2);
  const follow = biz(3);
  const q3Report = biz(4);

  // Five business days from today (from next Monday at the weekend).
  let start = today;
  while (!isBiz(start)) start = add(start, 1);
  const cal: Date[] = [];
  for (let d = start; cal.length < 5; d = add(d, 1)) if (isBiz(d)) cal.push(d);
  const events: [Date, string, string, string][] = [
    [prDue, 'PR & Media Pack', '#E3EDFB', '#1F5FAF'],
    [follow, 'Follow up · Horizon', '#FBF0D9', '#7A5200'],
    [q3Report, 'Q3 Growth Report', '#E2F2E7', '#2F7A46'],
  ];
  const week: DemoCalendarDay[] = cal.map((d) => {
    const isToday = diff(d) === 0;
    const ev = events.find((e) => e[0].getTime() === d.getTime());
    return {
      name: isToday ? 'Today' : WEEKDAYS[d.getDay()],
      num: d.getDate(),
      isToday,
      event: ev ? { label: ev[1], bg: ev[2], fg: ev[3] } : undefined,
    };
  });
  const a = cal[0];
  const z = cal[4];

  return {
    q2Start: mdy(day(-76)),
    q2End: mdy(day(14)),
    q2EndShort: short(day(14)),
    r2Due: short(day(21)),
    r3Due: short(day(45)),
    r4Due: short(day(60)),
    d01: mdy(day(-22)),
    d01Short: short(day(-22)),
    d02: mdy(day(-10)),
    d02Short: short(day(-10)),
    d02Rel: rel(day(-10)),
    d03: mdy(prDue),
    d03Short: short(prDue),
    d03Rel: rel(prDue),
    c6: short(day(-12)),
    c7: short(day(-11)),
    c8: short(day(-10)),
    follow: thisWeek(follow) ? WEEKDAYS[follow.getDay()] : `${WEEKDAYS[follow.getDay()]}, ${md(follow)}`,
    search: [short(day(-46)), short(day(-39)), short(day(-15)), short(day(-7)), short(day(-17)), short(day(-12))],
    week,
    weekLabel: a.getMonth() === z.getMonth() ? `${md(a)} – ${z.getDate()}` : `${md(a)} – ${md(z)}`,
  };
}

/** Today's calendar day on the server, as y/m/d for `DemoDatesProvider` (a plain function, callable from server components). */
export function serverDay(): [number, number, number] {
  const n = new Date();
  return [n.getFullYear(), n.getMonth(), n.getDate()];
}
