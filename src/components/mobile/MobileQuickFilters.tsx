import { cn } from "@/lib/utils";
import type { MobileActionItem } from "./MobileFollowUpRow";

export type FilterKey = "all" | "calls" | "texts" | "followups" | "booking" | "recruiting" | "coaching";

interface Props {
  items: MobileActionItem[];
  active: FilterKey;
  onChange: (key: FilterKey) => void;
}

function getFilterCounts(items: MobileActionItem[]) {
  let calls = 0, texts = 0, followups = 0, booking = 0, recruiting = 0, coaching = 0;

  for (const item of items) {
    const reason = (item.followUpReason || item.actionLabel || "").toLowerCase();
    if (item.phone) calls++;
    if (item.phone) texts++;
    followups++;
    if (reason.includes("booking")) booking++;
    if (reason.includes("recruiting") || reason.includes("prospect") || item.itemType === "prospect") recruiting++;
    if (reason.includes("coaching") || item.itemType === "consultant") coaching++;
  }

  return { all: items.length, calls, texts, followups, booking, recruiting, coaching };
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "followups", label: "Follow-Ups" },
  { key: "booking", label: "Booking" },
  { key: "coaching", label: "Coaching" },
  { key: "recruiting", label: "Recruiting" },
];

export function filterItems(items: MobileActionItem[], filter: FilterKey): MobileActionItem[] {
  if (filter === "all") return items;
  if (filter === "calls" || filter === "texts") return items.filter(i => i.phone);
  if (filter === "followups") return items;
  if (filter === "booking") return items.filter(i => {
    const r = (i.followUpReason || i.actionLabel || "").toLowerCase();
    return r.includes("booking");
  });
  if (filter === "recruiting") return items.filter(i => {
    const r = (i.followUpReason || i.actionLabel || "").toLowerCase();
    return r.includes("recruiting") || r.includes("prospect") || i.itemType === "prospect";
  });
  if (filter === "coaching") return items.filter(i => {
    const r = (i.followUpReason || i.actionLabel || "").toLowerCase();
    return r.includes("coaching") || i.itemType === "consultant";
  });
  return items;
}

export default function MobileQuickFilters({ items, active, onChange }: Props) {
  const counts = getFilterCounts(items);

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
      {FILTERS.map(({ key, label }) => {
        const count = counts[key];
        if (key !== "all" && count === 0) return null;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
              "border",
              active === key
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {label}
            <span className={cn(
              "text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full font-semibold",
              active === key
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
