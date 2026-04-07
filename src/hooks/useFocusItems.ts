import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toLocalDateKey } from "@/lib/dateOnly";

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
}

export const DEFAULT_FOCUS_ITEMS: Omit<FocusItemConfig, "id">[] = [
  { sort_order: 0, label: "Booking Activity", default_target: 3, auto_track_key: null },
  { sort_order: 1, label: "Recruiting Conversations", default_target: 2, auto_track_key: "recruiting" },
  { sort_order: 2, label: "Follow-Ups Completed", default_target: 5, auto_track_key: "followups" },
  { sort_order: 3, label: "Personal Appointment (Held or Confirmed)", default_target: 1, auto_track_key: "appointments" },
  { sort_order: 4, label: "Team Building (Coach / Connect)", default_target: 2, auto_track_key: null },
  { sort_order: 5, label: "Relationship Building (Notes / Check-ins)", default_target: 3, auto_track_key: "relationship" },
];

export function useFocusItems() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayKey = toLocalDateKey();

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

  const { data: progress = [], isLoading: progressLoading } = useQuery({
    queryKey: ["daily-focus-progress", user?.id, todayKey],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("daily_focus_progress" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("focus_date", todayKey)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]).map((r: any) => ({
        id: r.id,
        sort_order: r.sort_order,
        auto_count: r.auto_count,
        manual_adjustment: r.manual_adjustment,
        is_complete: r.is_complete,
      })) as DailyFocusProgress[];
    },
    enabled: !!user,
  });

  // Seed defaults if no configs exist
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
      // Delete existing first
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
    mutationFn: async (item: { sort_order: number; auto_count?: number; manual_adjustment?: number; is_complete?: boolean }) => {
      if (!user) return;
      const existing = progress.find((p) => p.sort_order === item.sort_order);
      const payload = {
        user_id: user.id,
        focus_date: todayKey,
        sort_order: item.sort_order,
        auto_count: item.auto_count ?? existing?.auto_count ?? 0,
        manual_adjustment: item.manual_adjustment ?? existing?.manual_adjustment ?? 0,
        is_complete: item.is_complete ?? existing?.is_complete ?? false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("daily_focus_progress" as any)
        .upsert(payload as any, { onConflict: "user_id,focus_date,sort_order" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["daily-focus-progress"] }),
  });

  return {
    configs,
    progress,
    isLoading: configsLoading || progressLoading,
    seedDefaults: seedDefaults.mutateAsync,
    saveConfigs: saveConfigs.mutateAsync,
    upsertProgress: upsertProgress.mutateAsync,
    isSaving: saveConfigs.isPending,
  };
}
