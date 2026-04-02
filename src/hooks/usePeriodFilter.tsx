import { createContext, useContext, useState, type ReactNode } from "react";
import { startOfYear, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type PeriodValue =
  | { type: "ytd" }
  | { type: "mtd" }
  | { type: "last-month" }
  | { type: "month"; year: number; month: number };

export function getDateRange(period: PeriodValue): { start: Date; end: Date } {
  const now = new Date();
  switch (period.type) {
    case "ytd": return { start: startOfYear(now), end: now };
    case "mtd": return { start: startOfMonth(now), end: now };
    case "last-month": { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
    case "month": return { start: new Date(period.year, period.month, 1), end: endOfMonth(new Date(period.year, period.month, 1)) };
  }
}

export function getShortLabel(period: PeriodValue): string {
  const now = new Date();
  switch (period.type) {
    case "ytd": return "YTD";
    case "mtd": return "MTD";
    case "last-month": { const prev = subMonths(now, 1); return MONTHS[prev.getMonth()]; }
    case "month": return `${MONTHS[period.month].slice(0, 3)} ${period.year}`;
  }
}

export function getPeriodLabel(period: PeriodValue): string {
  const now = new Date();
  switch (period.type) {
    case "ytd": return `${now.getFullYear()} year-to-date overview`;
    case "mtd": return `${MONTHS[now.getMonth()]} ${now.getFullYear()} month-to-date`;
    case "last-month": { const prev = subMonths(now, 1); return `${MONTHS[prev.getMonth()]} ${prev.getFullYear()} overview`; }
    case "month": return `${MONTHS[period.month]} ${period.year} overview`;
  }
}

export function MonthYearPicker({ onSelect }: { onSelect: (year: number, month: number) => void }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  return (
    <div className="p-3 w-[260px]">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewYear(viewYear - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground">{viewYear}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewYear(viewYear + 1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS.map((m, i) => {
          const isFuture = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && i > now.getMonth());
          return (
            <Button key={m} variant="ghost" size="sm" disabled={isFuture}
              className={cn("text-xs h-8", viewYear === now.getFullYear() && i === now.getMonth() && "border border-primary/50")}
              onClick={() => onSelect(viewYear, i)}
            >{m.slice(0, 3)}</Button>
          );
        })}
      </div>
    </div>
  );
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
