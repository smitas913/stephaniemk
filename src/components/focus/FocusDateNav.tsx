import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, BarChart3, Palmtree } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, startOfWeek, addDays } from "date-fns";
import { toLocalDateKey } from "@/lib/dateOnly";

interface FocusDateNavProps {
  selectedDate: string;
  todayKey: string;
  viewMode: "daily" | "weekly";
  isOOO: boolean;
  onDateChange: (date: string) => void;
  onViewModeChange: (mode: "daily" | "weekly") => void;
  selectedWeekStart: string;
  onWeekChange: (weekStart: string) => void;
}

export default function FocusDateNav({
  selectedDate, todayKey, viewMode, isOOO,
  onDateChange, onViewModeChange,
  selectedWeekStart, onWeekChange,
}: FocusDateNavProps) {
  const isToday = selectedDate === todayKey;

  const goBack = () => {
    const d = new Date(selectedDate + "T12:00:00");
    onDateChange(toLocalDateKey(subDays(d, 1)));
  };
  const goForward = () => {
    if (isToday) return;
    const d = new Date(selectedDate + "T12:00:00");
    const next = toLocalDateKey(new Date(d.getTime() + 86400000));
    if (next <= todayKey) onDateChange(next);
  };

  const dateLabel = (() => {
    if (isToday) return "Today";
    const d = new Date(selectedDate + "T12:00:00");
    const yesterday = toLocalDateKey(subDays(new Date(), 1));
    if (selectedDate === yesterday) return "Yesterday";
    return format(d, "MMM d, yyyy");
  })();

  // Week navigation
  const currentWeekStart = toLocalDateKey(startOfWeek(new Date(todayKey + "T12:00:00"), { weekStartsOn: 1 }));
  const isCurrentWeek = selectedWeekStart === currentWeekStart;

  const weekEnd = toLocalDateKey(addDays(new Date(selectedWeekStart + "T12:00:00"), 6));
  const weekLabel = `Week of ${format(new Date(selectedWeekStart + "T12:00:00"), "MMM d")}–${format(new Date(weekEnd + "T12:00:00"), "d")}`;

  const goWeekBack = () => {
    const d = new Date(selectedWeekStart + "T12:00:00");
    onWeekChange(toLocalDateKey(addDays(d, -7)));
  };
  const goWeekForward = () => {
    if (isCurrentWeek) return;
    const d = new Date(selectedWeekStart + "T12:00:00");
    const next = toLocalDateKey(addDays(d, 7));
    if (next <= currentWeekStart) onWeekChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {/* Daily / Weekly Toggle */}
        <div className="flex gap-0.5 rounded-full border border-border p-0.5">
          <button
            type="button"
            onClick={() => onViewModeChange("daily")}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors",
              viewMode === "daily" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Calendar className="w-3 h-3" /> Daily
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("weekly")}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors",
              viewMode === "weekly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <BarChart3 className="w-3 h-3" /> Weekly
          </button>
        </div>

        {viewMode === "daily" && !isToday && (
          <button
            type="button"
            onClick={() => onDateChange(todayKey)}
            className="text-xs text-primary font-medium hover:underline"
          >
            Back to Today
          </button>
        )}
        {viewMode === "weekly" && !isCurrentWeek && (
          <button
            type="button"
            onClick={() => onWeekChange(currentWeekStart)}
            className="text-xs text-primary font-medium hover:underline"
          >
            Current Week
          </button>
        )}
      </div>

      {viewMode === "daily" && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-sm font-medium text-foreground hover:underline"
              onClick={() => onDateChange(todayKey)}
            >
              {dateLabel}
            </button>
            {isOOO && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full font-medium">
                <Palmtree className="w-3 h-3" /> OOO
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward} disabled={isToday}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {viewMode === "weekly" && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goWeekBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-foreground">{weekLabel}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goWeekForward} disabled={isCurrentWeek}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}