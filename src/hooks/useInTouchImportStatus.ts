import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const REFRESH_DUE_DAYS = 7;

async function latest(table: "customers" | "team_consultants", pcp = false): Promise<string | null> {
  let q: any = supabase.from(table).select("updated_at").not("updated_at", "is", null);
  if (pcp) q = q.contains("tags", ["PCP"]);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0]?.updated_at ?? null;
}

export function isDue(ts: string | null): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > REFRESH_DUE_DAYS * 86_400_000;
}

export function useInTouchImportStatus() {
  return useQuery({
    queryKey: ["intouch-import-status"],
    queryFn: async () => {
      const [customers, consultants, pcp] = await Promise.all([latest("customers"), latest("team_consultants"), latest("customers", true)]);
      return { customers, consultants, pcp };
    },
  });
}
