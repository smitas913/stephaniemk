import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { FocusItemData } from "./FocusItemRow";

interface FocusItemCompactProps {
  item: FocusItemData;
  onAdjust?: (delta: number) => void;
  onToggleComplete?: () => void;
  onDrillDown?: () => void;
  readOnly?: boolean;
  lightDay?: boolean;
}

export default function FocusItemCompact({
  item, onDrillDown, lightDay,
}: FocusItemCompactProps) {
  const current = Math.max(0, item.current);
  const done = item.target > 0 && current >= item.target;
  const pct = item.target > 0 ? Math.min(100, Math.round((current / item.target) * 100)) : 0;

  const numberColor = done ? "text-green-600" : "text-foreground";
  const barColor = done ? "[&>div]:bg-green-500" : "[&>div]:bg-primary";

  return (
    <div className={cn("space-y-1", lightDay && "opacity-80")}>
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
          {lightDay ? (
            <span className="text-base font-bold tabular-nums text-foreground">
              {current}{" "}
              <span className="text-muted-foreground font-normal text-xs italic">
                · optional
              </span>
            </span>
          ) : (
            <>
              <span className={cn("text-base font-bold tabular-nums", numberColor)}>
                {current}{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  / {item.target}
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                {item.target > 0 ? `${pct}%` : "—"}
              </span>
            </>
          )}
        </div>
      </div>
      {!lightDay && <Progress value={pct} className={cn("h-2", barColor)} />}
    </div>
  );
}