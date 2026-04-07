import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ChevronRight, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FocusDetailItem } from "@/components/TodaysFocus";

const TYPE_COLORS: Record<string, string> = {
  Customer: "bg-primary/10 text-primary",
  Lead: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Consultant: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  Prospect: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Event: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

interface FocusDrillDownProps {
  open: boolean;
  onClose: () => void;
  title: string;
  dateLabel: string;
  items: FocusDetailItem[];
  onNavigate?: (type: string, id: string) => void;
}

export default function FocusDrillDown({
  open, onClose, title, dateLabel, items, onNavigate,
}: FocusDrillDownProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {items.length} {items.length === 1 ? "activity" : "activities"} — {dateLabel}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No activity logged</p>
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id + (item.method || "")}
                type="button"
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors text-left"
                onClick={() => onNavigate?.(item.type, item.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", TYPE_COLORS[item.type] || "bg-muted text-muted-foreground")}>
                      {item.type}
                    </span>
                    {item.method && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">
                        {item.method}
                      </span>
                    )}
                    {item.detail && (
                      <span className="text-[10px] text-muted-foreground">{item.detail}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
