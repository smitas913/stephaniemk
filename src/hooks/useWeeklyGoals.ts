import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface WeeklyGoals {
  preset: string;
  reachOuts: number;
  bookings: number;
  sharings: number;
}

export const GOAL_PRESETS: Record<string, { label: string; emoji: string; description: string; reachOuts: number; bookings: number; sharings: number }> = {
  conservative: { label: "Conservative", emoji: "🟢", description: "30–40 reach outs · 3–4 bookings · 1–2 sharings", reachOuts: 35, bookings: 4, sharings: 2 },
  standard:     { label: "Standard", emoji: "🔵", description: "40–60 reach outs · 4–6 bookings · 2–4 sharings", reachOuts: 50, bookings: 5, sharings: 3 },
  growth:       { label: "Growth", emoji: "🔴", description: "60–80 reach outs · 6–10 bookings · 4–6 sharings", reachOuts: 70, bookings: 8, sharings: 5 },
};

const DEFAULT_GOALS: WeeklyGoals = { preset: "conservative", reachOuts: 35, bookings: 4, sharings: 2 };

export function useWeeklyGoals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: goals, isLoading } = useQuery({
    queryKey: ["weekly-goals", user?.id],
    queryFn: async () => {
      if (!user) return DEFAULT_GOALS;
      const { data, error } = await supabase
        .from("weekly_goals" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) return DEFAULT_GOALS;
      const row = data as any;
      return { preset: row.preset, reachOuts: row.reach_outs, bookings: row.bookings, sharings: row.sharings } as WeeklyGoals;
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (newGoals: WeeklyGoals) => {
      if (!user) return;
      const payload = { user_id: user.id, preset: newGoals.preset, reach_outs: newGoals.reachOuts, bookings: newGoals.bookings, sharings: newGoals.sharings, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from("weekly_goals" as any)
        .upsert(payload as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-goals"] }),
  });

  return { goals: goals ?? DEFAULT_GOALS, isLoading, updateGoals: mutation.mutateAsync, isSaving: mutation.isPending };
}
