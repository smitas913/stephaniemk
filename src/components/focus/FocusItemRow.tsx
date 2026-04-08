import { cn } from "@/lib/utils";
import { Check, Plus, Minus, Zap, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export interface FocusItemData {
  sort_order: number;
  label: string;
  current: number;
  target: number;
  isComplete: boolean;
  isAutoTracked: boolean;
}

interface FocusItemRowProps {
  item: FocusItemData;
  onAdjust?: (delta: number) => void;
  onToggleComplete?: () => void;
  onDrillDown?: () => void;
  readOnly?: boolean;
  isMobile?: boolean;
}

export default function FocusItemRow({
  item, onAdjust, onToggleComplete, onDrillDown, readOnly, isMobile,
}: FocusItemRowProps) {
  const met = item.current >= item.target;
  const done = item.isComplete || met;
  const pct = item.target > 0 ? Math.min(100, Math.round((item.current / item.target) * 100)) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg border transition-colors",
        done
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/10"
          : "border-border/50 bg-background/80"
      )}
    >
      {/* Complete toggle */}
      {!readOnly ? (
        <button
          type="button"
          onClick={onToggleComplete}
          className={cn(
            "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-muted-foreground/30 hover:border-primary"
          )}
        >
          {done && <Check className="w-3 h-3" />}
        </button>
      ) : (
        <div
          className={cn(
            "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-muted-foreground/20"
          )}
        >
          {done && <Check className="w-3 h-3" />}
        </div>
      )}

      {/* Label + progress - clickable for drill-down */}
      <button
        type="button"
        onClick={onDrillDown}
        className="flex-1 min-w-0 text-left group"
      >
        <div className="flex items-center justify-between mb-0.5">
          <span
            className={cn(
              "text-sm truncate",
              done ? "line-through text-muted-foreground" : "text-foreground font-medium"
            )}
          >
            {item.label}
          </span>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {item.isAutoTracked && (
              <span title="Auto-tracked"><Zap className="w-3 h-3 text-amber-500" /></span>
            )}
            <span className={cn("text-xs font-medium", done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
              {item.current}/{item.target}
            </span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <Progress value={pct} className="h-1.5" />
      </button>

      {/* Manual +/- controls */}
      {!readOnly && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onAdjust?.(-1)}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            disabled={item.current <= 0}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onAdjust?.(1)}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
