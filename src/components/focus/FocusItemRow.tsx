import { cn } from "@/lib/utils";
import { Check, Zap, ChevronRight } from "lucide-react";
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
  lightDay?: boolean;
}

export default function FocusItemRow({
  item, onDrillDown, lightDay,
}: FocusItemRowProps) {
  // Completion is purely data-driven: target reached.
  const current = Math.max(0, item.current);
  const done = item.target > 0 && current >= item.target;
  const pct = item.target > 0 ? Math.min(100, Math.round((current / item.target) * 100)) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg border transition-colors",
        done
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/10"
          : "border-border/50 bg-background/80",
        lightDay && "opacity-80"
      )}
    >
      {/* Status indicator (read-only, derived from progress) */}
      <div
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-muted-foreground/20"
        )}
        title={done ? "Target reached" : `${item.current} of ${item.target}`}
      >
        {done && <Check className="w-3 h-3" />}
      </div>

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
              {current}/{item.target}
            </span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <Progress value={pct} className="h-1.5" />
      </button>
    </div>
  );
}
