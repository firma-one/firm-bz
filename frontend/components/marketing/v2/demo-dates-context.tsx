'use client';

/**
 * Provides `demoDates()` to the product scenes. The server renders with its own calendar day (passed
 * as y/m/d so the first client render matches it exactly), then the browser switches to its local
 * today after hydration. Static pages built days ago therefore still show dates relative to today.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { demoDates, type DemoDates } from './demo-dates';

const DemoDatesContext = createContext<DemoDates | null>(null);

export function DemoDatesProvider({ day, children }: { day: [number, number, number]; children: ReactNode }) {
  const [dates, setDates] = useState(() => demoDates(new Date(day[0], day[1], day[2], 12)));
  useEffect(() => {
    const now = new Date();
    if (now.getFullYear() !== day[0] || now.getMonth() !== day[1] || now.getDate() !== day[2]) setDates(demoDates(now));
  }, [day]);
  return <DemoDatesContext.Provider value={dates}>{children}</DemoDatesContext.Provider>;
}

export function useDemoDates(): DemoDates {
  const d = useContext(DemoDatesContext);
  return d ?? demoDates();
}

type StringKey = { [K in keyof DemoDates]: DemoDates[K] extends string ? K : never }[keyof DemoDates];

/** One date, as a leaf that server components can drop into static markup. */
export function DemoDate({ k }: { k: StringKey }) {
  return <>{useDemoDates()[k]}</>;
}

