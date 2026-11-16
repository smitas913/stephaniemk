import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";

const ENDPOINT = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/gbg-contact-sync`;
const ACTIONS = ["created", "updated", "skipped_not_client", "skipped_ambiguous", "error"] as const;

export default function GbgSyncSettings() {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["gbg-sync-log"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const [recent, week] = await Promise.all([
        supabase.from("gbg_sync_log").select("*").order("created_at", { ascending: false }).limit(25),
        supabase.from("gbg_sync_log").select("action").gte("created_at", since).limit(5000),
      ]);
      if (recent.error) throw recent.error;
      if (week.error) throw week.error;
      const counts: Record<string, number> = {};
      for (const r of week.data ?? []) counts[r.action] = (counts[r.action] ?? 0) + 1;
      return { rows: recent.data ?? [], counts };
    },
  });
  const last = data?.rows[0]?.created_at;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-foreground">GBG Sync</div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Webhook URL to paste into GBG:</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted rounded px-2 py-1 break-all flex-1">{ENDPOINT}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(ENDPOINT); toast.success("Copied"); }}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Last sync: {last ? new Date(last).toLocaleString() : "never"}</p>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((a) => (
            <Badge key={a} variant={a === "skipped_ambiguous" && data?.counts[a] ? "default" : "secondary"}>
              {a.replace(/_/g, " ")}: {data?.counts[a] ?? 0}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground self-center">last 7 days</span>
        </div>
        <div className="divide-y divide-border border border-border rounded-md max-h-96 overflow-auto">
          {(data?.rows ?? []).length === 0 && <p className="text-xs text-muted-foreground p-3">No sync activity yet.</p>}
          {(data?.rows ?? []).map((r) => (
            <div key={r.id} className={`p-2 text-xs space-y-0.5 ${r.action === "skipped_ambiguous" ? "bg-accent/40 border-l-4 border-l-primary" : r.action === "error" ? "bg-destructive/10" : ""}`}>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-foreground">{r.contact_name || "(no name)"}</span>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <div className="text-muted-foreground">
                <span className="font-medium">{r.action.replace(/_/g, " ")}</span>{r.detail ? ` — ${r.detail}` : ""}
              </div>
              {r.action === "skipped_ambiguous" && (
                <div className="text-primary">Use Merge Duplicates above to combine these, then GBG's next update will sync.</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
