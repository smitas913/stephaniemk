import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Star, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusItems } from "@/hooks/useFocusItems";
import type { DayType } from "@/hooks/useFocusItems";

/**
 * Compact, read-only summary of today's "6 Most Important Things" for the Dashboard.
 * Full editor lives on the Today page (/follow-ups).
 */
export default function SixMostImportantSummary() {
  const navigate = useNavigate();
  const { configs, progress, getTargetForItem, isOOO } = useFocusItems();

  const dayType: DayType = (progress[0]?.day_type as DayType) || "power";

  const items = useMemo(() => {
    return configs
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => {
        const prog = progress.find((p) => p.sort_order === c.sort_order);
        const current = (prog?.auto_count ?? 0) + (prog?.manual_adjustment ?? 0);
        const target = isOOO ? 0 : getTargetForItem(c.sort_order, dayType);
        const isComplete = (prog?.is_complete ?? false) || (target > 0 && current >= target);
        return { sort_order: c.sort_order, label: c.label, current, target, isComplete };
      });
  }, [configs, progress, dayType, getTargetForItem, isOOO]);

  const completedCount = items.filter((i) => i.isComplete).length;
  const total = items.length || 6;

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-foreground">
              6 Most Important Things
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">
              {completedCount}/{total} done
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate("/follow-ups")}
          >
            Open
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">
            Set up your daily focus on the Today page.
          </p>
        ) : (
          items.map((item) => {
            const pct =
              item.target > 0 ? Math.min((item.current / item.target) * 100, 100) : 0;
            return (
              <div key={item.sort_order} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {item.isComplete && (
                      <Check className="w-3 h-3 shrink-0 text-green-600" />
                    )}
                    <span
                      className={cn(
                        "truncate font-medium",
                        item.isComplete
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {item.current}
                    {item.target > 0 && (
                      <span className="opacity-60"> / {item.target}</span>
                    )}
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={cn(
                    "h-1.5",
                    item.isComplete && "[&>div]:bg-green-500"
                  )}
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
