import { cn } from "@/lib/utils";
import { CalendarCheck, Headphones, Zap } from "lucide-react";
import type { FocusItemData } from "./FocusItemRow";

interface FocusItemCompactProps {
  item: FocusItemData;
  onDrillDown?: () => void;
  lightDay?: boolean;
}

function TileIcon({ label }: { label: string }) {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("booking") || normalized.includes("party")) {
    return <CalendarCheck className="w-3.5 h-3.5 text-primary shrink-0" />;
  }
  return <Headphones className="w-3.5 h-3.5 text-primary shrink-0" />;
}

export default function FocusItemCompact({ item, onDrillDown, lightDay }: FocusItemCompactProps) {
  const current = Math.max(0, item.current);

  return (
    <button
      type="button"
      onClick={onDrillDown}
      className={cn(
        "w-full text-left rounded-lg border border-border/50 bg-background/80 p-2.5 hover:bg-muted/40 transition-colors flex items-center gap-2.5",
        lightDay && "opacity-80",
      )}
    >
      <div className="flex-shrink-0 w-7 h-7 rounded-full border-2 border-primary/30 flex items-center justify-center bg-primary/5">
        <TileIcon label={item.label} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-foreground truncate">{item.label}</span>
            {item.isAutoTracked && <Zap className="w-3 h-3 text-amber-500 shrink-0" />}
          </div>
          <span className="text-base font-bold tabular-nums text-foreground shrink-0">{current}</span>
        </div>
      </div>
    </button>
  );
}
