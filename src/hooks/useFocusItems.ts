import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toLocalDateKey } from "@/lib/dateOnly";

export type DayType = "power" | "appointment" | "flex";

export interface FocusItemConfig {
  id: string;
  sort_order: number;
  label: string;
  default_target: number;
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

export interface DayTypeTarget {
  day_type: DayType;
  sort_order: number;
  target: number;
}

// Canonical category auto_track_keys — used to detect stale/legacy configs.
// Slot 6 is a user-customizable "Custom Focus" slot; we accept either no
// auto_track_key (pure manual) or the legacy "personal_appointments" key.
const CANONICAL_AUTO_KEYS = new Set([
  "customer_followup", "lead_followup", "hostess_coaching",
  "consultant_coaching", "relationship",
]);

export const DEFAULT_FOCUS_ITEMS: Omit<FocusItemConfig, "id">[] = [
  { sort_order: 0, label: "Customer Follow-Ups", default_target: 10, auto_track_key: "customer_followup" },
  { sort_order: 1, label: "Lead Follow-Ups", default_target: 10, auto_track_key: "lead_followup" },
  { sort_order: 2, label: "Hostess / Event Coaching", default_target: 3, auto_track_key: "hostess_coaching" },
  { sort_order: 3, label: "Consultant Coaching", default_target: 2, auto_track_key: "consultant_coaching" },
  { sort_order: 4, label: "Relationship Building", default_target: 3, auto_track_key: "relationship" },
];

/** Returns true if saved configs match the canonical 5-slot structure. */
export function configsAreCanonical(configs: FocusItemConfig[]): boolean {
  if (configs.length !== 5) return false;
  const expected = ["customer_followup", "lead_followup", "hostess_coaching", "consultant_coaching", "relationship"];
  for (let i = 0; i < 5; i++) {
    const c = configs.find(cfg => cfg.sort_order === i);
    if (!c || c.auto_track_key !== expected[i]) return false;
  }
  return true;
}

export const DEFAULT_DAY_TYPE_TARGETS: Record<DayType, number[]> = {
  power: [10, 10, 3, 2, 3],
  appointment: [6, 6, 2, 1, 2],
  flex: [3, 3, 1, 1, 1],
};

export const DAY_TYPE_INFO: { value: DayType; label: string; description: string }[] = [
  { value: "power", label: "Power Day", description: "Full reach-out focus" },
  { value: "appointment", label: "Appointment Day", description: "Bookings from events" },
  { value: "flex", label: "Flex Day", description: "Reduced activity" },
];

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

  const { data: progress = [], isLoading: progressLoading, isFetching: progressFetching } = useQuery({
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

  const { data: dayTypeTargets = [] } = useQuery({
    queryKey: ["day-type-targets", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("day_type_targets" as any)
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data as any[]).map((r: any) => ({
        day_type: r.day_type as DayType,
        sort_order: r.sort_order,
        target: r.target,
      })) as DayTypeTarget[];
    },
    enabled: !!user,
  });

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

  const getTargetForItem = (sortOrder: number, dayType: DayType): number => {
    const custom = dayTypeTargets.find(t => t.day_type === dayType && t.sort_order === sortOrder);
    if (custom) return custom.target;
    const defaults = DEFAULT_DAY_TYPE_TARGETS[dayType];
    if (defaults && sortOrder < defaults.length) return defaults[sortOrder];
    const config = configs.find(c => c.sort_order === sortOrder);
    return config?.default_target ?? 1;
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
      await supabase.from("focus_item_configs" as any).delete().eq("user_id", user.id);
      const { error } = await supabase.from("focus_item_configs" as any).insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["focus-item-configs"] }),
  });

  const saveConfigs = useMutation({
    mutationFn: async (items: Omit<FocusItemConfig, "id">[]) => {
      if (!user) return;
      await supabase.from("focus_item_configs" as any).delete().eq("user_id", user.id);
      const rows = items.map((item) => ({
        user_id: user.id,
        sort_order: item.sort_order,
        label: item.label,
        default_target: item.default_target,
        auto_track_key: item.auto_track_key,
      }));
      const { error } = await supabase.from("focus_item_configs" as any).insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["focus-item-configs"] }),
  });

  const upsertProgress = useMutation({
    mutationFn: async (item: { sort_order: number; auto_count?: number; manual_adjustment?: number; is_complete?: boolean; day_type?: DayType }) => {
      if (!user) return;
      const existing = progress.find((p) => p.sort_order === item.sort_order);
      const payload = {
        user_id: user.id,
        focus_date: selectedDate,
        sort_order: item.sort_order,
        auto_count: item.auto_count ?? existing?.auto_count ?? 0,
        manual_adjustment: item.manual_adjustment ?? existing?.manual_adjustment ?? 0,
        is_complete: item.is_complete ?? existing?.is_complete ?? false,
        day_type: item.day_type ?? existing?.day_type ?? "power",
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("daily_focus_progress" as any)
        .upsert(payload as any, { onConflict: "user_id,focus_date,sort_order" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["daily-focus-progress"] }),
  });

  const saveDayTypeTargets = useMutation({
    mutationFn: async (targets: { day_type: DayType; sort_order: number; target: number }[]) => {
      if (!user) return;
      // Delete all for this user, re-insert
      await supabase.from("day_type_targets" as any).delete().eq("user_id", user.id);
      if (targets.length > 0) {
        const rows = targets.map(t => ({ user_id: user.id, ...t }));
        const { error } = await supabase.from("day_type_targets" as any).insert(rows as any);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["day-type-targets"] }),
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
    dayTypeTargets,
    isLoading: configsLoading || progressLoading,
    isToday,
    isOOO: isOOO(selectedDate),
    getTargetForItem,
    seedDefaults: seedDefaults.mutateAsync,
    saveConfigs: saveConfigs.mutateAsync,
    upsertProgress: upsertProgress.mutateAsync,
    saveDayTypeTargets: saveDayTypeTargets.mutateAsync,
    fetchWeekProgress,
    isSaving: saveConfigs.isPending,
    hasHistoricalData,
    noHistoricalData,
    progressFetching,
  };
}
