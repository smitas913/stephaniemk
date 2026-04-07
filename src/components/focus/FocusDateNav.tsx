import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, BarChart3, Palmtree } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { toLocalDateKey } from "@/lib/dateOnly";

interface FocusDateNavProps {
  selectedDate: string;
  todayKey: string;
  viewMode: "daily" | "weekly";
  isOOO: boolean;
  onDateChange: (date: string) => void;
  onViewModeChange: (mode: "daily" | "weekly") => void;
}

export default function FocusDateNav({
  selectedDate, todayKey, viewMode, isOOO,
  onDateChange, onViewModeChange,
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

        {!isToday && viewMode === "daily" && (
          <button
            type="button"
            onClick={() => onDateChange(todayKey)}
            className="text-xs text-primary font-medium hover:underline"
          >
            Back to Today
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
    </div>
  );
}
