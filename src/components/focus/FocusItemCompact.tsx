import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";
import type { FocusItemData } from "./FocusItemRow";

interface FocusItemCompactProps {
  item: FocusItemData;
  onDrillDown?: () => void;
  lightDay?: boolean;
}

export default function FocusItemCompact({ item, onDrillDown, lightDay }: FocusItemCompactProps) {
  const current = Math.max(0, item.current);

  return (
    <button
      type="button"
      onClick={onDrillDown}
      className={cn(
        "w-full flex items-center justify-between gap-2 text-left rounded -mx-1 px-1 py-0.5 hover:bg-muted/50 transition-colors",
        lightDay && "opacity-80",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">{item.label}</span>
        {item.isAutoTracked && <Zap className="w-3 h-3 text-amber-500 shrink-0" />}
      </div>
      <span className="text-base font-bold tabular-nums text-foreground shrink-0">{current}</span>
    </button>
  );
}
