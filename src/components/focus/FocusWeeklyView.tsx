import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, addDays } from "date-fns";
import { toLocalDateKey } from "@/lib/dateOnly";
import { Progress } from "@/components/ui/progress";
import SalesRevenueTile from "@/components/focus/SalesRevenueTile";
import type { FocusItemConfig, DayType } from "@/hooks/useFocusItems";
import { DEFAULT_DAY_TYPE_TARGETS } from "@/hooks/useFocusItems";

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

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    return toLocalDateKey(d);
  });

  const weekTotals = useMemo(() => {
    return configs.map(config => {
      let totalCurrent = 0;
      let totalTarget = 0;
      for (const dayKey of days) {
        if (dayKey > todayKey) continue;
        const dayRows = weekData.filter(r => r.focus_date === dayKey && r.sort_order === config.sort_order);
        const row = dayRows[0];
        const current = row ? row.auto_count + row.manual_adjustment : 0;
        const dayType = (row?.day_type || "power") as DayType;
        const defaults = DEFAULT_DAY_TYPE_TARGETS[dayType];
        const target = defaults?.[config.sort_order] ?? config.default_target;
        totalCurrent += current;
        totalTarget += target;
      }
      return { label: config.label, current: totalCurrent, target: totalTarget };
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
          const dayCompleted = configs.every(config => {
            const row = weekData.find(r => r.focus_date === dayKey && r.sort_order === config.sort_order);
            if (!row) return false;
            const defaults = DEFAULT_DAY_TYPE_TARGETS[(row.day_type || "power") as DayType];
            const target = defaults?.[config.sort_order] ?? config.default_target;
            return (row.auto_count + row.manual_adjustment >= target) || row.is_complete;
          });

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
                !isFuture && dayCompleted && "bg-emerald-50 dark:bg-emerald-900/10"
              )}
            >
              <span className="text-muted-foreground">{dayLabel}</span>
              <span className={cn("text-xs font-semibold", isCurrentDay ? "text-primary" : "text-foreground")}>{dayNum}</span>
              {!isFuture && dayCompleted && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Weekly totals */}
      <div className="space-y-1.5">
        {weekTotals.map((item, idx) => {
          const pct = item.target > 0 ? Math.min(100, Math.round((item.current / item.target) * 100)) : 0;
          return (
            <div key={idx} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground font-medium truncate">{item.label}</span>
                <span className={cn("font-semibold", item.current >= item.target ? "text-emerald-600" : "text-muted-foreground")}>
                  {item.current}/{item.target}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          );
        })}
        <SalesRevenueTile selectedDate={weekStartKey} compact showWeekly />
      </div>
    </div>
  );
}
