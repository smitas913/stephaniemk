import { cn } from "@/lib/utils";
import { Plus, Minus, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { FocusItemData } from "./FocusItemRow";

interface FocusItemCompactProps {
  item: FocusItemData;
  onAdjust?: (delta: number) => void;
  onToggleComplete?: () => void; // deprecated; kept for API compatibility
  onDrillDown?: () => void;
  readOnly?: boolean;
}

/**
 * Visually aligned with MomentumScoreboard rows:
 *  - Label: text-sm font-medium
 *  - Numbers: text-base font-bold tabular-nums (status-colored)
 *  - Progress: h-2 (status-colored bar)
 *  - No checklist/checkbox styling
 */
export default function FocusItemCompact({
  item, onAdjust, onDrillDown, readOnly,
}: FocusItemCompactProps) {
  const done = item.target > 0 && item.current >= item.target;
  const pct = item.target > 0 ? Math.min(100, Math.round((item.current / item.target) * 100)) : 0;

  // Status mirrors scoreboard color logic (simplified: green when met, neutral otherwise)
  const numberColor = done ? "text-green-600" : "text-foreground";
  const barColor = done ? "[&>div]:bg-green-500" : "[&>div]:bg-primary";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDrillDown}
          className="flex items-center gap-1.5 min-w-0 text-left flex-1"
        >
          <span className="text-sm font-medium text-foreground truncate">
            {item.label}
          </span>
          {item.isAutoTracked && (
            <Zap className="w-3 h-3 text-amber-500 shrink-0" />
          )}
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("text-base font-bold tabular-nums", numberColor)}>
            {item.current}{" "}
            <span className="text-muted-foreground font-normal text-xs">
              / {item.target}
            </span>
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
            {item.target > 0 ? `${pct}%` : "—"}
          </span>
          {!readOnly && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                type="button"
                onClick={() => onAdjust?.(-1)}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30"
                disabled={item.current <= 0}
                aria-label="Decrease"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onAdjust?.(1)}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted"
                aria-label="Increase"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
      <Progress value={pct} className={cn("h-2", barColor)} />
    </div>
  );
}
