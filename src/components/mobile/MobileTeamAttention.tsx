import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Calendar, Phone, MessageSquare, StickyNote, ChevronRight, Crown, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type TeamFilter = "attention" | "today" | "all";

export interface MobileTeamItem {
  id: string;
  itemType: "consultant" | "hostess" | "event_task";
  name: string;
  phone: string | null;
  follow_up_status: string;
  daysOverdue?: number | null;
  lastContacted?: string;
  followUpReason?: string;
  actionLabel?: string;
  focusGroup?: string;
}

interface Props {
  items: MobileTeamItem[];
  onSchedule: (item: MobileTeamItem) => void;
  onCall: (item: MobileTeamItem) => void;
  onText: (item: MobileTeamItem) => void;
  onNote: (item: MobileTeamItem) => void;
  onOpen: (item: MobileTeamItem) => void;
}

function getStatusBadge(item: MobileTeamItem) {
  if (item.follow_up_status === "OVERDUE") {
    return { label: "Overdue", className: "bg-destructive/15 text-destructive border-destructive/30" };
  }
  if (item.follow_up_status === "TODAY") {
    return { label: "Today", className: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700" };
  }
  return { label: "Up to Date", className: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700" };
}

function getTag(item: MobileTeamItem): string | null {
  if (item.focusGroup === "New Consultant") return "New";
  if (item.follow_up_status === "OVERDUE" && (item.daysOverdue ?? 0) > 14) return "Needs Attention";
  if (item.focusGroup === "General" || !item.focusGroup) return "Active";
  return item.focusGroup;
}

function getDueLine(item: MobileTeamItem): string {
  if (item.follow_up_status === "OVERDUE" && item.daysOverdue) {
    return `Due: ${item.daysOverdue}d overdue`;
  }
  if (item.follow_up_status === "TODAY") return "Due: Today";
  return "Due: Up to date";
}

function phoneForLink(p: string | null) {
  if (!p) return "";
  return p.replace(/\D/g, "");
}

export default function MobileTeamAttention({ items, onSchedule, onCall, onText, onNote, onOpen }: Props) {
  const [filter, setFilter] = useState<TeamFilter>("attention");

  const needsAttentionCount = useMemo(() =>
    items.filter(i => i.follow_up_status === "OVERDUE" || i.follow_up_status === "TODAY").length,
    [items]
  );

  const filtered = useMemo(() => {
    if (filter === "attention") return items.filter(i => i.follow_up_status === "OVERDUE" || i.follow_up_status === "TODAY");
    if (filter === "today") return items.filter(i => i.follow_up_status === "TODAY");
    return items;
  }, [items, filter]);

  if (items.length === 0) return null;

  const FILTERS: { key: TeamFilter; label: string }[] = [
    { key: "attention", label: "Needs Attention" },
    { key: "today", label: "Today" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-3">
      {/* Header with badge */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-violet-50 dark:bg-violet-950/30">
          <Crown className="w-4 h-4 text-violet-600" />
        </div>
        <span className="text-sm font-semibold text-foreground">Team Attention</span>
        {needsAttentionCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
            <Flame className="w-3.5 h-3.5" /> {needsAttentionCount} Need Attention
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border",
              filter === key
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-2.5">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">All caught up! 🎉</p>
        )}
        {filtered.map(item => {
          const status = getStatusBadge(item);
          const tag = getTag(item);
          const dueLine = getDueLine(item);
          const lastLine = item.lastContacted ? `Last: ${item.lastContacted}` : "Last: No contact";

          return (
            <div
              key={`${item.itemType}-${item.id}`}
              className="rounded-xl border border-border/60 bg-card p-3.5 space-y-2.5 shadow-sm"
            >
              {/* Line 1: Name + status badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground truncate">{item.name}</span>
                <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 shrink-0 font-semibold", status.className)}>
                  {status.label}
                </Badge>
              </div>

              {/* Line 2: Key info */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{lastLine}</span>
                <span className="text-border">·</span>
                <span className={cn(
                  item.follow_up_status === "OVERDUE" && "text-destructive font-medium"
                )}>{dueLine}</span>
              </div>

              {/* Line 3: Tag */}
              {tag && (
                <div>
                  <span className={cn(
                    "inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    tag === "New" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                    tag === "Needs Attention" && "bg-destructive/10 text-destructive",
                    tag !== "New" && tag !== "Needs Attention" && "bg-muted text-muted-foreground"
                  )}>
                    {tag}
                  </span>
                </div>
              )}

              {/* Line 4: Actions */}
              <div className="flex items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => onSchedule(item)}
                  className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Schedule"
                >
                  <Calendar className="w-4.5 h-4.5 text-primary" />
                </button>
                {item.phone ? (
                  <>
                    <a
                      href={`tel:${phoneForLink(item.phone)}`}
                      className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors"
                      aria-label="Call"
                      onClick={(e) => { e.stopPropagation(); onCall(item); }}
                    >
                      <Phone className="w-4.5 h-4.5 text-primary" />
                    </a>
                    <div onClick={(e) => { e.stopPropagation(); onText(item); }} className="inline-flex">
                      <TextActionButton phone={item.phone} trigger="icon" className="w-10 h-10 rounded-lg hover:bg-muted" iconClassName="w-4 h-4" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 flex items-center justify-center">
                      <Phone className="w-4.5 h-4.5 text-muted-foreground/30" />
                    </div>
                    <div className="w-10 h-10 flex items-center justify-center">
                      <MessageSquare className="w-4.5 h-4.5 text-muted-foreground/30" />
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onNote(item)}
                  className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Notes"
                >
                  <StickyNote className="w-4.5 h-4.5 text-primary" />
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Open profile"
                >
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
