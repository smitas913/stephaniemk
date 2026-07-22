import { cn } from "@/lib/utils";
import { Zap, ChevronRight } from "lucide-react";

export interface FocusItemData {
  sort_order: number;
  label: string;
  current: number;
  isAutoTracked: boolean;
}

interface FocusItemRowProps {
  item: FocusItemData;
  onDrillDown?: () => void;
  isMobile?: boolean;
  lightDay?: boolean;
}

export default function FocusItemRow({ item, onDrillDown, lightDay }: FocusItemRowProps) {
  const current = Math.max(0, item.current);

  return (
    <button
      type="button"
      onClick={onDrillDown}
      className={cn(
        "w-full flex items-center gap-2 p-2 rounded-lg border transition-colors text-left group",
        "border-border/50 bg-background/80 hover:bg-muted/40",
        lightDay && "opacity-80",
      )}
    >
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground truncate">{item.label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.isAutoTracked && (
            <span title="Auto-tracked"><Zap className="w-3 h-3 text-amber-500" /></span>
          )}
          <span className="text-base font-bold tabular-nums text-foreground">{current}</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </button>
  );
}
