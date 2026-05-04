import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrders, fetchBusinessGoals, updateBusinessGoal } from "@/lib/queries";
import { toLocalDateKey } from "@/lib/dateOnly";
import { toast } from "sonner";

interface SalesRevenueTileProps {
  selectedDate: string;
  compact?: boolean;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Sales tile.
 *
 * Single source of truth = the user's **Monthly Production goal** in `business_goals`.
 *   Weekly = Monthly ÷ 4
 *   Daily  = Weekly ÷ 7  (= Monthly ÷ 28)
 *
 * Clicking the tile opens a modal to set / update the Monthly Sales Goal inline.
 */
export default function SalesRevenueTile({ selectedDate, compact }: SalesRevenueTileProps) {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: businessGoals = [] } = useQuery({ queryKey: ["business-goals"], queryFn: fetchBusinessGoals });

  const monthlyGoalRow = businessGoals.find(
    (g) => g.period === "monthly" && g.metric_key === "production"
  );
  const weeklyGoalRow = businessGoals.find(
    (g) => g.period === "weekly" && g.metric_key === "production"
  );
  const monthlyGoal = monthlyGoalRow?.goal_value ?? 0;

  const weeklyGoal = monthlyGoal / 4;
  const dailyTarget = weeklyGoal / 7;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>("");

  const openModal = () => {
    setDraft(monthlyGoal > 0 ? String(Math.round(monthlyGoal)) : "");
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (value: number) => {
      // Update monthly row (create if missing via fetch, but fetch auto-seeds)
      if (monthlyGoalRow?.id) {
        await updateBusinessGoal(monthlyGoalRow.id, { goal_value: value });
      } else {
        const { data: u } = await supabase.auth.getUser();
        const userId = u.user?.id;
        if (!userId) throw new Error("Not signed in");
        await supabase.from("business_goals" as any).insert({
          user_id: userId,
          metric_key: "production",
          metric_label: "Production",
          period: "monthly",
          goal_value: value,
          unit: "currency",
          is_visible: true,
          sort_order: 1,
        } as any);
      }
      // Keep weekly row in sync (Monthly ÷ 4) so other surfaces stay aligned.
      const weeklyDerived = value / 4;
      if (weeklyGoalRow?.id) {
        await updateBusinessGoal(weeklyGoalRow.id, { goal_value: weeklyDerived });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["business-goals"] });
      toast.success("Monthly Sales Goal updated");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save goal"),
  });

  const handleSave = () => {
    const cleaned = draft.replace(/[^\d.]/g, "");
    const value = Number(cleaned);
    if (!isFinite(value) || value < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    saveMutation.mutate(value);
  };

  // Today's sales
  const todaySales = orders
    .filter((o: any) => (typeof o.order_date === "string" ? o.order_date.slice(0, 10) : "") === selectedDate)
    .reduce((sum: number, o: any) => sum + (Number(o.retail_amount) || 0), 0);

  // Weekly running total
  const d = new Date(selectedDate + "T12:00:00");
  const wkStart = toLocalDateKey(startOfWeek(d, { weekStartsOn: 1 }));
  const wkEnd = toLocalDateKey(endOfWeek(d, { weekStartsOn: 1 }));
  const weeklySales = orders
    .filter((o: any) => {
      const k = typeof o.order_date === "string" ? o.order_date.slice(0, 10) : "";
      return k >= wkStart && k <= wkEnd;
    })
    .reduce((sum: number, o: any) => sum + (Number(o.retail_amount) || 0), 0);

  // Monthly running total
  const moStart = toLocalDateKey(startOfMonth(d));
  const moEnd = toLocalDateKey(endOfMonth(d));
  const monthlySales = orders
    .filter((o: any) => {
      const k = typeof o.order_date === "string" ? o.order_date.slice(0, 10) : "";
      return k >= moStart && k <= moEnd;
    })
    .reduce((sum: number, o: any) => sum + (Number(o.retail_amount) || 0), 0);

  const hasGoal = monthlyGoal > 0;
  const pct = hasGoal ? Math.round((todaySales / dailyTarget) * 100) : 0;
  const onTrack = hasGoal && todaySales >= dailyTarget;
  const numberColor = onTrack ? "text-green-600" : "text-foreground";
  const barColor = onTrack ? "[&>div]:bg-green-500" : "[&>div]:bg-primary";

  const setGoalPrompt = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openModal();
      }}
      className="text-[10px] text-primary hover:underline"
    >
      Set Monthly Sales Goal →
    </button>
  );

  const Modal = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Monthly Sales Goal</DialogTitle>
          <DialogDescription>
            Weekly = Monthly ÷ 4 · Daily = Weekly ÷ 7
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="monthly-sales-goal">Monthly Sales Goal</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="monthly-sales-goal"
              inputMode="decimal"
              autoFocus
              className="pl-7"
              placeholder="0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          {draft && Number(draft.replace(/[^\d.]/g, "")) > 0 && (
            <p className="text-xs text-muted-foreground">
              Weekly: {fmt(Number(draft.replace(/[^\d.]/g, "")) / 4)} · Daily: {fmt(Number(draft.replace(/[^\d.]/g, "")) / 28)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (compact) {
    return (
      <>
        <div
          className="space-y-1 cursor-pointer rounded -mx-1 px-1 py-0.5 hover:bg-muted/50 transition-colors"
          role="button"
          tabIndex={0}
          onClick={openModal}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); } }}
          title="Click to set Monthly Sales Goal"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">Sales</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn("text-base font-bold tabular-nums", numberColor)}>
                {fmt(todaySales)}{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  / {hasGoal ? fmt(dailyTarget) : "—"}
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                {hasGoal ? `${pct}%` : "—"}
              </span>
            </div>
          </div>
          <Progress value={Math.min(100, pct)} className={cn("h-2", barColor)} />
          {hasGoal ? (
            <p className="text-[10px] text-muted-foreground">
              Week: {fmt(weeklySales)} / {fmt(weeklyGoal)} · Month: {fmt(monthlySales)} / {fmt(monthlyGoal)}
            </p>
          ) : (
            setGoalPrompt
          )}
        </div>
        {Modal}
      </>
    );
  }

  return (
    <>
      <div
        className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background/80 cursor-pointer hover:bg-muted/40 transition-colors"
        role="button"
        tabIndex={0}
        onClick={openModal}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); } }}
        title="Click to set Monthly Sales Goal"
      >
        <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-emerald-500/40 flex items-center justify-center">
          <DollarSign className="w-3 h-3 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm font-medium text-foreground truncate">Sales</span>
            <span className={cn("text-xs font-medium", onTrack ? "text-emerald-600" : "text-muted-foreground")}>
              {fmt(todaySales)} / {hasGoal ? fmt(dailyTarget) : "—"} {hasGoal ? `· ${pct}%` : ""}
            </span>
          </div>
          <Progress value={Math.min(100, pct)} className={cn("h-1.5", barColor)} />
          {hasGoal ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Week: {fmt(weeklySales)} / {fmt(weeklyGoal)} · Month: {fmt(monthlySales)} / {fmt(monthlyGoal)}
            </p>
          ) : (
            <div className="mt-0.5">{setGoalPrompt}</div>
          )}
        </div>
      </div>
      {Modal}
    </>
  );
}
