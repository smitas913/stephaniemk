import { useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Phone, MessageSquare, Mail, Users,
  CheckCircle2, Calendar, ArrowRight, ExternalLink,
  CalendarCheck, Clock, SkipForward, ShoppingCart,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, addDays } from "date-fns";
import { formatDateOnly } from "@/lib/dateOnly";
import { openEmail } from "@/lib/emailPreference";
import TextActionButton from "@/components/TextActionButton";
import { INTENT_CATEGORIES, REASONS_BY_CATEGORY, resolveIntentCategory, type IntentCategory } from "@/lib/intentCategory";

// ─── Types ───

export type PersonType = "customer" | "lead" | "consultant" | "prospect" | "hostess" | "event_task";

export interface RecentNote {
  date: string;
  actionType: string;
  preview: string;
}

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
  nextFollowUpDate?: string | null;
  recentNotes?: RecentNote[];
}

type ActionStep = "action" | "whats-next";

const QUICK_ACTIONS = [
  { key: "Text", label: "Texted", icon: MessageSquare, emoji: "💬" },
  { key: "Call", label: "Called", icon: Phone, emoji: "📞" },
  { key: "In Person", label: "Spoke", icon: Users, emoji: "🤝" },
  { key: "Email", label: "Emailed", icon: Mail, emoji: "📧" },
  { key: "Did Not Connect", label: "No Response", icon: Phone, emoji: "📵" },
] as const;

const WHATS_NEXT_OPTIONS = [
  { key: "tomorrow", label: "Try again tomorrow", icon: ArrowRight },
  { key: "next-week", label: "Move to next week", icon: CalendarCheck },
  { key: "30d", label: "30 Days — Check-in", icon: CheckCircle2 },
  { key: "60d", label: "60 Days — Mid-cycle", icon: CheckCircle2 },
  { key: "90d", label: "90 Days — Reorder / Reconnect", icon: CheckCircle2 },
  { key: "schedule", label: "Custom Date", icon: Calendar },
] as const;

import { LONG_TERM_TOUCH_DAYS, resolveLongTermFollowUpDate } from "@/lib/longTermFollowUp";

// ─── Intent-based reason options ───
// Reasons are NOT keyed by person type. Every interaction picks from the same
// canonical reason list, grouped by the category that reason routes to. The
// default (no reason selected) is the "Follow-Up" category.
//
// Suggested reasons surface first per person type purely as a UX nudge, but
// users can always pick any reason from any category.
const SUGGESTED_REASONS_BY_PERSON: Partial<Record<PersonType, string[]>> = {
  customer: ["General Check-In", "Booking Ask", "Trial / Sample Follow-Up", "Product Check-In"],
  lead: ["Booking Ask", "General Check-In", "Trial / Sample Follow-Up"],
  hostess: ["Hostess Coaching", "Event Prep", "Event Reminder", "Event Follow-Up", "Rescheduling"],
  event_task: ["Hostess Coaching", "Event Prep", "Event Reminder", "Event Follow-Up"],
  prospect: ["Initial Outreach", "Recruiting Follow-Up", "Interview / Info Shared"],
  consultant: ["Coaching", "Accountability", "Training / Support"],
};

/** Which intent categories are visible per person type. Reduces decision fatigue. */
const ALLOWED_CATEGORIES_BY_PERSON: Record<PersonType, IntentCategory[]> = {
  customer: ["Follow-Up", "Booking"],
  lead: ["Follow-Up", "Booking"],
  hostess: ["Coaching", "Booking", "Follow-Up"],
  event_task: ["Coaching", "Booking"],
  prospect: ["Recruiting", "Follow-Up"],
  consultant: ["Coaching", "Team Building"],
};

const TYPE_BADGE_MAP: Record<PersonType, { label: string; className: string }> = {
  customer: { label: "Customer", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  prospect: { label: "Prospect", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  lead: { label: "Lead", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  consultant: { label: "Consultant", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  hostess: { label: "Hostess", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  event_task: { label: "Event Task", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
};

const CATEGORY_BADGE_CLASS: Record<IntentCategory, string> = {
  "Follow-Up": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  Booking: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Coaching: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Recruiting: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Team Building": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

/**
 * Auto-tag flags are now driven by the resolved intent category, not the
 * person type. This means an event "General Check-In" with a hostess lands
 * in Follow-Up, while "Booking Ask" with a customer lands in Booking, etc.
 */
function getAutoTags(_personType: PersonType, followUpReason?: string | null): { isFollowUp: boolean; isBookingAttempt: boolean; category: IntentCategory } {
  const category = resolveIntentCategory(followUpReason);
  return {
    isBookingAttempt: category === "Booking",
    // Coaching, Team Building and Recruiting count under their own category, not Follow-Up.
    isFollowUp: category === "Follow-Up",
    category,
  };
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
    nextFollowUpDate?: string | null;
    followUpReason?: string | null;
    /** Resolved intent category (Follow-Up | Booking | Coaching | Recruiting | Team Building). */
    category: IntentCategory;
  }) => void;
  onSkip?: (item: UniversalActionItem) => void;
  onNavigateToProfile?: (item: UniversalActionItem) => void;
  isPending?: boolean;
}

export default function UniversalActionPanel({ item, open, onClose, onLogAction, onSkip, onNavigateToProfile, isPending }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<ActionStep>("action");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [nextOption, setNextOption] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [actionLogged, setActionLogged] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  // Manual booking-attempt override. `null` = use auto-derived value from intent;
  // `true`/`false` = user explicitly toggled it on/off.
  const [bookingAttemptOverride, setBookingAttemptOverride] = useState<boolean | null>(null);

  const resetState = useCallback(() => {
    setStep("action");
    setSelectedAction(null);
    setNoteText("");
    setNextOption(null);
    setCustomDate("");
    setActionLogged(false);
    setSelectedReason(null);
    setBookingAttemptOverride(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleActionClick = useCallback((actionKey: string) => {
    if (!item) return;
    setSelectedAction(actionKey);
    setActionLogged(true);
    setStep("whats-next");
  }, [item]);

  const buildNote = useCallback(() => {
    const parts: string[] = [];
    if (selectedReason) parts.push(`[${selectedReason}]`);
    if (noteText.trim()) parts.push(noteText.trim());
    if (parts.length === 0) parts.push(`${selectedAction || "Call"} contact`);
    return parts.join(" ");
  }, [selectedReason, noteText, selectedAction]);

  const handleWhatsNext = useCallback((optionKey: string) => {
    if (!item) return;
    setNextOption(optionKey);
    if (optionKey === "schedule") return;

    let nextDate: string | null = null;
    let reasonForLog = selectedReason;
    if (optionKey === "tomorrow") nextDate = format(addDays(new Date(), 1), "yyyy-MM-dd");
    else if (optionKey === "next-week") nextDate = format(addDays(new Date(), 7), "yyyy-MM-dd");
    else if (optionKey === "30d") {
      nextDate = format(addDays(new Date(), 30), "yyyy-MM-dd");
      reasonForLog = selectedReason || "30-Day Check-In";
    } else if (optionKey === "60d") {
      nextDate = format(addDays(new Date(), 60), "yyyy-MM-dd");
      reasonForLog = selectedReason || "60-Day Mid-Cycle";
    } else if (optionKey === "90d") {
      nextDate = format(addDays(new Date(), 90), "yyyy-MM-dd");
      reasonForLog = selectedReason || "90-Day Reorder / Reconnect";
    }

    const tags = getAutoTags(item.personType, selectedReason);
    const isBookingAttempt = bookingAttemptOverride ?? tags.isBookingAttempt;
    onLogAction({
      item,
      actionType: selectedAction || "Call",
      note: buildNote(),
      isBookingAttempt,
      isFollowUp: tags.isFollowUp,
      nextFollowUpDate: nextDate ?? undefined,
      followUpReason: reasonForLog,
      category: tags.category,
    });
    handleClose();
  }, [item, selectedAction, buildNote, selectedReason, bookingAttemptOverride, onLogAction, handleClose]);

  const handleScheduleDate = useCallback(() => {
    if (!item || !customDate) return;
    const tags = getAutoTags(item.personType, selectedReason);
    const isBookingAttempt = bookingAttemptOverride ?? tags.isBookingAttempt;
    onLogAction({
      item,
      actionType: selectedAction || "Call",
      note: buildNote(),
      isBookingAttempt,
      isFollowUp: tags.isFollowUp,
      nextFollowUpDate: customDate,
      followUpReason: selectedReason,
      category: tags.category,
    });
    handleClose();
  }, [item, customDate, selectedAction, buildNote, selectedReason, bookingAttemptOverride, onLogAction, handleClose]);

  if (!item) return null;

  const badge = TYPE_BADGE_MAP[item.personType];
  const recentNotes = item.recentNotes || [];
  const suggestedReasons = SUGGESTED_REASONS_BY_PERSON[item.personType] || [];
  const resolvedCategory = resolveIntentCategory(selectedReason);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] flex flex-col pb-safe p-0">
        {/* ── Header ── */}
        <SheetHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-bold text-foreground truncate">{item.name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                {item.followUpStatus === "TODAY" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">Due Today</span>
                )}
                {item.statusLabel && (
                  <span className="text-[10px] text-muted-foreground">{item.statusLabel}</span>
                )}
              </div>
              {item.nextFollowUpDate && (
                <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>Next: {formatDateOnly(item.nextFollowUpDate, "MMM d")}</span>
                </div>
              )}
            </div>
            {onNavigateToProfile && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1"
                onClick={() => onNavigateToProfile(item)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">View Full Profile</span>
              </Button>
            )}
          </div>

          {/* ── Contact Buttons ── */}
          <div className="flex gap-2 mt-3">
            {item.phone && (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                  <a href={`tel:${item.phone}`}><Phone className="w-3 h-3 mr-1" />Call</a>
                </Button>
                <TextActionButton phone={item.phone} trigger="labeled" className="h-8 text-xs" />
              </>
            )}
            {item.email && (
              <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                <a href={`mailto:${item.email}`} onClick={(e) => openEmail(item.email!, e)}><Mail className="w-3 h-3 mr-1" />Email</a>
              </Button>
            )}
          </div>
        </SheetHeader>

        <Separator />

        {/* ── Scrollable Content ── */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">

            {/* ── Recent Activity (read-only) ── */}
            {recentNotes.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Activity</p>
                <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-2.5">
                  {recentNotes.map((note, i) => (
                    <div key={i} className={cn(
                      "flex items-start gap-2 text-xs rounded px-1.5 py-1",
                      i === 0 ? "bg-primary/10 ring-1 ring-primary/20" : ""
                    )}>
                      <span className="text-muted-foreground whitespace-nowrap shrink-0">{note.date}</span>
                      <span className="text-muted-foreground">—</span>
                      <span className="font-medium text-foreground shrink-0">{note.actionType}</span>
                      {i === 0 && (
                        <span className="text-[9px] px-1 py-0 rounded bg-primary text-primary-foreground font-semibold uppercase tracking-wide">Latest</span>
                      )}
                      {note.preview && (
                        <>
                          <span className="text-muted-foreground">—</span>
                          <span className="text-muted-foreground truncate">{note.preview}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Success banner ── */}
            {actionLogged && selectedAction && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                  {selectedAction === "Did Not Connect" ? "Attempt logged" : `${selectedAction} logged`} ✓
                </p>
              </div>
            )}

            {/* ── Step 1: Today's Action ── */}
            {step === "action" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Today's Action</p>
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

                {/* Skip / Did Not Reach Out — defers without counting as activity */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (onSkip && item) onSkip(item);
                    resetState();
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-colors",
                    "bg-[hsl(0_0%_85%)] border border-[hsl(0_0%_75%)] text-[hsl(0_0%_30%)] hover:bg-[hsl(0_0%_80%)] hover:text-[hsl(0_0%_20%)]",
                    isPending && "opacity-50 cursor-not-allowed"
                  )}
                  title="Reschedules automatically and does not count toward activity metrics"
                >
                  <SkipForward className="w-4 h-4" />
                  Skipped / Did Not Reach Out
                </button>

                {/* Category preview — shows where this activity will be filed */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Files under:</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide", CATEGORY_BADGE_CLASS[resolvedCategory])}>
                    {resolvedCategory}
                  </span>
                  {!selectedReason && (
                    <span className="text-[10px] text-muted-foreground italic">(no reason selected — defaults to Follow-Up)</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 2: What's Next? (with reason + notes) ── */}
            {step === "whats-next" && (
              <div className="space-y-4">
                {/* Follow-Up Reason picker — intent-based, grouped by category.
                    No selection ⇒ defaults to the Follow-Up category. */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-medium text-muted-foreground">
                      Reason / Intent <span className="font-normal italic">(optional — defaults to Follow-Up)</span>
                    </label>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide", CATEGORY_BADGE_CLASS[resolvedCategory])}>
                      → {resolvedCategory}
                    </span>
                  </div>

                  {/* Suggested for this person type — surfaced first as a UX nudge */}
                  {suggestedReasons.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold">Suggested</p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedReasons.map((reason) => (
                          <ReasonChip
                            key={`suggested-${reason}`}
                            reason={reason}
                            selected={selectedReason === reason}
                            onClick={() => setSelectedReason(selectedReason === reason ? null : reason)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full library, grouped by category */}
                  <div className="space-y-1.5 pt-1">
                    {INTENT_CATEGORIES.map((cat) => {
                      const reasons = REASONS_BY_CATEGORY[cat].filter((r) => !suggestedReasons.includes(r));
                      if (reasons.length === 0) return null;
                      return (
                        <div key={cat} className="space-y-0.5">
                          <p className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide", CATEGORY_BADGE_CLASS[cat])}>
                            {cat}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {reasons.map((reason) => (
                              <ReasonChip
                                key={`${cat}-${reason}`}
                                reason={reason}
                                selected={selectedReason === reason}
                                onClick={() => setSelectedReason(selectedReason === reason ? null : reason)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* New Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">New Note (optional)</label>
                  <Textarea
                    placeholder="Quick note about this interaction..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="min-h-[50px]"
                  />
                </div>

                {/* Booking Attempt toggle — independent of category, applies to any person type */}
                {(() => {
                  const autoIsBooking = resolvedCategory === "Booking";
                  const checked = bookingAttemptOverride ?? autoIsBooking;
                  return (
                    <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => setBookingAttemptOverride(v === true)}
                      />
                      <span className="text-sm font-medium text-foreground">Booking Attempt</span>
                      <span className="text-xs text-muted-foreground ml-auto">Track this as an ask</span>
                    </label>
                  );
                })()}

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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ReasonChip({ reason, selected, onClick }: { reason: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
      )}
    >
      {reason}
    </button>
  );
}
