import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SectionKey =
  | "booking"
  | "customer_followup"
  | "prospect_followup"
  | "coaching"
  | "relationships";

const DEFAULT_ORDER: SectionKey[] = [
  "booking",
  "customer_followup",
  "prospect_followup",
  "coaching",
  "relationships",
];

const STORAGE_KEY = "today_section_prefs";

type SectionPrefs = {
  order: SectionKey[];
  collapsed: Record<string, boolean>;
};

function loadPrefs(): SectionPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { order: DEFAULT_ORDER, collapsed: {} };
}

function savePrefs(prefs: SectionPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

// Hook to manage section order + collapse state
export function useTodaySections() {
  const [prefs, setPrefs] = useState<SectionPrefs>(loadPrefs);

  const toggleCollapsed = useCallback((key: SectionKey) => {
    setPrefs((prev) => {
      const next = {
        ...prev,
        collapsed: { ...prev.collapsed, [key]: !prev.collapsed[key] },
      };
      savePrefs(next);
      return next;
    });
  }, []);

  const moveSection = useCallback((key: SectionKey, direction: "up" | "down") => {
    setPrefs((prev) => {
      const order = [...prev.order];
      const idx = order.indexOf(key);
      if (idx === -1) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= order.length) return prev;
      [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
      const next = { ...prev, order };
      savePrefs(next);
      return next;
    });
  }, []);

  // Ensure all keys exist in order (handles new sections added later)
  const fullOrder = [
    ...prefs.order.filter((k) => DEFAULT_ORDER.includes(k)),
    ...DEFAULT_ORDER.filter((k) => !prefs.order.includes(k)),
  ];

  return { order: fullOrder, collapsed: prefs.collapsed, toggleCollapsed, moveSection };
}

// Wrapper component for each section
export function TodaySectionWrapper({
  sectionKey,
  title,
  count,
  order,
  totalSections,
  collapsed,
  onToggleCollapsed,
  onMove,
  children,
  className,
}: {
  sectionKey: SectionKey;
  title: string;
  count?: number;
  order: number;
  totalSections: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onMove: (direction: "up" | "down") => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      {/* Section header with collapse + reorder controls */}
      <div className="flex items-center justify-between gap-2 mb-1 px-1">
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-2 flex-1 text-left group"
        >
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0",
              collapsed && "-rotate-90"
            )}
          />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
            {title}
          </span>
          {count !== undefined && count > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {count}
            </span>
          )}
        </button>
        <div className="flex items-center gap-0.5 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onMove("up")}
            disabled={order === 0}
            title="Move up"
          >
            <ArrowUp className="w-3 h-3 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onMove("down")}
            disabled={order === totalSections - 1}
            title="Move down"
          >
            <ArrowDown className="w-3 h-3 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Section content */}
      {!collapsed && <div>{children}</div>}
    </div>
  );
}
