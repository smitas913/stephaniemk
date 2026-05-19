import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { ChevronRight, User, TrendingUp, CalendarPlus, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toLocalDateKey, parseLocalDate } from "@/lib/dateOnly";
import { addDays, format } from "date-fns";
import type { FocusDetailItem } from "@/lib/focusMetrics";

const TYPE_COLORS: Record<string, string> = {
  Customer: "bg-primary/10 text-primary",
  Lead: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Consultant: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  Prospect: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Event: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Hostess: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const FILTER_TYPES = ["All", "Lead", "Customer", "Consultant"] as const;
type FilterType = typeof FILTER_TYPES[number];

interface BookingSummary {
  attempts: number;
  bookings: number;
  conversionRate: number;
  bookingDetails: FocusDetailItem[];
}

interface FocusDrillDownProps {
  open: boolean;
  onClose: () => void;
  title: string;
  dateLabel: string;
  items: FocusDetailItem[];
  onNavigate?: (type: string, id: string) => void;
  showTypeFilter?: boolean;
  bookingSummary?: BookingSummary;
}

function ConversionBreakdownRow({ label, attempts, bookings, color }: { label: string; attempts: number; bookings: number; color: string }) {
  const rate = attempts > 0 ? Math.round((bookings / attempts) * 100) : 0;
  return (
    <div className="flex items-center justify-between text-xs py-1.5">
      <span className={cn("px-2 py-0.5 rounded font-medium text-[10px]", color)}>{label}</span>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span>{attempts} attempt{attempts !== 1 ? "s" : ""}</span>
        <span className="text-foreground font-medium">{bookings} booked</span>
        <span className="font-semibold text-foreground w-10 text-right">{rate}%</span>
      </div>
    </div>
  );
}

// ─── Inline resolution actions for a "Rescheduling" booking-activity row ───
function ReschedulingActions({ eventRowId, onResolved }: { eventRowId: string; onResolved: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<null | "booked" | "working">(null);
  const [pickedDate, setPickedDate] = useState<Date | undefined>(addDays(new Date(), 7));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["focus-daily-progress"] });
    onResolved();
  };

  // Find the linked customer/lead for the event's hostess so we can keep
  // their follow-up task in sync with the booking-attempt resolution.
  const getLinkedCustomerId = async (): Promise<string | null> => {
    const { data: ev } = await supabase
      .from("events")
      .select("hostess_converted_customer_id, hostess_name, hostess_phone, owner_user_id")
      .eq("id", eventRowId)
      .maybeSingle();
    if (!ev) return null;
    if ((ev as any).hostess_converted_customer_id) return (ev as any).hostess_converted_customer_id as string;
    // Fallback: match by name (+ optional phone) within the same owner
    const name = (ev as any).hostess_name as string | null;
    if (!name) return null;
    let q = supabase.from("customers").select("id").ilike("full_name", name.trim());
    if ((ev as any).owner_user_id) q = q.eq("owner_user_id", (ev as any).owner_user_id);
    const { data: rows } = await q.limit(1);
    return rows && rows.length ? (rows[0] as any).id : null;
  };

  const syncCustomerFollowUp = async (nextDate: string | null) => {
    const cid = await getLinkedCustomerId();
    if (!cid) return;
    await supabase.from("customers").update({
      next_follow_up_date: nextDate,
    } as any).eq("id", cid);
  };

  const sheBooked = async () => {
    if (!pickedDate) return;
    setBusy(true);
    const { error } = await supabase.from("events").update({
      event_date: toLocalDateKey(pickedDate),
      event_status: "Booked",
      reschedule_status: "None",
      reschedule_attempt_number: 0,
      reschedule_next_follow_up_date: null,
      rebook_not_interested: false,
    } as any).eq("id", eventRowId);
    if (!error) await syncCustomerFollowUp(null);
    setBusy(false);
    if (error) { toast.error("Failed to update event"); return; }
    toast.success("Marked booked — new date saved");
    setMode(null);
    refresh();
  };

  const noLonger = async () => {
    setBusy(true);
    const { error } = await supabase.from("events").update({
      rebook_not_interested: true,
      reschedule_next_follow_up_date: null,
    } as any).eq("id", eventRowId);
    if (!error) await syncCustomerFollowUp(null);
    setBusy(false);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("Closed — removed from Today");
    refresh();
  };

  const stillWorking = async () => {
    if (!pickedDate || toLocalDateKey(pickedDate) <= toLocalDateKey()) {
      toast.error("Pick a future follow-up date");
      return;
    }
    const nextKey = toLocalDateKey(pickedDate);
    setBusy(true);
    const { error } = await supabase.from("events").update({
      reschedule_status: "In Process of Rescheduling",
      reschedule_next_follow_up_date: nextKey,
    } as any).eq("id", eventRowId);
    if (!error) await syncCustomerFollowUp(nextKey);
    setBusy(false);
    if (error) { toast.error("Failed to update"); return; }
    toast.success(`Follow-up moved to ${format(pickedDate, "MMM d")}`);
    setMode(null);
    refresh();
  };

  if (mode) {
    return (
      <div className="mt-2 p-2 rounded-md border border-border/50 bg-muted/30 space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-medium text-foreground">
          {mode === "booked" ? "New event date" : "Next follow-up date"}
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="w-full h-8 justify-start text-xs gap-1.5">
              <CalendarIcon className="w-3 h-3" />
              {pickedDate ? format(pickedDate, "MMM d, yyyy") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={pickedDate} onSelect={setPickedDate}
              disabled={mode === "working" ? (d) => toLocalDateKey(d) <= toLocalDateKey() : undefined}
              initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs" disabled={busy}
            onClick={mode === "booked" ? sheBooked : stillWorking}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs" disabled={busy}
            onClick={() => setMode(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
        disabled={busy} onClick={() => setMode("booked")}>
        ✅ She Booked
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
        disabled={busy} onClick={noLonger}>
        ❌ No Longer Pursuing
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
        disabled={busy} onClick={() => setMode("working")}>
        🔄 Still Working
      </Button>
    </div>
  );
}

export default function FocusDrillDown({
  open, onClose, title, dateLabel, items, onNavigate, showTypeFilter, bookingSummary,
}: FocusDrillDownProps) {
  const [filter, setFilter] = useState<FilterType>("All");

  const filteredItems = filter === "All" ? items : items.filter(i => i.type === filter);

  // Per-type breakdown for booking summary
  const typeBreakdown = bookingSummary ? (() => {
    const types = ["Lead", "Customer", "Consultant"] as const;
    return types.map(t => {
      const attempts = items.filter(i => i.type === t).length;
      const bookings = bookingSummary.bookingDetails.filter(b => b.type === t).length;
      return { label: t, attempts, bookings };
    }).filter(r => r.attempts > 0 || r.bookings > 0);
  })() : [];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setFilter("All"); } }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {filteredItems.length} {filteredItems.length === 1 ? "activity" : "activities"} — {dateLabel}
          </SheetDescription>
        </SheetHeader>

        {/* Overall conversion stats */}
        {bookingSummary && (
          <div className="mt-3 p-3 rounded-lg border border-border/50 bg-muted/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="font-medium text-foreground">Conversion Rate</span>
              </div>
              <span className="text-lg font-bold text-foreground">{bookingSummary.conversionRate}%</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{bookingSummary.attempts} attempt{bookingSummary.attempts !== 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1">
                <CalendarPlus className="w-3 h-3 text-emerald-500" />
                {bookingSummary.bookings} booked
              </span>
            </div>

            {/* Per-type breakdown */}
            {typeBreakdown.length > 0 && (
              <div className="pt-2 border-t border-border/50 space-y-0.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">By Type</p>
                {typeBreakdown.map(r => (
                  <ConversionBreakdownRow
                    key={r.label}
                    label={r.label}
                    attempts={r.attempts}
                    bookings={r.bookings}
                    color={TYPE_COLORS[r.label] || "bg-muted text-muted-foreground"}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {showTypeFilter && items.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {FILTER_TYPES.map((ft) => {
              const count = ft === "All" ? items.length : items.filter(i => i.type === ft).length;
              if (ft !== "All" && count === 0) return null;
              return (
                <button
                  key={ft}
                  type="button"
                  onClick={() => setFilter(ft)}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors",
                    filter === ft
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {ft} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No activity logged</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isReschedule = item.method === "Reschedule";
              return (
                <div key={item.id + (item.method || "")} className="rounded-lg border border-border/50 hover:bg-muted/50 transition-colors">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 p-3 text-left"
                    onClick={() => onNavigate?.(item.type, item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", TYPE_COLORS[item.type] || "bg-muted text-muted-foreground")}>
                          {item.type}
                        </span>
                        {item.method && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            isReschedule
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                              : "bg-secondary text-secondary-foreground"
                          )}>
                            {isReschedule ? "Rescheduling" : item.method}
                          </span>
                        )}
                        {item.isBookingAttempt && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                            Booking Attempt
                          </span>
                        )}
                        {item.detail && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">{item.detail}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                  </button>
                  {isReschedule && (
                    <div className="px-3 pb-3">
                      <ReschedulingActions eventRowId={item.id} onResolved={onClose} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
