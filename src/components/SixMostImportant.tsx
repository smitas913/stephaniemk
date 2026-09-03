import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import {
  useFocusItems,
  DEFAULT_FOCUS_ITEMS,
  configsAreCanonical,
} from "@/hooks/useFocusItems";
import type { FocusItemConfig } from "@/hooks/useFocusItems";
import { toLocalDateKey } from "@/lib/dateOnly";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, addDays, format, subDays } from "date-fns";
import { computeMetricsForDate, type FocusRawData, type FocusDetailItem } from "@/lib/focusMetrics";

import FocusDateNav from "@/components/focus/FocusDateNav";
import FocusItemRow from "@/components/focus/FocusItemRow";
import FocusItemCompact from "@/components/focus/FocusItemCompact";
import type { FocusItemData } from "@/components/focus/FocusItemRow";
import FocusDrillDown from "@/components/focus/FocusDrillDown";
import FocusWeeklyView from "@/components/focus/FocusWeeklyView";
import SalesRevenueTile from "@/components/focus/SalesRevenueTile";

interface AutoCounts {
  booking_attempts: number;
  booking_activity: number;
  bookings: number;
  sharing_personal: number;
  sharing_unit: number;
  customer_followup: number;
  client_followup: number;
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
  compact?: boolean;
}

// Map auto_track_key to the correct detail category
const AUTO_KEY_TO_DETAIL: Record<string, keyof ReturnType<typeof computeMetricsForDate>> = {
  booking_attempts: "bookingAttemptDetails",
  booking_activity: "bookingActivityDetails",
  bookings: "bookingDetails",
  sharing_personal: "sharingPersonalDetails",
  sharing_unit: "sharingUnitDetails",
  customer_followup: "customerFollowUpDetails",
  lead_followup: "bookingActivityDetails",
  client_followup: "clientFollowUpDetails",
  hostess_coaching: "hostessCoachingDetails",
  recruiting_followup: "recruitingFollowUpDetails",
  consultant_coaching: "coachingDetails",
  relationship: "relationshipDetails",
};

function getEffectiveAutoTrackKey(
  config: Pick<FocusItemConfig, "auto_track_key" | "label" | "sort_order">,
): AutoCountKey | null {
  if (config.auto_track_key) return config.auto_track_key as AutoCountKey;

  const normalizedLabel = config.label.trim().toLowerCase();
  if (normalizedLabel.includes("personal")) return "sharing_personal";
  if (normalizedLabel.includes("unit")) return "sharing_unit";
  if (normalizedLabel.includes("sharing")) return "sharing_personal";
  if (normalizedLabel.includes("new booking") || normalizedLabel.includes("bookings")) return "bookings";
  if (normalizedLabel.includes("booking activity")) return "booking_activity";
  if (normalizedLabel.includes("booking attempt")) return "booking_attempts";
  if (normalizedLabel.includes("customer follow")) return "customer_followup";
  return null;
}

export default function SixMostImportant({
  autoCounts,
  rawData,
  onDetailNavigate,
  compact,
}: SixMostImportantProps) {
  const isMobile = useIsMobile();
  const todayKey = toLocalDateKey();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily");
  const [drillDownIndex, setDrillDownIndex] = useState<number | null>(null);

  const isToday = selectedDate === todayKey;
  const {
    configs,
    progress,
    isLoading,
    isOOO,
    isNonWorkday,
    seedDefaults,
    upsertProgress,
    fetchWeekProgress,
    noHistoricalData,
  } = useFocusItems(selectedDate);
  const isLightDay = isOOO || isNonWorkday;

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
        upsertProgress({ sort_order: config.sort_order, auto_count: autoVal });
      }
    }
  }, [autoCounts, configs, progress, upsertProgress, isToday]);

  // Historical metrics from rawData
  const historicalMetrics = useMemo(() => {
    if (isToday || !rawData) return null;
    return computeMetricsForDate(selectedDate, rawData);
  }, [selectedDate, isToday, rawData]);

  const items: FocusItemData[] = useMemo(() => {
    return configs.map((config) => {
      const prog = progress.find((p) => p.sort_order === config.sort_order);
      const autoKey = getEffectiveAutoTrackKey(config);
      const autoCount = isToday && autoCounts && autoKey ? (autoCounts[autoKey] ?? 0) : (prog?.auto_count ?? 0);
      const current = Math.max(0, autoCount);
      return { sort_order: config.sort_order, label: config.label, current, isAutoTracked: !!autoKey };
    });
  }, [configs, progress, isToday, autoCounts]);

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

  // Drill-down detail items
  const getDrillDownItems = (sortOrder: number): FocusDetailItem[] => {
    if (!rawData) return [];
    const metrics = isToday ? computeMetricsForDate(todayKey, rawData) : historicalMetrics;
    if (!metrics) return [];
    const config = configs.find((c) => c.sort_order === sortOrder);
    if (!config) return [];
    const autoKey = getEffectiveAutoTrackKey(config);
    const detailKey = autoKey ? AUTO_KEY_TO_DETAIL[autoKey] : null;
    if (detailKey && detailKey in metrics) {
      return metrics[detailKey] as FocusDetailItem[];
    }
    const label = config.label.toLowerCase();
    if (label.includes("personal")) return metrics.sharingPersonalDetails;
    if (label.includes("unit")) return metrics.sharingUnitDetails;
    if (label.includes("sharing")) return metrics.sharingPersonalDetails;
    if (label.includes("new booking") || label.includes("bookings")) return metrics.bookingDetails;
    if (label.includes("booking activity")) return metrics.bookingActivityDetails;
    if (label.includes("booking attempt")) return metrics.bookingAttemptDetails;
    if (label.includes("customer follow")) return metrics.customerFollowUpDetails;
    return [];
  };

  const drillDownConfig = drillDownIndex !== null ? configs.find((c) => c.sort_order === drillDownIndex) : null;
  const drillDownItems = drillDownIndex !== null ? getDrillDownItems(drillDownIndex) : [];
  const drillDownShowFilter =
    drillDownConfig?.auto_track_key === "booking_attempts" ||
    drillDownConfig?.label.toLowerCase().includes("booking attempt");

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
            <CardTitle className="text-sm font-semibold text-foreground">Daily Success Drivers</CardTitle>
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
          <div className="flex items-center gap-2 min-w-0">
            <Star className="w-5 h-5 text-primary shrink-0" />
            <CardTitle className="text-base font-semibold text-foreground">Daily Success Drivers</CardTitle>
          </div>

          <FocusDateNav
            selectedDate={selectedDate}
            todayKey={todayKey}
            viewMode={viewMode}
            isOOO={isOOO}
            onDateChange={(d) => {
              setSelectedDate(d);
              setViewMode("daily");
            }}
            onViewModeChange={setViewMode}
            selectedWeekStart={selectedWeekStart}
            onWeekChange={setSelectedWeekStart}
          />
        </CardHeader>

        <CardContent className={cn(isMobile && "px-3")}>
          {viewMode === "weekly" ? (
            <FocusWeeklyView
              configs={configs}
              weekData={weekData}
              onDayClick={(d) => {
                setSelectedDate(d);
                setViewMode("daily");
              }}
              weekStart={selectedWeekStart}
            />
          ) : (
            <div className={cn("space-y-3", isLightDay && !isOOO && "opacity-90")}>
              {isOOO && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1 font-medium">
                  Out of Office
                </p>
              )}
              {isNonWorkday && !isOOO && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1 italic">
                  Light day — log anything you do
                </p>
              )}
              {noHistoricalData ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">No activity recorded for this date</p>
                </div>
              ) : (
                <>
                  <div className={cn(compact ? "grid grid-cols-1 sm:grid-cols-3 gap-3" : "space-y-1.5")}>
                    {items.map((item) =>
                      compact ? (
                        <FocusItemCompact
                          key={item.sort_order}
                          item={item}
                          onDrillDown={() => setDrillDownIndex(item.sort_order)}
                          lightDay={isLightDay}
                        />
                      ) : (
                        <FocusItemRow
                          key={item.sort_order}
                          item={item}
                          onDrillDown={() => setDrillDownIndex(item.sort_order)}
                          isMobile={isMobile}
                          lightDay={isLightDay}
                        />
                      ),
                    )}
                    <SalesRevenueTile selectedDate={selectedDate} compact={!!compact} />
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
