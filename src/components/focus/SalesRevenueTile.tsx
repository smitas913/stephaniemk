import { useQuery } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { fetchOrders, fetchBusinessGoals } from "@/lib/queries";
import { toLocalDateKey } from "@/lib/dateOnly";

interface SalesRevenueTileProps {
  selectedDate: string;
  compact?: boolean;
}

const fmt = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Sales tile.
 *
 * Single source of truth = the user's **Monthly Production goal** in
 * Settings → Business Goals. Weekly and Daily targets are derived:
 *   Weekly = Monthly ÷ 4
 *   Daily  = Weekly ÷ 7  (= Monthly ÷ 28)
 *
 * If the user has not set a monthly goal, we show a clear "Set goal" prompt
 * instead of silently displaying derived numbers from a default.
 */
export default function SalesRevenueTile({ selectedDate, compact }: SalesRevenueTileProps) {
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: businessGoals = [] } = useQuery({ queryKey: ["business-goals"], queryFn: fetchBusinessGoals });

  // Monthly Production goal is the user-defined source of truth.
  const monthlyGoal = businessGoals.find(
    (g) => g.period === "monthly" && g.metric_key === "production"
  )?.goal_value ?? 0;

  const weeklyGoal = monthlyGoal / 4;
  const dailyTarget = weeklyGoal / 7;

  // Today's sales (selectedDate)
  const todaySales = orders
    .filter((o: any) => (typeof o.order_date === "string" ? o.order_date.slice(0, 10) : "") === selectedDate)
    .reduce((sum: number, o: any) => sum + (Number(o.retail_amount) || 0), 0);

  // Weekly running total (week containing selectedDate)
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
    <Link
      to="/momentum"
      className="text-[10px] text-primary hover:underline"
      title="Set your Monthly Sales Goal in Business Goals"
    >
      Set Monthly Sales Goal →
    </Link>
  );

  if (compact) {
    return (
      <div className="space-y-1">
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
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background/80">
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
  );
}
