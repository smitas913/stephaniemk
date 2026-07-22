import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { toLocalDateKey } from "@/lib/dateOnly";
import SalesRevenueTile from "@/components/focus/SalesRevenueTile";
import type { FocusItemConfig } from "@/hooks/useFocusItems";

interface WeeklyProgressRow {
  focus_date: string;
  sort_order: number;
  auto_count: number;
  manual_adjustment: number;
  is_complete: boolean;
  day_type: string;
}

interface FocusWeeklyViewProps {
  configs: FocusItemConfig[];
  weekData: WeeklyProgressRow[];
  onDayClick: (dateKey: string) => void;
  weekStart: string;
}

export default function FocusWeeklyView({ configs, weekData, onDayClick, weekStart: weekStartKey }: FocusWeeklyViewProps) {
  const todayKey = toLocalDateKey();
  const weekStart = new Date(weekStartKey + "T12:00:00");

  const days = Array.from({ length: 7 }, (_, i) => toLocalDateKey(addDays(weekStart, i)));

  const weekTotals = useMemo(() => {
    return configs.map(config => {
      let total = 0;
      for (const dayKey of days) {
        if (dayKey > todayKey) continue;
        const row = weekData.find(r => r.focus_date === dayKey && r.sort_order === config.sort_order);
        total += row ? row.auto_count + row.manual_adjustment : 0;
      }
      return { label: config.label, total };
    });
  }, [configs, weekData, days, todayKey]);

  return (
    <div className="space-y-3">
      {/* Day pills */}
      <div className="flex gap-1">
        {days.map(dayKey => {
          const isFuture = dayKey > todayKey;
          const isCurrentDay = dayKey === todayKey;
          const dayLabel = format(new Date(dayKey + "T12:00:00"), "EEE");
          const dayNum = format(new Date(dayKey + "T12:00:00"), "d");
          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => !isFuture && onDayClick(dayKey)}
              disabled={isFuture}
              className={cn(
                "flex-1 flex flex-col items-center py-1 rounded-md text-[10px] transition-colors",
                isFuture && "opacity-30 cursor-not-allowed",
                isCurrentDay ? "bg-primary/10 border border-primary/30 font-bold" : "hover:bg-muted",
              )}
            >
              <span className="text-muted-foreground">{dayLabel}</span>
              <span className={cn("text-xs font-semibold", isCurrentDay ? "text-primary" : "text-foreground")}>{dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* Weekly totals — plain counts */}
      <div className="space-y-1.5">
        {weekTotals.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-b-0">
            <span className="text-foreground font-medium truncate">{item.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{item.total}</span>
          </div>
        ))}
        <SalesRevenueTile selectedDate={weekStartKey} compact showWeekly />
      </div>
    </div>
  );
}
