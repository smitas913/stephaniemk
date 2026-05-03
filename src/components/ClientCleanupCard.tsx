import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { fetchUserPreferences, upsertUserPreferences } from "@/lib/queries";
import { useIncompleteItems } from "@/hooks/useIncompleteItems";
import { toLocalDateKey } from "@/lib/dateOnly";

/**
 * Client Cleanup — flexible, low-pressure maintenance task.
 * Replaces the rigid weekly "Monday Business Reset" banner. Always
 * visible when there are gaps to fix; can be dismissed for the day.
 */
export default function ClientCleanupCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery({ queryKey: ["user-preferences"], queryFn: fetchUserPreferences });
  const { flagged, incomplete, totalToComplete } = useIncompleteItems();

  const todayKey = toLocalDateKey();
  const dismissedToday = prefs?.weekly_reset_last_dismissed === todayKey;

  const dismissMutation = useMutation({
    mutationFn: () => upsertUserPreferences({ weekly_reset_last_dismissed: todayKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-preferences"] }),
  });

  const show = useMemo(() => totalToComplete > 0 && !dismissedToday, [totalToComplete, dismissedToday]);

  if (!show) return null;

  return (
    <Card className="border-border/60 bg-muted/30 shadow-none">
      <CardContent className="py-2.5 px-3 flex items-start gap-2.5">
        <div className="rounded-full bg-muted p-1.5 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-foreground">Client Cleanup</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
              Optional
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Clean up and update your client records when you have time.
            {incomplete.length > 0 && (
              <> <span className="font-medium text-foreground">{incomplete.length}</span> missing info</>
            )}
            {incomplete.length > 0 && flagged.length > 0 && " · "}
            {flagged.length > 0 && (
              <><span className="font-medium text-foreground">{flagged.length}</span> flagged</>
            )}
            .
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => navigate("/clients?tab=customers&attention=1&view=all")}
            >
              Review {totalToComplete} item{totalToComplete === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label="Dismiss for today"
          title="Dismiss for today"
          onClick={() => dismissMutation.mutate()}
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </CardContent>
    </Card>
  );
}
