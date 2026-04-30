import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Star, Pencil, Trophy, Flame, Crown } from "lucide-react";
import { useFocusItems, DEFAULT_DAY_TYPE_TARGETS, DEFAULT_FOCUS_ITEMS, configsAreCanonical } from "@/hooks/useFocusItems";
import type { FocusItemConfig, DayType, DayTypeTarget } from "@/hooks/useFocusItems";
import { toLocalDateKey } from "@/lib/dateOnly";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, addDays, format, subDays } from "date-fns";
import { computeMetricsForDate, type FocusRawData, type FocusDetailItem } from "@/lib/focusMetrics";

import FocusDateNav from "@/components/focus/FocusDateNav";
import DayTypeSelector from "@/components/focus/DayTypeSelector";
import FocusItemRow from "@/components/focus/FocusItemRow";
import FocusItemCompact from "@/components/focus/FocusItemCompact";
import type { FocusItemData } from "@/components/focus/FocusItemRow";
import FocusEditView from "@/components/focus/FocusEditView";
import FocusDrillDown from "@/components/focus/FocusDrillDown";
import FocusWeeklyView from "@/components/focus/FocusWeeklyView";

interface AutoCounts {
  booking_attempts: number;
  customer_followup: number;
  lead_followup: number;
  client_followup: number; // legacy combined; kept for back-compat
  hostess_coaching: number;
  recruiting_followup: number;
  consultant_coaching: number;
  relationship: number;
}

type AutoCountKey = keyof AutoCounts;

interface SixMostImportantProps {
  autoCounts?: AutoCounts;
  rawData?: FocusRawData;
  onDetailNavigate?: (type: string, id: string) => void;
  suggestedDayType?: DayType | null;
  compact?: boolean;
}

// Map auto_track_key to the correct detail category
const AUTO_KEY_TO_DETAIL: Record<string, keyof ReturnType<typeof computeMetricsForDate>> = {
  booking_attempts: "bookingAttemptDetails",
  customer_followup: "customerFollowUpDetails",
  lead_followup: "leadFollowUpDetails",
  client_followup: "clientFollowUpDetails",
  hostess_coaching: "hostessCoachingDetails",
  recruiting_followup: "recruitingFollowUpDetails",
  consultant_coaching: "coachingDetails",
  relationship: "relationshipDetails",
};

function getEffectiveAutoTrackKey(config: Pick<FocusItemConfig, "auto_track_key" | "label" | "sort_order">): AutoCountKey | null {
  if (config.auto_track_key) return config.auto_track_key as AutoCountKey;

  const normalizedLabel = config.label.trim().toLowerCase();
  if (normalizedLabel.includes("booking attempt")) return "booking_attempts";
  if (normalizedLabel.includes("customer follow")) return "customer_followup";
  if (normalizedLabel.includes("lead follow")) return "lead_followup";
  if (normalizedLabel.includes("client")) return "client_followup";
  if (normalizedLabel.includes("hostess") || normalizedLabel.includes("event coach")) return "hostess_coaching";
  if (normalizedLabel.includes("recruiting")) return "recruiting_followup";
  if (normalizedLabel.includes("consultant") || normalizedLabel.includes("team building")) return "consultant_coaching";
  if (normalizedLabel.includes("relationship")) return "relationship";

  return null;
}

export default function SixMostImportant({ autoCounts, rawData, onDetailNavigate, suggestedDayType, compact }: SixMostImportantProps) {
  const isMobile = useIsMobile();
  const todayKey = toLocalDateKey();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily");
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Omit<FocusItemConfig, "id">[]>([]);
  const [dayTypeTargetsDraft, setDayTypeTargetsDraft] = useState<Record<DayType, number[]>>(DEFAULT_DAY_TYPE_TARGETS);
  const [drillDownIndex, setDrillDownIndex] = useState<number | null>(null);

  const isToday = selectedDate === todayKey;
  const {
    configs, progress, dayTypeTargets, isLoading, isOOO,
    getTargetForItem, seedDefaults, saveConfigs, upsertProgress,
    saveDayTypeTargets, fetchWeekProgress, noHistoricalData, progressFetching,
  } = useFocusItems(selectedDate);

  // For past days, use the day_type saved in progress; for today use local state
  const savedDayType: DayType = progress.length > 0 ? (progress[0].day_type as DayType) || "power" : "power";
  const [dayType, setDayTypeLocal] = useState<DayType>(savedDayType);

  useEffect(() => {
    if (progress.length > 0) {
      setDayTypeLocal(progress[0].day_type as DayType || "power");
    }
  }, [progress, selectedDate]);

  // Seed defaults on first load OR when configs are legacy/stale
  useEffect(() => {
    if (!isLoading && (configs.length === 0 || !configsAreCanonical(configs))) {
      seedDefaults();
    }
  }, [isLoading, configs, seedDefaults]);

  // Sync auto-counts to progress (today only)
  useEffect(() => {
    if (!autoCounts || configs.length === 0 || !isToday) return;
    for (const config of configs) {
      const autoKey = getEffectiveAutoTrackKey(config);
      if (!autoKey) continue;
      const autoVal = autoCounts[autoKey] ?? 0;
      const existing = progress.find((p) => p.sort_order === config.sort_order);
      if (!existing || existing.auto_count !== autoVal) {
        upsertProgress({ sort_order: config.sort_order, auto_count: autoVal, day_type: dayType });
      }
    }
  }, [autoCounts, configs, progress, upsertProgress, isToday, dayType]);

  // Historical metrics from rawData
  const historicalMetrics = useMemo(() => {
    if (isToday || !rawData) return null;
    return computeMetricsForDate(selectedDate, rawData);
  }, [selectedDate, isToday, rawData]);

  const items: FocusItemData[] = useMemo(() => {
    return configs.map((config) => {
      const prog = progress.find((p) => p.sort_order === config.sort_order);
      const autoKey = getEffectiveAutoTrackKey(config);
      const autoCount = isToday && autoCounts && autoKey
        ? autoCounts[autoKey] ?? 0
        : prog?.auto_count ?? 0;
      const manualAdj = prog?.manual_adjustment ?? 0;
      const current = autoCount + manualAdj;
      const target = isOOO ? 0 : getTargetForItem(config.sort_order, dayType);
      const isComplete = prog?.is_complete ?? false;
      const isAutoTracked = !!autoKey;
      return { sort_order: config.sort_order, label: config.label, current, target, isComplete, isAutoTracked };
    });
  }, [configs, progress, dayType, getTargetForItem, isOOO, isToday, autoCounts]);

  const completedCount = items.filter((i) => i.isComplete || i.current >= i.target).length;

  const winStatus = useMemo(() => {
    if (completedCount >= 6) return { label: "Perfect Day", icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/10" };
    if (completedCount >= 5) return { label: "Strong Day", icon: Flame, color: "text-orange-500", bg: "bg-orange-500/10" };
    if (completedCount >= 4) return { label: "Win the Day", icon: Trophy, color: "text-primary", bg: "bg-primary/10" };
    return null;
  }, [completedCount]);

  // Weekly data
  const currentWeekStart = useMemo(() => {
    const d = new Date(todayKey + "T12:00:00");
    return toLocalDateKey(startOfWeek(d, { weekStartsOn: 1 }));
  }, [todayKey]);

  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);

  const weekEndKey = useMemo(() => {
    return toLocalDateKey(addDays(new Date(selectedWeekStart + "T12:00:00"), 6));
  }, [selectedWeekStart]);

  const { data: weekData = [] } = useQuery({
    queryKey: ["focus-week-data", selectedWeekStart],
    queryFn: () => fetchWeekProgress(selectedWeekStart, weekEndKey),
    enabled: viewMode === "weekly",
    placeholderData: (prev) => prev,
  });

  // Handlers
  const handleDayTypeChange = useCallback((type: DayType) => {
    setDayTypeLocal(type);
    if (isToday) {
      // Update all progress rows with new day type
      for (const config of configs) {
        upsertProgress({ sort_order: config.sort_order, day_type: type });
      }
    }
  }, [isToday, configs, upsertProgress]);

  const handleManualAdjust = useCallback(
    (sortOrder: number, delta: number) => {
      const existing = progress.find((p) => p.sort_order === sortOrder);
      const currentAdj = existing?.manual_adjustment ?? 0;
      const autoCount = existing?.auto_count ?? 0;
      const newAdj = Math.max(-autoCount, currentAdj + delta);
      upsertProgress({ sort_order: sortOrder, manual_adjustment: newAdj, day_type: dayType });
    },
    [progress, upsertProgress, dayType]
  );

  const handleToggleComplete = useCallback(
    (sortOrder: number) => {
      const existing = progress.find((p) => p.sort_order === sortOrder);
      upsertProgress({ sort_order: sortOrder, is_complete: !(existing?.is_complete ?? false), day_type: dayType });
    },
    [progress, upsertProgress, dayType]
  );

  // Edit mode
  const startEdit = () => {
    setDraft(configs.map(({ id, ...rest }) => rest));
    // Build dayTypeTargetsDraft from existing
    const dtt: Record<DayType, number[]> = { power: [], appointment: [], flex: [] };
    for (const dt of ["power", "appointment", "flex"] as DayType[]) {
      dtt[dt] = configs.map((c) => {
        const custom = dayTypeTargets.find(t => t.day_type === dt && t.sort_order === c.sort_order);
        if (custom) return custom.target;
        return DEFAULT_DAY_TYPE_TARGETS[dt]?.[c.sort_order] ?? c.default_target;
      });
    }
    setDayTypeTargetsDraft(dtt);
    setEditMode(true);
  };

  const saveDraft = async () => {
    // Enforce lock: slots 0–4 keep canonical labels & auto_track_key from DEFAULT_FOCUS_ITEMS.
    // Only slot 5 (Custom Focus) accepts user-renamed label.
    // Use statically-imported DEFAULT_FOCUS_ITEMS
    const sanitized = draft.map((item, idx) => {
      if (idx < 5) {
        const canonical = DEFAULT_FOCUS_ITEMS[idx];
        return { ...item, sort_order: idx, label: canonical.label, auto_track_key: canonical.auto_track_key };
      }
      return { ...item, sort_order: 5, label: item.label.trim() || "Custom Focus", auto_track_key: null };
    });
    await saveConfigs(sanitized);
    // Save day type targets
    const targets: { day_type: DayType; sort_order: number; target: number }[] = [];
    for (const dt of ["power", "appointment", "flex"] as DayType[]) {
      const arr = dayTypeTargetsDraft[dt] || [];
      arr.forEach((target, idx) => {
        targets.push({ day_type: dt, sort_order: idx, target });
      });
    }
    await saveDayTypeTargets(targets);
    setEditMode(false);
  };

  // Drill-down detail items
  const getDrillDownItems = (sortOrder: number): FocusDetailItem[] => {
    if (!rawData) return [];
    const metrics = isToday ? computeMetricsForDate(todayKey, rawData) : historicalMetrics;
    if (!metrics) return [];
    const config = configs.find(c => c.sort_order === sortOrder);
    if (!config) return [];
    const autoKey = getEffectiveAutoTrackKey(config);
    // Map by auto_track_key
    const detailKey = autoKey ? AUTO_KEY_TO_DETAIL[autoKey] : null;
    if (detailKey && detailKey in metrics) {
      return metrics[detailKey] as FocusDetailItem[];
    }
    // Fallback by label
    const label = config.label.toLowerCase();
    if (label.includes("booking")) return metrics.bookingAttemptDetails;
    if (label.includes("customer follow")) return metrics.customerFollowUpDetails;
    if (label.includes("lead follow")) return metrics.leadFollowUpDetails;
    if (label.includes("client")) return metrics.clientFollowUpDetails;
    if (label.includes("hostess") || label.includes("event")) return metrics.hostessCoachingDetails;
    if (label.includes("recruiting") || label.includes("prospect")) return metrics.recruitingFollowUpDetails;
    if (label.includes("consultant") || label.includes("team") || label.includes("coach")) return metrics.coachingDetails;
    if (label.includes("relationship")) return metrics.relationshipDetails;
    return [];
  };

  const drillDownConfig = drillDownIndex !== null ? configs.find(c => c.sort_order === drillDownIndex) : null;
  const drillDownItems = drillDownIndex !== null ? getDrillDownItems(drillDownIndex) : [];
  const drillDownShowFilter = drillDownConfig?.auto_track_key === "booking_attempts" || drillDownConfig?.label.toLowerCase().includes("booking");

  const dateLabel = (() => {
    if (isToday) return "Today";
    const d = new Date(selectedDate + "T12:00:00");
    const yesterday = toLocalDateKey(subDays(new Date(), 1));
    if (selectedDate === yesterday) return "Yesterday";
    return format(d, "MMM d, yyyy");
  })();

  if (isLoading) {
    return (
      <Card className="border-primary/20 shadow-md bg-primary/5">
        <CardHeader className={cn(isMobile ? "pb-1 px-3 py-2" : "pb-2")}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Star className="w-4 h-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">6 Most Important Things</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground py-4 text-center">Loading your focus items…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Star className="w-5 h-5 text-primary shrink-0" />
              <CardTitle className="text-base font-semibold text-foreground">6 Most Important Things</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {completedCount} / {items.length || 6}
              </Badge>
              {winStatus && (
                <Badge variant="outline" className={cn("text-xs gap-1 font-semibold border-0", winStatus.color, winStatus.bg)}>
                  <winStatus.icon className="w-3 h-3" />
                  {winStatus.label}
                </Badge>
              )}
            </div>
            {!editMode && isToday && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEdit}>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>

          <FocusDateNav
            selectedDate={selectedDate}
            todayKey={todayKey}
            viewMode={viewMode}
            isOOO={isOOO}
            onDateChange={(d) => { setSelectedDate(d); setViewMode("daily"); }}
            onViewModeChange={setViewMode}
            selectedWeekStart={selectedWeekStart}
            onWeekChange={setSelectedWeekStart}
          />

          {viewMode === "daily" && (
            <DayTypeSelector
              value={dayType}
              onChange={handleDayTypeChange}
              suggestion={suggestedDayType}
              disabled={!isToday}
            />
          )}
        </CardHeader>

        <CardContent className={cn(isMobile && "px-3")}>
          {editMode ? (
            <FocusEditView
              draft={draft}
              dayTypeTargetsDraft={dayTypeTargetsDraft}
              setDraft={setDraft}
              setDayTypeTargetsDraft={setDayTypeTargetsDraft}
              onSave={saveDraft}
              onCancel={() => setEditMode(false)}
            />
          ) : viewMode === "weekly" ? (
            <FocusWeeklyView
              configs={configs}
              weekData={weekData}
              onDayClick={(d) => { setSelectedDate(d); setViewMode("daily"); }}
              weekStart={selectedWeekStart}
            />
          ) : (
            <div className="space-y-3">
              {isOOO && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1 font-medium">
                  Out of Office — targets set to zero
                </p>
              )}
              {noHistoricalData ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">No activity recorded for this date</p>
                </div>
              ) : (
                <>
                  <div className={cn(compact ? "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5" : "space-y-1.5")}>
                    {items.map((item) =>
                      compact ? (
                        <FocusItemCompact
                          key={item.sort_order}
                          item={item}
                          onAdjust={(delta) => handleManualAdjust(item.sort_order, delta)}
                          onToggleComplete={() => handleToggleComplete(item.sort_order)}
                          onDrillDown={() => setDrillDownIndex(item.sort_order)}
                          readOnly={!isToday}
                        />
                      ) : (
                        <FocusItemRow
                          key={item.sort_order}
                          item={item}
                          onAdjust={(delta) => handleManualAdjust(item.sort_order, delta)}
                          onToggleComplete={() => handleToggleComplete(item.sort_order)}
                          onDrillDown={() => setDrillDownIndex(item.sort_order)}
                          readOnly={!isToday}
                          isMobile={isMobile}
                        />
                      )
                    )}
                  </div>
                  {!isToday && (
                    <p className="text-[10px] text-muted-foreground pt-1 text-center">
                      Viewing {dateLabel} — read-only
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <FocusDrillDown
        open={drillDownIndex !== null}
        onClose={() => setDrillDownIndex(null)}
        title={drillDownConfig?.label || "Activity Detail"}
        dateLabel={dateLabel}
        items={drillDownItems}
        onNavigate={onDetailNavigate}
        showTypeFilter={drillDownShowFilter}
      />
    </>
  );
}
