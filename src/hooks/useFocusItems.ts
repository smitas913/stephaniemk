import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toLocalDateKey } from "@/lib/dateOnly";

// Kept for schema compat with existing daily_focus_progress.day_type column.
export type DayType = "power" | "appointment" | "flex";

export interface FocusItemConfig {
  id: string;
  sort_order: number;
  label: string;
  default_target: number; // legacy; no longer surfaced in UI
  auto_track_key: string | null;
}

export interface DailyFocusProgress {
  id: string;
  sort_order: number;
  auto_count: number;
  manual_adjustment: number;
  is_complete: boolean;
  day_type: DayType;
}

// Canonical category auto_track_keys — used to detect stale/legacy configs.
const CANONICAL_AUTO_KEYS = [
  "customer_followup",
  "booking_activity",
  "bookings",
  "sharing_personal",
  "sharing_unit",
] as const;

export const DEFAULT_FOCUS_ITEMS: Omit<FocusItemConfig, "id">[] = [
  { sort_order: 0, label: "Customer Follow-Ups", default_target: 0, auto_track_key: "customer_followup" },
  { sort_order: 1, label: "Booking Activity", default_target: 0, auto_track_key: "booking_activity" },
  { sort_order: 2, label: "New Bookings", default_target: 0, auto_track_key: "bookings" },
  { sort_order: 3, label: "Sharing (Personal)", default_target: 0, auto_track_key: "sharing_personal" },
  { sort_order: 4, label: "Sharing (Unit)", default_target: 0, auto_track_key: "sharing_unit" },
];

/** Returns true if saved configs match the canonical 4-slot structure. */
export function configsAreCanonical(configs: FocusItemConfig[]): boolean {
  if (configs.length !== CANONICAL_AUTO_KEYS.length) return false;
  for (let i = 0; i < CANONICAL_AUTO_KEYS.length; i++) {
    const c = configs.find((cfg) => cfg.sort_order === i);
    if (!c || c.auto_track_key !== CANONICAL_AUTO_KEYS[i]) return false;
  }
  return true;
}

export function useFocusItems(dateKey?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayKey = toLocalDateKey();
  const selectedDate = dateKey || todayKey;
  const isToday = selectedDate === todayKey;

  const { data: configs = [], isLoading: configsLoading } = useQuery({
    queryKey: ["focus-item-configs", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("focus_item_configs" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]).map((r: any) => ({
        id: r.id,
        sort_order: r.sort_order,
        label: r.label,
        default_target: r.default_target,
        auto_track_key: r.auto_track_key,
      })) as FocusItemConfig[];
    },
    enabled: !!user,
  });

  const {
    data: progress = [],
    isLoading: progressLoading,
    isFetching: progressFetching,
  } = useQuery({
    queryKey: ["daily-focus-progress", user?.id, selectedDate],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("daily_focus_progress" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("focus_date", selectedDate)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]).map((r: any) => ({
        id: r.id,
        sort_order: r.sort_order,
        auto_count: r.auto_count,
        manual_adjustment: r.manual_adjustment,
        is_complete: r.is_complete,
        day_type: r.day_type || "power",
      })) as DailyFocusProgress[];
    },
    enabled: !!user,
    placeholderData: (prev) => prev,
  });

  const hasHistoricalData = !progressLoading && !progressFetching && progress.length > 0;
  const noHistoricalData = !progressLoading && !progressFetching && progress.length === 0 && !isToday;

  // OOO check
  const { data: scheduleSettings } = useQuery({
    queryKey: ["schedule-settings-focus", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("user_schedule_settings" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!user,
  });

  const isOOO = (date: string): boolean => {
    if (!scheduleSettings) return false;
    const start = scheduleSettings.ooo_start_date;
    const end = scheduleSettings.ooo_end_date;
    if (!start || !end) return false;
    return date >= start && date <= end;
  };

  const isNonWorkday = (date: string): boolean => {
    if (!scheduleSettings) return false;
    const d = new Date(date + "T12:00:00");
    const dow = d.getDay();
    const flags = [
      scheduleSettings.workday_sunday,
      scheduleSettings.workday_monday,
      scheduleSettings.workday_tuesday,
      scheduleSettings.workday_wednesday,
      scheduleSettings.workday_thursday,
      scheduleSettings.workday_friday,
      scheduleSettings.workday_saturday,
    ];
    const flag = flags[dow];
    return flag === false;
  };

  const seedDefaults = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const rows = DEFAULT_FOCUS_ITEMS.map((item) => ({
        user_id: user.id,
        sort_order: item.sort_order,
        label: item.label,
        default_target: item.default_target,
        auto_track_key: item.auto_track_key,
      }));
      await supabase
        .from("focus_item_configs" as any)
        .delete()
        .eq("user_id", user.id);
      const { error } = await supabase.from("focus_item_configs" as any).insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["focus-item-configs"] }),
  });

  const upsertProgress = useMutation({
    mutationFn: async (item: {
      sort_order: number;
      auto_count?: number;
      manual_adjustment?: number;
      is_complete?: boolean;
    }) => {
      if (!user) return;
      const existing = progress.find((p) => p.sort_order === item.sort_order);
      const payload = {
        user_id: user.id,
        focus_date: selectedDate,
        sort_order: item.sort_order,
        auto_count: item.auto_count ?? existing?.auto_count ?? 0,
        manual_adjustment: item.manual_adjustment ?? existing?.manual_adjustment ?? 0,
        is_complete: item.is_complete ?? existing?.is_complete ?? false,
        day_type: existing?.day_type ?? "power",
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("daily_focus_progress" as any)
        .upsert(payload as any, { onConflict: "user_id,focus_date,sort_order" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["daily-focus-progress"] }),
  });

  // Fetch progress for a week range
  const fetchWeekProgress = async (startDate: string, endDate: string) => {
    if (!user) return [];
    const { data, error } = await supabase
      .from("daily_focus_progress" as any)
      .select("*")
      .eq("user_id", user.id)
      .gte("focus_date", startDate)
      .lte("focus_date", endDate)
      .order("focus_date", { ascending: true });
    if (error) throw error;
    return (data as any[]) || [];
  };

  return {
    configs,
    progress,
    isLoading: configsLoading || progressLoading,
    isToday,
    isOOO: isOOO(selectedDate),
    isNonWorkday: isNonWorkday(selectedDate),
    seedDefaults: seedDefaults.mutateAsync,
    upsertProgress: upsertProgress.mutateAsync,
    fetchWeekProgress,
    hasHistoricalData,
    noHistoricalData,
    progressFetching,
  };
}
