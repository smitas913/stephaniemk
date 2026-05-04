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
import { fetchFinancialSettings } from "@/lib/financialSettings";
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
 * Goals (single source of truth = `business_goals`):
 *   - Monthly Baseline Sales Goal  (metric_key = "production")
 *   - Monthly Stretch Sales Goal   (metric_key = "sales_stretch")
 *   - Monthly Profit Goal optional (metric_key = "profit_goal")
 *
 * Daily target = Baseline ÷ 28; Weekly = Baseline ÷ 4.
 */
export default function SalesRevenueTile({ selectedDate, compact }: SalesRevenueTileProps) {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: businessGoals = [] } = useQuery({ queryKey: ["business-goals"], queryFn: fetchBusinessGoals });
  const { data: settings } = useQuery({ queryKey: ["financial-settings"], queryFn: fetchFinancialSettings });
  const margin = (settings?.profit_margin_rate ?? 50) / 100;

  const baselineRow = businessGoals.find((g) => g.period === "monthly" && g.metric_key === "production");
  const stretchRow = businessGoals.find((g) => g.period === "monthly" && g.metric_key === "sales_stretch");
  const profitRow = businessGoals.find((g) => g.period === "monthly" && g.metric_key === "profit_goal");
  const weeklyRow = businessGoals.find((g) => g.period === "weekly" && g.metric_key === "production");

  const baseline = baselineRow?.goal_value ?? 0;
  const stretch = stretchRow?.goal_value ?? 0;
  const profitGoal = profitRow?.goal_value ?? 0;
  const dailyTarget = baseline / 28;
  const weeklyTarget = baseline / 4;

  const [open, setOpen] = useState(false);
  const [draftBaseline, setDraftBaseline] = useState("");
  const [draftStretch, setDraftStretch] = useState("");
  const [draftProfit, setDraftProfit] = useState("");

  const openModal = () => {
    setDraftBaseline(baseline > 0 ? String(Math.round(baseline)) : "");
    setDraftStretch(stretch > 0 ? String(Math.round(stretch)) : "");
    setDraftProfit(profitGoal > 0 ? String(Math.round(profitGoal)) : "");
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (vals: { baseline: number; stretch: number; profit: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Not signed in");

      const upsert = async (
        row: typeof baselineRow,
        metricKey: string,
        metricLabel: string,
        value: number,
        sortOrder: number,
      ) => {
        if (row?.id) {
          await updateBusinessGoal(row.id, { goal_value: value });
        } else {
          await supabase.from("business_goals" as any).insert({
            user_id: userId,
            metric_key: metricKey,
            metric_label: metricLabel,
            period: "monthly",
            goal_value: value,
            unit: "currency",
            is_visible: true,
            sort_order: sortOrder,
          } as any);
        }
      };

      await upsert(baselineRow, "production", "Production", vals.baseline, 1);
      await upsert(stretchRow, "sales_stretch", "Monthly Stretch Sales", vals.stretch, 3);
      await upsert(profitRow, "profit_goal", "Monthly Profit Goal (optional)", vals.profit, 4);

      // Keep weekly Production row in sync (Baseline ÷ 4).
      if (weeklyRow?.id) {
        await updateBusinessGoal(weeklyRow.id, { goal_value: vals.baseline / 4 });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["business-goals"] });
      toast.success("Sales goals updated");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save goals"),
  });

  const parseAmt = (s: string) => {
    const n = Number(s.replace(/[^\d.]/g, ""));
    return isFinite(n) && n >= 0 ? n : 0;
  };

  const handleSave = () => {
    saveMutation.mutate({
      baseline: parseAmt(draftBaseline),
      stretch: parseAmt(draftStretch),
      profit: parseAmt(draftProfit),
    });
  };

  // Today
  const todaySales = orders
    .filter((o: any) => (typeof o.order_date === "string" ? o.order_date.slice(0, 10) : "") === selectedDate)
    .reduce((sum: number, o: any) => sum + (Number(o.retail_amount) || 0), 0);

  // Week
  const d = new Date(selectedDate + "T12:00:00");
  const wkStart = toLocalDateKey(startOfWeek(d, { weekStartsOn: 1 }));
  const wkEnd = toLocalDateKey(endOfWeek(d, { weekStartsOn: 1 }));
  const weeklySales = orders
    .filter((o: any) => {
      const k = typeof o.order_date === "string" ? o.order_date.slice(0, 10) : "";
      return k >= wkStart && k <= wkEnd;
    })
    .reduce((sum: number, o: any) => sum + (Number(o.retail_amount) || 0), 0);

  // Month + estimated profit
  const moStart = toLocalDateKey(startOfMonth(d));
  const moEnd = toLocalDateKey(endOfMonth(d));
  const monthOrders = orders.filter((o: any) => {
    const k = typeof o.order_date === "string" ? o.order_date.slice(0, 10) : "";
    return k >= moStart && k <= moEnd;
  });
  const monthlySales = monthOrders.reduce((sum: number, o: any) => sum + (Number(o.retail_amount) || 0), 0);
  const monthlyProfit = monthOrders.reduce((sum: number, o: any) => {
    if (o.payment_status !== "Paid") return sum;
    const retail = Number(o.retail_amount) || 0;
    const disc = Number(o.discount_amount) || 0;
    const fee = Number(o.cc_fee_amount) || 0;
    const netRev = o.net_received != null ? Number(o.net_received) : (retail - disc - fee);
    const np = o.net_profit != null ? Number(o.net_profit) : netRev * margin;
    return sum + np;
  }, 0);

  const hasGoal = baseline > 0;
  const pct = hasGoal ? Math.round((todaySales / dailyTarget) * 100) : 0;
  const onTrack = hasGoal && todaySales >= dailyTarget;
  const numberColor = onTrack ? "text-green-600" : "text-foreground";
  const barColor = onTrack ? "[&>div]:bg-green-500" : "[&>div]:bg-primary";

  const baselinePct = baseline > 0 ? Math.min(100, Math.round((monthlySales / baseline) * 100)) : 0;
  const stretchPct = stretch > 0 ? Math.min(100, Math.round((monthlySales / stretch) * 100)) : 0;
  const profitPct = profitGoal > 0 ? Math.min(100, Math.round((monthlyProfit / profitGoal) * 100)) : 0;

  const setGoalPrompt = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openModal();
      }}
      className="text-[10px] text-primary hover:underline"
    >
      Set Monthly Sales Goals →
    </button>
  );

  const goalSummary = hasGoal ? (
    <p className="text-[10px] text-muted-foreground">
      Week: {fmt(weeklySales)} / {fmt(weeklyTarget)}
    </p>
  ) : null;

  const Modal = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Monthly Sales Goals</DialogTitle>
          <DialogDescription>
            Daily = Baseline ÷ 28 · Weekly = Baseline ÷ 4
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="goal-baseline">Monthly Baseline Sales Goal</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="goal-baseline"
                inputMode="decimal"
                autoFocus
                className="pl-7"
                placeholder="0"
                value={draftBaseline}
                onChange={(e) => setDraftBaseline(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-stretch">Monthly Stretch Sales Goal</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="goal-stretch"
                inputMode="decimal"
                className="pl-7"
                placeholder="0"
                value={draftStretch}
                onChange={(e) => setDraftStretch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-profit">Monthly Profit Goal (optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="goal-profit"
                inputMode="decimal"
                className="pl-7"
                placeholder="0"
                value={draftProfit}
                onChange={(e) => setDraftProfit(e.target.value)}
              />
            </div>
          </div>
          {parseAmt(draftBaseline) > 0 && (
            <p className="text-xs text-muted-foreground">
              Weekly: {fmt(parseAmt(draftBaseline) / 4)} · Daily: {fmt(parseAmt(draftBaseline) / 28)}
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
          title="Click to set Monthly Sales Goals"
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
          {hasGoal ? goalSummary : setGoalPrompt}
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
        title="Click to set Monthly Sales Goals"
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
          {hasGoal ? <div className="mt-0.5">{goalSummary}</div> : <div className="mt-0.5">{setGoalPrompt}</div>}
        </div>
      </div>
      {Modal}
    </>
  );
}
