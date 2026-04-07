import { useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Phone, MessageSquare, Users, Crown, CalendarCheck,
  CheckCircle2, Calendar, ArrowRight, ExternalLink,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { toLocalDateKey, formatDateOnly } from "@/lib/dateOnly";

// ─── Types ───

export type PersonType = "customer" | "lead" | "consultant" | "prospect" | "hostess" | "event_task";

export interface UniversalActionItem {
  id: string;
  personType: PersonType;
  name: string;
  phone: string | null;
  email: string | null;
  statusLabel?: string;
  vip?: string;
  followUpReason?: string;
  daysOverdue?: number | null;
  followUpStatus?: string;
}

type ActionStep = "action" | "notes" | "whats-next";

const QUICK_ACTIONS = [
  { key: "Text", label: "Texted", icon: MessageSquare, emoji: "💬" },
  { key: "Call", label: "Called", icon: Phone, emoji: "📞" },
  { key: "In Person", label: "Spoke", icon: Users, emoji: "🤝" },
  { key: "Did Not Connect", label: "No Response", icon: Phone, emoji: "📵" },
] as const;

const WHATS_NEXT_OPTIONS = [
  { key: "schedule", label: "Schedule a date", icon: Calendar },
  { key: "tomorrow", label: "Try again tomorrow", icon: ArrowRight },
  { key: "next-week", label: "Move to next week", icon: CalendarCheck },
  { key: "none", label: "No follow-up needed", icon: CheckCircle2 },
] as const;

const TYPE_BADGE_MAP: Record<PersonType, { label: string; className: string }> = {
  customer: { label: "Customer", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  prospect: { label: "Prospect", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  lead: { label: "Lead", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  consultant: { label: "Consultant", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  hostess: { label: "Hostess", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  event_task: { label: "Event Task", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
};

function getAutoTags(personType: PersonType): { isFollowUp: boolean; isBookingAttempt: boolean } {
  switch (personType) {
    case "lead":
      return { isFollowUp: true, isBookingAttempt: true };
    case "consultant":
      return { isFollowUp: true, isBookingAttempt: false };
    case "customer":
    case "prospect":
    case "hostess":
    case "event_task":
    default:
      return { isFollowUp: true, isBookingAttempt: false };
  }
}

interface Props {
  item: UniversalActionItem | null;
  open: boolean;
  onClose: () => void;
  onLogAction: (params: {
    item: UniversalActionItem;
    actionType: string;
    note: string;
    isBookingAttempt: boolean;
    isFollowUp: boolean;
    nextFollowUpDate: string | null;
  }) => void;
  onNavigateToProfile?: (item: UniversalActionItem) => void;
  isPending?: boolean;
}

export default function UniversalActionPanel({ item, open, onClose, onLogAction, onNavigateToProfile, isPending }: Props) {
  const [step, setStep] = useState<ActionStep>("action");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [nextOption, setNextOption] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [actionLogged, setActionLogged] = useState(false);

  const resetState = useCallback(() => {
    setStep("action");
    setSelectedAction(null);
    setNoteText("");
    setNextOption(null);
    setCustomDate("");
    setActionLogged(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleActionClick = useCallback((actionKey: string) => {
    if (!item) return;
    setSelectedAction(actionKey);

    // Immediately log the activity
    const tags = getAutoTags(item.personType);
    const noteBody = `${actionKey} contact`;

    onLogAction({
      item,
      actionType: actionKey,
      note: noteBody,
      isBookingAttempt: tags.isBookingAttempt,
      isFollowUp: tags.isFollowUp,
      nextFollowUpDate: null, // Will be set in "What's Next" step
    });

    setActionLogged(true);
    // Skip directly to "What's Next?" (notes are optional inline)
    setStep("whats-next");
  }, [item, onLogAction]);

  const handleWhatsNext = useCallback((optionKey: string) => {
    if (!item) return;
    setNextOption(optionKey);

    if (optionKey === "schedule") {
      // Show date picker — don't close yet
      return;
    }

    let nextDate: string | null = null;
    if (optionKey === "tomorrow") {
      nextDate = format(addDays(new Date(), 1), "yyyy-MM-dd");
    } else if (optionKey === "next-week") {
      nextDate = format(addDays(new Date(), 7), "yyyy-MM-dd");
    }
    // "none" = null date

    // Log follow-up date update
    const tags = getAutoTags(item.personType);
    onLogAction({
      item,
      actionType: selectedAction || "Call",
      note: noteText.trim() || `${selectedAction || "Call"} contact`,
      isBookingAttempt: tags.isBookingAttempt,
      isFollowUp: tags.isFollowUp,
      nextFollowUpDate: nextDate,
    });

    handleClose();
  }, [item, selectedAction, noteText, onLogAction, handleClose]);

  const handleScheduleDate = useCallback(() => {
    if (!item || !customDate) return;

    const tags = getAutoTags(item.personType);
    onLogAction({
      item,
      actionType: selectedAction || "Call",
      note: noteText.trim() || `${selectedAction || "Call"} contact`,
      isBookingAttempt: tags.isBookingAttempt,
      isFollowUp: tags.isFollowUp,
      nextFollowUpDate: customDate,
    });

    handleClose();
  }, [item, customDate, selectedAction, noteText, onLogAction, handleClose]);

  if (!item) return null;

  const badge = TYPE_BADGE_MAP[item.personType];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-safe">
        <SheetHeader className="pb-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-bold text-foreground truncate">{item.name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", badge.className)}>
                  {badge.label}
                </span>
                {item.vip === "VIP" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-medium">VIP</span>
                )}
                {item.followUpStatus === "OVERDUE" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">
                    {item.daysOverdue ? `${item.daysOverdue}d overdue` : "Overdue"}
                  </span>
                )}
                {item.statusLabel && (
                  <span className="text-[10px] text-muted-foreground">{item.statusLabel}</span>
                )}
              </div>
            </div>
            {onNavigateToProfile && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onNavigateToProfile(item)}>
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-4 pt-2">
          {/* Success banner */}
          {actionLogged && selectedAction && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                {selectedAction === "Did Not Connect" ? "Attempt logged" : `${selectedAction} logged`} ✓
              </p>
            </div>
          )}

          {/* Step 1: Quick Actions */}
          {step === "action" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">What did you do?</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleActionClick(action.key)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                      "border-border bg-card hover:border-primary hover:bg-primary/5",
                      "active:scale-[0.97]",
                      isPending && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className="text-lg">{action.emoji}</span>
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Auto-tag indicator */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-muted-foreground">Auto-tags:</span>
                {getAutoTags(item.personType).isFollowUp && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Follow-Up</Badge>
                )}
                {getAutoTags(item.personType).isBookingAttempt && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Booking Attempt</Badge>
                )}
                {item.personType === "consultant" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Coaching</Badge>
                )}
              </div>
            </div>
          )}

          {/* Step 2: What's Next? (with optional notes inline) */}
          {step === "whats-next" && (
            <div className="space-y-4">
              {/* Optional notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                <Textarea
                  placeholder="Quick note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="min-h-[50px]"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">What's next?</p>
                <div className="space-y-1.5">
                  {WHATS_NEXT_OPTIONS.map((option) => {
                    const isSelected = nextOption === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        disabled={isPending}
                        onClick={() => handleWhatsNext(option.key)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border bg-card hover:border-primary/50 hover:bg-muted/50",
                          "active:scale-[0.99]",
                          isPending && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <option.icon className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                        <span className="text-sm font-medium text-foreground">{option.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Date picker for "Schedule a date" */}
                {nextOption === "schedule" && (
                  <div className="space-y-2 pt-2 pl-2 border-l-2 border-primary/20 ml-2">
                    <Input
                      type="date"
                      value={customDate}
                      min={format(new Date(), "yyyy-MM-dd")}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="h-9"
                      autoFocus
                    />
                    <Button
                      className="w-full"
                      onClick={handleScheduleDate}
                      disabled={!customDate || isPending}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      {isPending ? "Saving..." : `Set for ${customDate ? formatDateOnly(customDate) : "..."}`}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
