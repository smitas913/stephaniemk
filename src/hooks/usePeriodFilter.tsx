import { createContext, useContext, useState, type ReactNode } from "react";
import { subMonths } from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type PeriodValue =
  | { type: "ytd" }
  | { type: "mtd" }
  | { type: "last-month" }
  | { type: "month"; year: number; month: number };

export function getShortLabel(period: PeriodValue): string {
  const now = new Date();
  switch (period.type) {
    case "ytd": return "YTD";
    case "mtd": return "MTD";
    case "last-month": { const prev = subMonths(now, 1); return MONTHS[prev.getMonth()]; }
    case "month": return `${MONTHS[period.month].slice(0, 3)} ${period.year}`;
  }
}

type Ctx = { period: PeriodValue; setPeriod: (p: PeriodValue) => void };
const PeriodContext = createContext<Ctx | null>(null);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<PeriodValue>({ type: "mtd" });
  return <PeriodContext.Provider value={{ period, setPeriod }}>{children}</PeriodContext.Provider>;
}

export function usePeriodFilter() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriodFilter must be inside PeriodProvider");
  return ctx;
}
