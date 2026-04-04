import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Phone, CalendarPlus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toLocalDateKey } from "@/lib/dateOnly";
import type { FocusRawData } from "@/components/TodaysFocus";
import { computeMetricsForDate } from "@/lib/focusMetrics";

const WEEKLY_TARGETS = { reachOuts: 50, bookings: 10, sharing: 5 };
const DAILY_TARGET = 8;

interface WeeklyScorecardProps {
  rawData?: FocusRawData;
  todayReachOuts: number;
  todayBookings: number;
  todaySharing: number;
  onDayClick: (dateKey: string) => void;
}

function statusColor(current: number, target: number): string {
  if (current === 0) return "bg-destructive/15 text-destructive";
  if (current >= target) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
}

export default function WeeklyScorecard({
  rawData,
  todayReachOuts,
  todayBookings,
  todaySharing,
  onDayClick,
}: WeeklyScorecardProps) {
  const todayKey = toLocalDateKey();
  const todayDate = new Date(todayKey + "T12:00:00");
  const currentWeekStart = startOfWeek(todayDate, { weekStartsOn: 1 });

  const [weekOffset, setWeekOffset] = useMemo(() => [0], []);
  // We need state for week offset
  const { useState } = require("react");
  const [offset, setOffset] = useState(0);

  const weekStart = useMemo(() => {
    if (offset === 0) return currentWeekStart;
    return offset < 0 ? subWeeks(currentWeekStart, Math.abs(offset)) : addWeeks(currentWeekStart, offset);
  }, [offset, currentWeekStart]);

  const days = useMemo(() => {
    const result: { dateKey: string; dayLabel: string; date: Date }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      result.push({
        dateKey: toLocalDateKey(d),
        dayLabel: format(d, "EEE"),
        date: d,
      });
    }
    return result;
  }, [weekStart]);

  const isCurrentWeek = offset === 0;
  const isFutureBlocked = isCurrentWeek;

  const dayMetrics = useMemo(() => {
    return days.map(({ dateKey }) => {
      if (dateKey === todayKey) {
        return { reachOuts: todayReachOuts, bookings: todayBookings, sharing: todaySharing };
      }
      if (dateKey > todayKey) {
        return { reachOuts: 0, bookings: 0, sharing: 0 };
      }
      if (!rawData) return { reachOuts: 0, bookings: 0, sharing: 0 };
      const m = computeMetricsForDate(dateKey, rawData);
      return { reachOuts: m.reachOuts, bookings: m.bookings, sharing: m.sharing };
    });
  }, [days, todayKey, todayReachOuts, todayBookings, todaySharing, rawData]);

  const totals = useMemo(() => {
    return dayMetrics.reduce(
      (acc, m) => ({
        reachOuts: acc.reachOuts + m.reachOuts,
        bookings: acc.bookings + m.bookings,
        sharing: acc.sharing + m.sharing,
      }),
      { reachOuts: 0, bookings: 0, sharing: 0 }
    );
  }, [dayMetrics]);

  const weekLabel = `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`;
  const reachPct = WEEKLY_TARGETS.reachOuts > 0 ? Math.min(100, Math.round((totals.reachOuts / WEEKLY_TARGETS.reachOuts) * 100)) : 0;

  return (
    <div className="space-y-3">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o: number) => o - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <button
          type="button"
          className="text-sm font-medium text-foreground hover:underline"
          onClick={() => setOffset(0)}
        >
          {isCurrentWeek ? "This Week" : weekLabel}
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o: number) => o + 1)} disabled={isFutureBlocked}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Weekly Totals */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-primary/10 p-2">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" /> Reach Outs
          </div>
          <p className="text-lg font-bold text-primary">{totals.reachOuts}</p>
          <p className="text-[10px] text-muted-foreground">/ {WEEKLY_TARGETS.reachOuts} target</p>
        </div>
        <div className="rounded-lg bg-emerald-500/10 p-2">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <CalendarPlus className="w-3 h-3" /> Bookings
          </div>
          <p className="text-lg font-bold text-emerald-600">{totals.bookings}</p>
          <p className="text-[10px] text-muted-foreground">/ {WEEKLY_TARGETS.bookings} target</p>
        </div>
        <div className="rounded-lg bg-violet-500/10 p-2">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Share2 className="w-3 h-3" /> Sharing
          </div>
          <p className="text-lg font-bold text-violet-600">{totals.sharing}</p>
          <p className="text-[10px] text-muted-foreground">/ {WEEKLY_TARGETS.sharing} target</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Weekly Reach Out Progress</span>
          <span>{reachPct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              reachPct >= 80 ? "bg-emerald-500" : reachPct >= 40 ? "bg-amber-500" : "bg-destructive"
            )}
            style={{ width: `${reachPct}%` }}
          />
        </div>
      </div>

      {/* Day-by-Day Grid */}
      <div className="space-y-1">
        {days.map((day, i) => {
          const m = dayMetrics[i];
          const isFuture = day.dateKey > todayKey;
          const isToday = day.dateKey === todayKey;
          return (
            <button
              key={day.dateKey}
              type="button"
              disabled={isFuture}
              onClick={() => onDayClick(day.dateKey)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors",
                isToday && "ring-1 ring-primary/30 bg-primary/5",
                isFuture ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/50 cursor-pointer"
              )}
            >
              {/* Day label */}
              <span className={cn("w-8 text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>
                {day.dayLabel}
              </span>
              <span className="text-[10px] text-muted-foreground w-12">
                {format(day.date, "M/d")}
              </span>

              {/* Metrics */}
              {!isFuture && (
                <div className="flex items-center gap-1.5 flex-1">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusColor(m.reachOuts, DAILY_TARGET))}>
                    {m.reachOuts} reach
                  </span>
                  {m.bookings > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      {m.bookings} book
                    </span>
                  )}
                  {m.sharing > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                      {m.sharing} share
                    </span>
                  )}
                </div>
              )}

              <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
