import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, addDays, subWeeks, addWeeks } from "date-fns";
import { ChevronLeft, ChevronRight, Phone, CalendarPlus, Share2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toLocalDateKey } from "@/lib/dateOnly";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { FocusRawData } from "@/components/TodaysFocus";
import { computeMetricsForDate } from "@/lib/focusMetrics";
import { useWeeklyGoals, GOAL_PRESETS, type WeeklyGoals } from "@/hooks/useWeeklyGoals";

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

function metricStatusColor(current: number, target: number): string {
  if (target <= 0) return "";
  const pct = current / target;
  if (pct >= 1) return "text-emerald-600";
  if (pct >= 0.6) return "text-amber-600";
  return "text-destructive";
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

  const [offset, setOffset] = useState(0);
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  const { goals, updateGoals, isSaving } = useWeeklyGoals();

  // Local state for custom editing
  const [editPreset, setEditPreset] = useState<string | null>(null);
  const [customReach, setCustomReach] = useState(35);
  const [customBook, setCustomBook] = useState(4);
  const [customShare, setCustomShare] = useState(2);

  const dailyTarget = Math.max(1, Math.round(goals.reachOuts / 6));

  const weekStart = useMemo(() => {
    if (offset === 0) return currentWeekStart;
    return offset < 0 ? subWeeks(currentWeekStart, Math.abs(offset)) : addWeeks(currentWeekStart, offset);
  }, [offset, currentWeekStart]);

  const days = useMemo(() => {
    const result: { dateKey: string; dayLabel: string; date: Date }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      result.push({ dateKey: toLocalDateKey(d), dayLabel: format(d, "EEE"), date: d });
    }
    return result;
  }, [weekStart]);

  const isCurrentWeek = offset === 0;

  const dayMetrics = useMemo(() => {
    return days.map(({ dateKey }) => {
      if (dateKey === todayKey) return { reachOuts: todayReachOuts, bookings: todayBookings, sharing: todaySharing };
      if (dateKey > todayKey) return { reachOuts: 0, bookings: 0, sharing: 0 };
      if (!rawData) return { reachOuts: 0, bookings: 0, sharing: 0 };
      const m = computeMetricsForDate(dateKey, rawData);
      return { reachOuts: m.reachOuts, bookings: m.bookings, sharing: m.sharing };
    });
  }, [days, todayKey, todayReachOuts, todayBookings, todaySharing, rawData]);

  const totals = useMemo(() => {
    return dayMetrics.reduce(
      (acc, m) => ({ reachOuts: acc.reachOuts + m.reachOuts, bookings: acc.bookings + m.bookings, sharing: acc.sharing + m.sharing }),
      { reachOuts: 0, bookings: 0, sharing: 0 }
    );
  }, [dayMetrics]);

  const weekLabel = `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`;
  const reachPct = goals.reachOuts > 0 ? Math.min(100, Math.round((totals.reachOuts / goals.reachOuts) * 100)) : 0;

  const openGoalPicker = () => {
    setEditPreset(goals.preset);
    if (goals.preset === "custom") {
      setCustomReach(goals.reachOuts);
      setCustomBook(goals.bookings);
      setCustomShare(goals.sharings);
    }
    setShowGoalPicker(true);
  };

  const handleSelectPreset = async (key: string) => {
    setEditPreset(key);
    if (key !== "custom") {
      const p = GOAL_PRESETS[key];
      await updateGoals({ preset: key, reachOuts: p.reachOuts, bookings: p.bookings, sharings: p.sharings });
      setShowGoalPicker(false);
    }
  };

  const handleSaveCustom = async () => {
    await updateGoals({ preset: "custom", reachOuts: customReach, bookings: customBook, sharings: customShare });
    setShowGoalPicker(false);
  };

  const presetLabel = goals.preset === "custom"
    ? "Custom"
    : GOAL_PRESETS[goals.preset]?.label ?? "Conservative";

  return (
    <div className="space-y-3">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <button type="button" className="text-sm font-medium text-foreground hover:underline" onClick={() => setOffset(0)}>
          {isCurrentWeek ? "This Week" : weekLabel}
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o) => o + 1)} disabled={isCurrentWeek}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Goal label + settings button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          🎯 <span className="font-medium">{presetLabel}</span> goal
        </span>
        <button
          type="button"
          onClick={openGoalPicker}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          <Settings2 className="w-3 h-3" /> Change Goal
        </button>
      </div>

      {/* Weekly Totals */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-primary/10 p-2">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" /> Reach Outs</div>
          <p className={cn("text-lg font-bold", metricStatusColor(totals.reachOuts, goals.reachOuts))}>{totals.reachOuts}</p>
          <p className="text-[10px] text-muted-foreground">/ {goals.reachOuts} target</p>
        </div>
        <div className="rounded-lg bg-emerald-500/10 p-2">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><CalendarPlus className="w-3 h-3" /> Bookings</div>
          <p className={cn("text-lg font-bold", metricStatusColor(totals.bookings, goals.bookings))}>{totals.bookings}</p>
          <p className="text-[10px] text-muted-foreground">/ {goals.bookings} target</p>
        </div>
        <div className="rounded-lg bg-violet-500/10 p-2">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Share2 className="w-3 h-3" /> Sharing</div>
          <p className={cn("text-lg font-bold", metricStatusColor(totals.sharing, goals.sharings))}>{totals.sharing}</p>
          <p className="text-[10px] text-muted-foreground">/ {goals.sharings} target</p>
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
              <span className={cn("w-8 text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>{day.dayLabel}</span>
              <span className="text-[10px] text-muted-foreground w-12">{format(day.date, "M/d")}</span>
              {!isFuture && (
                <div className="flex items-center gap-1.5 flex-1">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusColor(m.reachOuts, dailyTarget))}>
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

      {/* Goal Picker Sheet */}
      <Sheet open={showGoalPicker} onOpenChange={setShowGoalPicker}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Perfect Week Goals
            </SheetTitle>
            <SheetDescription>Choose a preset or create your own weekly targets.</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {Object.entries(GOAL_PRESETS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectPreset(key)}
                disabled={isSaving}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-colors",
                  editPreset === key && key !== "custom"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{p.emoji}</span>
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  {key === "standard" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Recommended</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span>{p.reachOuts} reach outs</span>
                  <span>{p.bookings} bookings</span>
                  <span>{p.sharings} sharings</span>
                </div>
              </button>
            ))}

            {/* Custom option */}
            <button
              type="button"
              onClick={() => {
                setEditPreset("custom");
                setCustomReach(goals.reachOuts);
                setCustomBook(goals.bookings);
                setCustomShare(goals.sharings);
              }}
              className={cn(
                "w-full text-left p-3 rounded-lg border transition-colors",
                editPreset === "custom"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">⚙️</span>
                <span className="text-sm font-medium text-foreground">Create My Own</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Set custom weekly targets</p>
            </button>

            {editPreset === "custom" && (
              <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                <div>
                  <label className="text-xs font-medium text-foreground">Weekly Reach Outs</label>
                  <Input
                    type="number"
                    min={1}
                    value={customReach}
                    onChange={(e) => setCustomReach(Number(e.target.value) || 1)}
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Weekly Bookings</label>
                  <Input
                    type="number"
                    min={0}
                    value={customBook}
                    onChange={(e) => setCustomBook(Number(e.target.value) || 0)}
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Weekly Sharings</label>
                  <Input
                    type="number"
                    min={0}
                    value={customShare}
                    onChange={(e) => setCustomShare(Number(e.target.value) || 0)}
                    className="mt-1 h-8"
                  />
                </div>
                <Button size="sm" className="w-full" onClick={handleSaveCustom} disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save Custom Goals"}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
