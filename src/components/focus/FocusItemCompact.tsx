import { cn } from "@/lib/utils";
import { Check, Plus, Minus, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { FocusItemData } from "./FocusItemRow";

interface FocusItemCompactProps {
  item: FocusItemData;
  onAdjust?: (delta: number) => void;
  onToggleComplete?: () => void;
  onDrillDown?: () => void;
  readOnly?: boolean;
}

export default function FocusItemCompact({
  item, onAdjust, onToggleComplete, onDrillDown, readOnly,
}: FocusItemCompactProps) {
  const met = item.current >= item.target;
  const done = item.isComplete || met;
  const pct = item.target > 0 ? Math.min(100, Math.round((item.current / item.target) * 100)) : 0;

  return (
    <div
      className={cn(
        "rounded-md border p-2 transition-colors",
        done
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/10"
          : "border-border/50 bg-background/80"
      )}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <button
          type="button"
          onClick={onDrillDown}
          className="flex items-center gap-1 min-w-0 text-left flex-1"
        >
          <span
            className={cn(
              "text-[11px] font-medium truncate",
              done ? "text-muted-foreground line-through" : "text-foreground"
            )}
          >
            {item.label}
          </span>
          {item.isAutoTracked && (
            <Zap className="w-2.5 h-2.5 text-amber-500 shrink-0" />
          )}
        </button>
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums shrink-0",
            done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )}
        >
          {item.current}/{item.target}
        </span>
      </div>

      <Progress value={pct} className="h-1" />

      {!readOnly && (
        <div className="flex items-center justify-between mt-1.5">
          <button
            type="button"
            onClick={onToggleComplete}
            className={cn(
              "w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
              done
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-muted-foreground/30 hover:border-primary"
            )}
          >
            {done && <Check className="w-2.5 h-2.5" />}
          </button>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onAdjust?.(-1)}
              className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30"
              disabled={item.current <= 0}
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              onClick={() => onAdjust?.(1)}
              className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:bg-muted"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
