import { describe, expect, it } from 'vitest';
import { demoDates } from './demo-dates';

describe('demoDates', () => {
  it('keeps the demo data exact on the day it was written (Sun Oct 18, 2026)', () => {
    const d = demoDates(new Date(2026, 9, 18, 10, 0));
    expect(d.q2End).toBe('Nov 1, 2026');
    expect(d.q2Start).toBe('Aug 3, 2026');
    expect(d.d02).toBe('Oct 8, 2026');
    // Sunday: the week ahead starts tomorrow, so business days are Mon 19 … Fri 23.
    expect(d.week.map((w) => w.num)).toEqual([19, 20, 21, 22, 23]);
    expect(d.week.some((w) => w.isToday)).toBe(false);
    expect(d.weekLabel).toBe('Oct 19 – 23');
  });

  it('moves every date with today and lands near-term dates on business days', () => {
    const d = demoDates(new Date(2026, 9, 20, 9, 0)); // Tue Oct 20, 2026
    expect(d.q2End).toBe('Nov 3, 2026');
    expect(d.d02Rel).toBe('Oct 10');
    // Two business days after Tuesday is Thursday, inside this week.
    expect(d.d03Rel).toBe('Thursday');
    expect(d.d03Short).toBe('Thu');
    expect(d.follow).toBe('Fri');
    expect(d.week[0]).toMatchObject({ name: 'Today', num: 20, isToday: true });
    expect(d.week.find((w) => w.event?.label === 'PR & Media Pack')?.num).toBe(22);
  });

  it('says today, tomorrow and yesterday in words', () => {
    // Fri Oct 23: the PR pack is due two business days later, on Tuesday of next week.
    const d = demoDates(new Date(2026, 9, 23, 9, 0));
    expect(d.d03Rel).toBe('Oct 27');
    expect(d.follow).toBe('Wed, Oct 28');
    expect(d.week.map((w) => w.num)).toEqual([23, 26, 27, 28, 29]);
    expect(d.weekLabel).toBe('Oct 23 – 29');
  });

  it('shows the year only for far dates in another year', () => {
    const d = demoDates(new Date(2027, 0, 4, 9, 0)); // Mon Jan 4, 2027
    expect(d.d01Short).toBe('Dec 13');
    expect(d.q2End).toBe('Jan 18, 2027');
  });
});
