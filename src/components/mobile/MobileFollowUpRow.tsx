import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Phone, CheckCircle2, MoreHorizontal, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import TextActionButton from "@/components/TextActionButton";
import { getLeadPriority, PRIORITY_META } from "@/lib/leadPriority";

export interface MobileActionItem {
  id: string;
  itemType: "customer" | "prospect" | "consultant" | "hostess" | "lead" | "event_task";
  name: string;
  phone: string | null;
  email: string | null;
  follow_up_status: string;
  daysOverdue?: number | null;
  followUpReason?: string;
  actionLabel: string;
  lastContacted?: string | null;
  days_since_last_order?: number | null;
  vip?: string;
  lastNotePreview?: string;
  activity_status?: string;
  _attempts?: number;
  _leadStatus?: string;
  _lastContactRaw?: string | null;
  _tags?: string[];
  _alsoOverdue?: boolean;
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  customer: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300",
  prospect: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300",
  lead: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300",
  consultant: "bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300",
  hostess: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300",
  event_task: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300",
};

const TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  prospect: "Prospect",
  lead: "Lead",
  consultant: "Consultant",
  hostess: "Hostess",
  event_task: "Task",
};

function getDetailLine(item: MobileActionItem): string | null {
  if (item.days_since_last_order != null && item.days_since_last_order > 0) {
    return `${item.days_since_last_order}d since order`;
  }
  if (item.lastContacted) return `Last contact ${item.lastContacted}`;
  if (item.activity_status) return item.activity_status;
  return null;
}

function getReasonCategory(item: MobileActionItem): string {
  const reason = item.followUpReason || item.actionLabel || "";
  if (reason.toLowerCase().includes("booking")) return "Booking";
  if (reason.toLowerCase().includes("coaching")) return "Coaching";
  if (reason.toLowerCase().includes("recruiting") || reason.toLowerCase().includes("prospect")) return "Recruiting";
  return "Follow-Up";
}

interface Props {
  item: MobileActionItem;
  onTap: () => void;
  onCall?: () => void;
  onText?: () => void;
  onComplete?: () => void;
  onReschedule?: () => void;
  onSkip?: () => void;
  onAddNote?: () => void;
}

export default function MobileFollowUpRow({
  item, onTap, onCall, onText, onComplete, onReschedule, onSkip, onAddNote,
}: Props) {
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeThreshold = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = Math.abs(e.touches[0].clientY - touchStart.current.y);
    // Only allow horizontal swipe if it's more horizontal than vertical
    if (dy > Math.abs(dx) * 0.5) return;
    setSwipeX(Math.max(-120, Math.min(120, dx)));
  };

  const handleTouchEnd = () => {
    if (swipeX > swipeThreshold) {
      onComplete?.();
    } else if (swipeX < -swipeThreshold) {
      onReschedule?.();
    }
    setSwipeX(0);
    setSwiping(false);
    touchStart.current = null;
  };

  const urgencyBadge = (() => {
    if (item.itemType === "lead") {
      const attempts = item._attempts ?? 0;
      const p = getLeadPriority({ attempts, lastContactDate: item._lastContactRaw, status: item._leadStatus });
      const meta = PRIORITY_META[p];
      return (
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap", meta.className)} title={`${meta.label} — ${attempts} ${attempts === 1 ? "attempt" : "attempts"}`}>
          {meta.icon} {attempts}
        </span>
      );
    }
    return item.follow_up_status === "OVERDUE" ? (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold whitespace-nowrap">
        {item.daysOverdue ? `${item.daysOverdue}d overdue` : "Overdue"}
      </span>
    ) : (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold whitespace-nowrap">
        Today
      </span>
    );
  })();

  const detailLine = getDetailLine(item);
  const reasonCategory = getReasonCategory(item);
  const hasNote = !!item.lastNotePreview;

  return (
    <div className="relative overflow-hidden">
      {/* Swipe reveal backgrounds */}
      <div className="absolute inset-0 flex">
        <div className={cn(
          "flex items-center justify-start pl-4 w-1/2 transition-opacity",
          swipeX > 20 ? "opacity-100" : "opacity-0",
          "bg-emerald-500/20"
        )}>
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700 ml-1">Complete</span>
        </div>
        <div className={cn(
          "flex items-center justify-end pr-4 w-1/2 transition-opacity",
          swipeX < -20 ? "opacity-100" : "opacity-0",
          "bg-amber-500/20"
        )}>
          <span className="text-xs font-medium text-amber-700 mr-1">Reschedule</span>
          <Calendar className="w-5 h-5 text-amber-600" />
        </div>
      </div>

      {/* Main row content */}
      <div
        className={cn(
          "relative bg-card px-3 py-2.5 transition-transform",
          swiping ? "" : "transition-all duration-200"
        )}
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start gap-2">
          {/* Main content area - tappable, takes all available space */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onTap}>
            {/* Row 1: Name + badges */}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-0.5">
              <p className="text-[15px] font-semibold text-foreground leading-snug break-words">
                {item.name}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                {item.vip === "VIP" && (
                  <span className="text-[9px] px-1 py-px rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-semibold">
                    VIP
                  </span>
                )}
                {urgencyBadge}
              </div>
            </div>

            {/* Row 2: Note preview */}
            {item.lastNotePreview && (
              <p className="text-[11px] text-muted-foreground leading-tight truncate mb-0.5">
                {item.lastNotePreview}
              </p>
            )}

            {/* Row 3: Type + reason + detail */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", TYPE_BADGE_STYLES[item.itemType])}>
                {TYPE_LABELS[item.itemType]}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">
                {reasonCategory}
              </span>
              {detailLine && (
                <span className="text-[10px] text-muted-foreground">
                  · {detailLine}
                </span>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-col items-center gap-0 shrink-0 w-10">
            {item.phone && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  asChild
                >
                  <a href={`tel:${item.phone}`} onClick={(e) => e.stopPropagation()}>
                    <Phone className="w-4 h-4 text-primary" />
                  </a>
                </Button>
                <TextActionButton phone={item.phone} trigger="icon" className="h-9 w-9 rounded-full" iconClassName="w-4 h-4" />
              </>
            )}

            {/* 3-dot button → opens the unified 2-step wizard (same as tapping the row) */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={(e) => { e.stopPropagation(); onTap(); }}
              aria-label="Open activity log"
            >
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
