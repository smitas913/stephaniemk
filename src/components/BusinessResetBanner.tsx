import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarCheck, X, Settings2 } from "lucide-react";
import { fetchUserPreferences, upsertUserPreferences } from "@/lib/queries";
import { useIncompleteItems } from "@/hooks/useIncompleteItems";
import { toLocalDateKey } from "@/lib/dateOnly";
import { toast } from "sonner";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Returns the most recent date (YYYY-MM-DD) on or before today
 * that matches the given weekday (0=Sun..6=Sat).
 */
function lastResetDate(dayOfWeek: number): string {
  const today = new Date();
  const diff = (today.getDay() - dayOfWeek + 7) % 7;
  const d = new Date(today);
  d.setDate(today.getDate() - diff);
  return toLocalDateKey(d);
}

export default function BusinessResetBanner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery({ queryKey: ["user-preferences"], queryFn: fetchUserPreferences });
  const { flagged, incomplete, totalToComplete } = useIncompleteItems();

  const resetDay = prefs?.weekly_reset_day ?? 1; // default Monday
  const todayKey = toLocalDateKey();
  const currentResetWindow = lastResetDate(resetDay);
  const isResetDay = todayKey >= currentResetWindow;
  const dismissedThisWeek = prefs?.weekly_reset_last_dismissed === currentResetWindow;

  const dismissMutation = useMutation({
    mutationFn: () => upsertUserPreferences({ weekly_reset_last_dismissed: currentResetWindow }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-preferences"] }),
  });

  const setDayMutation = useMutation({
    mutationFn: (day: number) => upsertUserPreferences({ weekly_reset_day: day }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-preferences"] });
      toast.success("Reset day updated");
    },
  });

  const showBanner = useMemo(() => {
    if (totalToComplete === 0) return false;
    if (!isResetDay) return false;
    if (dismissedThisWeek) return false;
    return true;
  }, [totalToComplete, isResetDay, dismissedThisWeek]);

  if (!showBanner) return null;

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-sm">
      <CardContent className="py-3 px-4 flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2 shrink-0">
          <CalendarCheck className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">
              {DAY_NAMES_FULL[resetDay]} Business Reset
            </p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">
              Weekly
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            You have{" "}
            {incomplete.length > 0 && (
              <>
                <span className="font-semibold text-foreground">{incomplete.length}</span> profile
                {incomplete.length === 1 ? "" : "s"} to complete
              </>
            )}
            {incomplete.length > 0 && flagged.length > 0 && " · "}
            {flagged.length > 0 && (
              <>
                <span className="font-semibold text-foreground">{flagged.length}</span> flagged item
                {flagged.length === 1 ? "" : "s"} to finish
              </>
            )}
            .
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs" onClick={() => navigate("/customers?attention=1")}>
              Review {totalToComplete} item{totalToComplete === 1 ? "" : "s"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending}
            >
              Dismiss this week
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Reset settings">
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Reset day</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {DAY_NAMES.map((d, i) => (
                <DropdownMenuItem
                  key={i}
                  onClick={() => setDayMutation.mutate(i)}
                  className={i === resetDay ? "font-semibold" : ""}
                >
                  {DAY_NAMES_FULL[i]}
                  {i === resetDay && " ✓"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Dismiss"
            onClick={() => dismissMutation.mutate()}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
