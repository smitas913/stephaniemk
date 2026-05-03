import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomers, fetchOrders, updateCustomer, createCustomerNote, fetchLatestNotes, fetchCustomerNotes,
  fetchProspects, updateProspect, createProspectNote, fetchProspectNotes,
  bulkUpdateCustomerFollowUps, fetchBookingLeads, updateBookingLead,
  fetchTeamConsultants, updateTeamConsultant, fetchEvents, updateEvent,
  fetchAllLatestNotes, fetchEventTasks, completeEventTask, createNote, fetchScheduleSettings, upsertScheduleSettings,
} from "@/lib/queries";
import type { EventTask } from "@/lib/queries";
import { buildWorkdayFlags, isTodayNonWorkday, spreadTasks } from "@/lib/smartSchedule";
import { computeCustomerFields } from "@/lib/computedFields";
import { getCadenceInfo, getNextCoachingDate, snoozeCoachingDate } from "@/lib/coachingCadence";
import { getNextDormantStage, getNextDormantFollowUpDate, getDormantStageLabel } from "@/lib/dormantCadence";
import type { DormantStage } from "@/lib/dormantCadence";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import { computeMetricsForDate } from "@/lib/focusMetrics";
import { NOTE_TYPES, COACHING_FOCUS_OPTIONS, FOCUS_GROUPS, BOOKING_LEAD_STATUSES } from "@/lib/types";
import type { Customer, CustomerComputed, CustomerNote, ProspectNote, BookingLead, TeamConsultant, EventRecord } from "@/lib/types";
import Layout from "@/components/Layout";
// SixMostImportant moved to Dashboard (/dashboard)
import ClientCleanupCard from "@/components/ClientCleanupCard";
import UniversalActionPanel from "@/components/UniversalActionPanel";
import type { UniversalActionItem } from "@/components/UniversalActionPanel";
import SkipFollowUpDialog, { type SkipChoice } from "@/components/SkipFollowUpDialog";
import { logCatalogSent } from "@/lib/catalogTracking";
import MobileTodayView from "@/components/mobile/MobileTodayView";
import type { MobileActionItem } from "@/components/mobile/MobileFollowUpRow";
import MobileTeamAttention from "@/components/mobile/MobileTeamAttention";
import type { MobileTeamItem } from "@/components/mobile/MobileTeamAttention";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Cake, Phone, MessageSquare, Mail, FileText, CheckCircle2, CalendarRange, ExternalLink, Clock, ChevronRight, CalendarCheck, Calendar, Users, Crown, Truck, PhoneMissed, SkipForward, RefreshCw, Star, Heart, Gift, ChevronDown, Plus, X, Pencil, ArrowUp, ArrowDown, RotateCcw, Palmtree, Eye, EyeOff } from "lucide-react";
import { openEmail } from "@/lib/emailPreference";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { resolveIntentCategory, categoryTag } from "@/lib/intentCategory";
import TextActionButton from "@/components/TextActionButton";
import {
  formatDateOnly,
  getDateOnlyTime,
  getDaysOverdue,
  getFollowUpStatus,
  getLocalToday,
  isDueTodayOrEarlier,
  normalizeDateOnly,
  parseLocalDate,
  toLocalDateKey,
  compareDateOnly,
} from "@/lib/dateOnly";

// ─── Helpers ───

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function normalizeFollowUpDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const sliced = value.trim().slice(0, 10);
  if (!sliced) return null;
  return normalizeDateOnly(sliced);
}

type Enriched = Customer & CustomerComputed;

type ActionItem = {
  id: string;
  itemType: "customer" | "prospect" | "consultant" | "hostess" | "lead" | "event_task";
  _eventTaskId?: string;
  _eventId?: string;
  name: string;
  phone: string | null;
  email: string | null;
  vip?: string;
  next_follow_up: string | null;
  follow_up_status: string;
  activity_status?: string;
  days_since_last_order?: number | null;
  opportunity_status?: string;
  new_follow_up_stage?: string | null;
  dormant_follow_up_stage?: string | null;
  birthday_mmdd?: string | null;
  birthday?: string | null;
  daysOverdue?: number | null;
  followUpReason?: string;
  lastNotePreview?: string;
  lastNextStep?: string;
  lastContacted?: string | null;
  actionLabel: string;
  allow_non_working_day?: boolean;
  // Extra customer fields for enhanced panel
  _address?: string | null;
  _relationship_status?: string | null;
  // Relationship event metadata (used by the Birthdays/Anniversaries section)
  _eventType?: "birthday" | "anniversary";
  _anniversaryYears?: number;
  _anniversaryDate?: string | null; // YYYY-MM-DD anchor (join_date)
};

type FollowUpSnapshot = {
  today: string[];
  upcoming: string[];
};

const getActionItemKey = (item: Pick<ActionItem, "itemType" | "id">) => `${item.itemType}:${item.id}`;

function parseFollowUpSnapshot(value: unknown): FollowUpSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  const normalize = (input: unknown) => Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === "string") : [];
  return {
    today: normalize(snapshot.today),
    upcoming: normalize(snapshot.upcoming),
  };
}

function parseBirthdayMMDD(mmdd: string | null): { month: number; day: number } | null {
  if (!mmdd) return null;
  const normalized = mmdd.trim();
  if (!normalized) return null;
  const monthNameMatch = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (monthNameMatch) {
    const month = MONTH_NAME_TO_NUMBER[monthNameMatch[1].toLowerCase()];
    const day = parseInt(monthNameMatch[2], 10);
    if (month && day >= 1 && day <= 31) return { month, day };
  }
  const isoLikeMatch = normalized.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
  if (isoLikeMatch) {
    const month = parseInt(isoLikeMatch[1], 10);
    const day = parseInt(isoLikeMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  const slashOrDashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (slashOrDashMatch) {
    const month = parseInt(slashOrDashMatch[1], 10);
    const day = parseInt(slashOrDashMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  const cleaned = normalized.replace(/\D/g, "");
  if (cleaned.length < 3) return null;
  const month = parseInt(cleaned.slice(0, cleaned.length === 3 ? 1 : 2), 10);
  const day = parseInt(cleaned.slice(cleaned.length === 3 ? 1 : 2), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function getBirthdayMonthDay(customer: { birthday?: string | null; birthday_mmdd?: string | null }): { month: number; day: number } | null {
  const fromMMDD = parseBirthdayMMDD(customer.birthday_mmdd ?? null);
  if (fromMMDD) return fromMMDD;
  if (customer.birthday) {
    const dateStr = customer.birthday.slice(0, 10);
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
    }
  }
  return null;
}

function daysToBirthday(customer: { birthday?: string | null; birthday_mmdd?: string | null }): number | null {
  const parsed = getBirthdayMonthDay(customer);
  if (!parsed) return null;
  const today = getLocalToday();
  const thisYearBday = new Date(today.getFullYear(), parsed.month - 1, parsed.day);
  thisYearBday.setHours(0, 0, 0, 0);
  const diff = Math.floor((thisYearBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  // Return negative for past birthdays (up to 30 days ago), 0 for today, positive for upcoming
  if (diff >= -30 && diff <= 365) return diff;
  // If birthday is >30 days ago this year, check next year
  if (diff < -30) {
    const nextYearBday = new Date(today.getFullYear() + 1, parsed.month - 1, parsed.day);
    nextYearBday.setHours(0, 0, 0, 0);
    return Math.floor((nextYearBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }
  return diff;
}

function formatBirthday(customer: { birthday?: string | null; birthday_mmdd?: string | null }): string {
  const parsed = getBirthdayMonthDay(customer);
  if (!parsed) return customer.birthday_mmdd || (customer.birthday ? formatDateOnly(customer.birthday, "MMM d") : "Birthday");
  return format(new Date(2000, parsed.month - 1, parsed.day), "MMMM dd");
}

function formatLastContacted(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = parseLocalDate(dateStr);
  const today = getLocalToday();
  const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}

const TYPE_BADGE: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  customer: { label: "Customer", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", icon: Users },
  prospect: { label: "Prospect", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", icon: Users },
  lead: { label: "Lead", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: CalendarCheck },
  consultant: { label: "Consultant", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", icon: Crown },
  hostess: { label: "Hostess", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: Crown },
  event_task: { label: "Event Task", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CalendarCheck },
};



async function logCustomerActivity({
  customerId,
  noteType,
  noteText,
  nextStep,
  nextFollowUpDate,
  isBookingAttempt,
  isFollowUp,
}: {
  customerId: string;
  noteType: string;
  noteText?: string;
  nextStep?: string;
  nextFollowUpDate?: string | null;
  isBookingAttempt?: boolean;
  isFollowUp?: boolean;
}) {
  const fallbackNote = `${noteType} follow-up completed`;
  const noteBody = noteText?.trim() || fallbackNote;
  // Derive intent category from the bracketed [Reason] prefix in the note body
  // (added by UniversalActionPanel.buildNote). Defaults to "Follow-Up".
  const reasonMatch = noteBody.match(/^\s*\[([^\]]+)\]/);
  const category = resolveIntentCategory(reasonMatch ? reasonMatch[1] : null);

  await Promise.all([
    createCustomerNote({ customer_id: customerId, note_text: noteBody, note_type: noteType }),
    createNote({
      entity_type: "Customer",
      customer_id: customerId,
      note_body: noteBody,
      note_type: noteType,
      tags: [categoryTag(category)],
      next_step: nextStep?.trim() || null,
      next_follow_up_date: nextFollowUpDate ?? null,
      is_booking_attempt: isBookingAttempt ?? false,
      is_follow_up: isFollowUp ?? true,
    }),
  ]);
}

// ─── Main Component ───

export default function FollowUps() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"today" | "upcoming">("today");

  // Data
  const { data: customers = [], isLoading: cLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [], isLoading: oLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: allNotes = [] } = useQuery({ queryKey: ["all-notes"], queryFn: fetchLatestNotes });
  const { data: prospects = [], isLoading: pLoading } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const { data: bookingLeads = [], isLoading: blLoading } = useQuery({ queryKey: ["booking-leads"], queryFn: fetchBookingLeads });
  const { data: consultants = [], isLoading: tcLoading } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const { data: events = [], isLoading: eLoading } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: unifiedNotes = [] } = useQuery({ queryKey: ["unified-notes"], queryFn: fetchAllLatestNotes });
  const { data: eventTasksRaw = [], isLoading: etLoading } = useQuery({ queryKey: ["event-tasks"], queryFn: fetchEventTasks });
  const { data: scheduleSettings, isLoading: ssLoading } = useQuery({ queryKey: ["schedule-settings"], queryFn: fetchScheduleSettings });
  const workdayFlags = buildWorkdayFlags(scheduleSettings);
  const isNonWorkday = isTodayNonWorkday(workdayFlags);

  // ─── Out of Office Mode ───
  // Active when today's date falls within the configured OOO window.
  const isOOOActive = useMemo(() => {
    if (!scheduleSettings?.ooo_start_date || !scheduleSettings?.ooo_end_date) return false;
    const today = toLocalDateKey();
    return today >= scheduleSettings.ooo_start_date && today <= scheduleSettings.ooo_end_date;
  }, [scheduleSettings]);

  // TRUE TIME FREEZE: while OOO is active, all follow-up status calculations use
  // the day BEFORE OOO started as "today". This ensures:
  //   • Overdue counts don't grow during OOO
  //   • Items scheduled mid-OOO stay in "Upcoming" (don't slide into Due Today)
  //   • No backlog accrues — when OOO ends, real today resumes naturally and only
  //     items already past-due at OOO start remain overdue (by their original delta).
  const frozenToday = useMemo(() => {
    if (!isOOOActive || !scheduleSettings?.ooo_start_date) return getLocalToday();
    // Anchor to the OOO start date itself so any item that was due on or before that day
    // remains in its original Today/Overdue bucket (no items get pushed forward or disappear).
    return parseLocalDate(scheduleSettings.ooo_start_date);
  }, [isOOOActive, scheduleSettings?.ooo_start_date]);
  const frozenTodayKey = useMemo(() => toLocalDateKey(frozenToday), [frozenToday]);
  const followUpSnapshot = useMemo(
    () => parseFollowUpSnapshot(scheduleSettings?.ooo_followup_snapshot),
    [scheduleSettings?.ooo_followup_snapshot]
  );

  // Override is session-only — resets on navigation away or refresh (component unmount).
  const [showFollowUpsOverride, setShowFollowUpsOverride] = useState(false);
  // When OOO is on AND override is off, hide workflow sections (follow-ups + team attention).
  // Birthdays (in Today's Schedule) and 6 Most Important always remain visible.
  const hideWorkflow = isOOOActive && !showFollowUpsOverride;
  // Ensures the "Ease Back In" rescheduling pass runs only once per OOO exit (per session).
  const easeBackInRanRef = useRef(false);
  useEffect(() => {
    if (isOOOActive) easeBackInRanRef.current = false; // reset for next exit
  }, [isOOOActive]);
  // Tracks per-day-per-category whether the overflow auto-distribute has already run,
  // so each unique (date, category) pass executes at most once per session and we don't loop on every render.
  const dailyLimitDistributedRef = useRef<Set<string>>(new Set());
  const { data: todayDeliveries = [] } = useQuery({
    queryKey: ["daily-plan", toLocalDateKey()],
    queryFn: async () => {
      const dateStr = toLocalDateKey();
      const { data, error } = await supabase
        .from("daily_plan_items" as any)
        .select("*")
        .eq("plan_date", dateStr)
        .eq("item_type", "delivery")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const isLoading = cLoading || oLoading || pLoading || blLoading || tcLoading || eLoading || etLoading || ssLoading;

  // Daily Scorecard removed — per-metric reach-out / booking / sharing aggregation no longer computed.
  // The 6 Most Important Things uses `focusAutoCounts` (below) sourced directly from `computeMetricsForDate`.


  // UI state
  const [showUpcoming7, setShowUpcoming7] = useState(false);

  // Relationship-touch completion tracking — persists in DB per user/person/year/event_type
  // so past birthdays AND anniversaries stay dismissed for the cycle.
  const currentBirthdayYear = new Date().getFullYear();
  const { data: completedBirthdayRows = [] } = useQuery({
    queryKey: ["completed-birthdays", currentBirthdayYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("completed_birthdays" as any)
        .select("person_id, event_type")
        .eq("birthday_year", currentBirthdayYear);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  // Migrate any legacy localStorage entries into the DB once
  useEffect(() => {
    const legacyKey = `bday-done-${currentBirthdayYear}`;
    try {
      const stored = localStorage.getItem(legacyKey);
      if (!stored) return;
      const ids: string[] = JSON.parse(stored);
      if (!Array.isArray(ids) || ids.length === 0) {
        localStorage.removeItem(legacyKey);
        return;
      }
      (async () => {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return;
        const rows = ids.map((person_id) => ({
          user_id: uid,
          person_id,
          person_type: "customer",
          birthday_year: currentBirthdayYear,
        }));
        await supabase.from("completed_birthdays" as any).upsert(rows, {
          onConflict: "user_id,person_id,birthday_year",
          ignoreDuplicates: true,
        });
        localStorage.removeItem(legacyKey);
        queryClient.invalidateQueries({ queryKey: ["completed-birthdays", currentBirthdayYear] });
      })();
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keys formatted as `${person_id}:${event_type}` so birthday + anniversary
  // for the same person are tracked independently for the cycle.
  const completedBirthdays = useMemo(
    () => new Set<string>((completedBirthdayRows as any[]).map((r) => `${r.person_id}:${r.event_type || "birthday"}`)),
    [completedBirthdayRows]
  );
  const isRelationshipDone = useCallback(
    (item: { id: string; _eventType?: "birthday" | "anniversary" }) =>
      completedBirthdays.has(`${item.id}:${item._eventType || "birthday"}`),
    [completedBirthdays]
  );
  // Birthday "Done" — atomic flow:
  //   1) Log a "Birthday Reach-Out" activity (relationship-building touch)
  //   2) Update last_contacted = today
  //   3) RESET next_follow_up_date = today + 75 days (override existing date)
  //   4) Priority override: if the existing follow-up is a HIGH-PRIORITY type
  //      (PCP reorder, booking ask, sample/post-appointment), keep it instead.
  //   5) Mark the birthday completed for the current cycle so it disappears.
  //
  // Birthday touches are relationship signals — not booking attempts and not
  // tagged as a generic follow-up.
  const BIRTHDAY_LONG_TERM_DAYS = 75;
  // Substrings (case-insensitive) on `follow_up_reason` that mark a follow-up
  // as higher-priority than a birthday touch and should NOT be overridden.
  const HIGH_PRIORITY_REASON_PATTERNS = [
    "booking ask",
    "booking",
    "reorder",      // PCP / product reorder cycles
    "pcp",
    "sample",
    "trial",
    "post-appointment",
    "post appointment",
    "appointment follow",
  ];
  const isHighPriorityReason = (reason?: string | null) => {
    if (!reason) return false;
    const r = reason.toLowerCase();
    return HIGH_PRIORITY_REASON_PATTERNS.some((p) => r.includes(p));
  };

  type RelationshipDoneArgs = {
    personId: string;
    personType: "customer" | "consultant";
    eventType: "birthday" | "anniversary";
    personName?: string;
    anniversaryYears?: number;
  };

  const markBirthdayDoneMutation = useMutation({
    // Optimistically mark the relationship touch as completed in the cache so the
    // person disappears from the Today birthday list IMMEDIATELY — no waiting for
    // the network round-trip or query invalidation. This also works during OOO,
    // where the person should never repopulate once the user has manually
    // dismissed the touch.
    onMutate: async ({ personId, personType, eventType }) => {
      const cacheKey = ["completed-birthdays", currentBirthdayYear];
      await queryClient.cancelQueries({ queryKey: cacheKey });
      const prev = queryClient.getQueryData<any[]>(cacheKey) || [];
      queryClient.setQueryData<any[]>(cacheKey, [
        ...prev,
        { person_id: personId, person_type: personType, event_type: eventType },
      ]);
      return { prev, cacheKey };
    },
    mutationFn: async ({ personId, personType, eventType, personName, anniversaryYears }: RelationshipDoneArgs) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const today = format(new Date(), "yyyy-MM-dd");
      const longTermDate = format(addDays(new Date(), BIRTHDAY_LONG_TERM_DAYS), "yyyy-MM-dd");

      const noteType = eventType === "anniversary" ? "Anniversary Reach-Out" : "Birthday Reach-Out";
      const noteBody = eventType === "anniversary"
        ? `Anniversary reach-out${anniversaryYears ? ` — year ${anniversaryYears}` : ""} — relationship building`
        : "Birthday reach-out — relationship building";

      // ── CONSULTANT branch (birthday or anniversary) ───────────────────────
      if (personType === "consultant") {
        // 1) Log activity (Consultant entity); failure aborts everything else.
        await createNote({
          entity_type: "Consultant",
          person_id: personId,
          person_type: "consultant",
          note_body: noteBody,
          note_type: noteType,
          is_booking_attempt: false,
          is_follow_up: false,
        });

        // 2) Mark completion for this cycle
        const { error } = await supabase
          .from("completed_birthdays" as any)
          .upsert(
            { user_id: uid, person_id: personId, person_type: "consultant", event_type: eventType, birthday_year: currentBirthdayYear },
            { onConflict: "user_id,person_id,birthday_year,event_type", ignoreDuplicates: true }
          );
        if (error) throw error;

        return { eventType, personType, nextDate: null as string | null, keepExisting: false, existingReason: null as string | null };
      }

      // ── CUSTOMER branch (birthday only — customers have no anniversary) ──
      const existing = customers.find((c) => c.id === personId);
      const existingNext = (existing?.next_follow_up_date as string | null | undefined) || null;
      const existingReason = (existing as any)?.follow_up_reason as string | null | undefined;

      const keepExisting =
        !!existingNext &&
        existingNext > today &&
        existingNext < longTermDate &&
        isHighPriorityReason(existingReason);
      const nextDate = keepExisting ? existingNext! : longTermDate;

      // 1) Log activity FIRST (atomic — if this fails nothing else runs)
      await createNote({
        entity_type: "Customer",
        customer_id: personId,
        person_id: personId,
        person_type: "customer",
        note_body: noteBody,
        note_type: noteType,
        next_follow_up_date: nextDate,
        is_booking_attempt: false,
        is_follow_up: false,
      });
      // Best-effort timeline mirror
      try {
        await createCustomerNote({
          customer_id: personId,
          note_text: noteBody,
          note_type: noteType,
        });
      } catch { /* non-critical */ }

      // 2 + 3) Update last_contacted and reset next_follow_up_date.
      const updates: Record<string, string | null> = {
        last_contacted: today,
        next_follow_up_date: nextDate,
      };
      if (!keepExisting) {
        updates.follow_up_reason = "Birthday touch — long-term cycle";
      }
      await updateCustomer(personId, updates as any);

      // 4) Mark birthday completed for this cycle
      const { error } = await supabase
        .from("completed_birthdays" as any)
        .upsert(
          { user_id: uid, person_id: personId, person_type: "customer", event_type: eventType, birthday_year: currentBirthdayYear },
          { onConflict: "user_id,person_id,birthday_year,event_type", ignoreDuplicates: true }
        );
      if (error) throw error;

      return { eventType, personType, nextDate, keepExisting, existingReason };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["completed-birthdays", currentBirthdayYear] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      const eventLabel = result?.eventType === "anniversary" ? "Anniversary" : "Birthday";
      let msg: string;
      if (result?.personType === "consultant") {
        msg = `${eventLabel} logged for consultant`;
      } else if (result?.keepExisting) {
        msg = `${eventLabel} logged — kept higher-priority follow-up (${result.existingReason}) on ${formatDateOnly(result.nextDate)}`;
      } else {
        msg = `${eventLabel} logged — next touch ${formatDateOnly(result?.nextDate || "")} (75-day cycle)`;
      }
      toast.success(msg);
    },
    onError: (e: any, _vars, context: any) => {
      // Roll back optimistic completion on hard failure.
      if (context?.prev && context?.cacheKey) {
        queryClient.setQueryData(context.cacheKey, context.prev);
      }
      toast.error(`Failed to log relationship touch: ${e?.message || "unknown error"}`);
    },
  });
  const markBirthdayDone = (item: ActionItem) => {
    markBirthdayDoneMutation.mutate({
      personId: item.id,
      personType: item.itemType === "consultant" ? "consultant" : "customer",
      eventType: item._eventType || "birthday",
      personName: item.name,
      anniversaryYears: item._anniversaryYears,
    });
  };
  // Universal Action Panel state
  const [universalPanelItem, setUniversalPanelItem] = useState<UniversalActionItem | null>(null);
  const [universalPanelOpen, setUniversalPanelOpen] = useState(false);
  // Tracks the source event when the Universal panel was opened from a Reschedule row.
  // When set, onLogAction routes through reschedule update logic instead of generic hostess flow.
  const [universalRescheduleEvent, setUniversalRescheduleEvent] = useState<EventRecord | null>(null);

  const openUniversalPanel = useCallback((item: ActionItem) => {
    // Build recent notes for this entity from unified notes
    const entityNotes = unifiedNotes
      .filter((n: any) => {
        if (item.itemType === "customer" && n.customer_id === item.id) return true;
        if (item.itemType === "prospect" && n.prospect_id === item.id) return true;
        if (item.itemType === "lead" && n.entity_type === "Lead" && n.note_body?.includes(item.name)) return true;
        if (item.itemType === "consultant" && n.entity_type === "Consultant" && n.note_body?.includes(item.name)) return true;
        if (item.itemType === "hostess" && n.entity_type === "Hostess" && n.note_body?.includes(item.name)) return true;
        return false;
      })
      .slice(0, 5)
      .map((n: any) => ({
        date: n.note_date ? formatDateOnly(n.note_date, "MMM d") : "",
        actionType: n.note_type || "Note",
        preview: (n.note_body || "").slice(0, 80),
      }));

    setUniversalPanelItem({
      id: item.id,
      personType: item.itemType,
      name: item.name,
      phone: item.phone,
      email: item.email,
      statusLabel: item.activity_status || item.opportunity_status,
      vip: item.vip,
      followUpReason: item.followUpReason,
      daysOverdue: item.daysOverdue,
      followUpStatus: item.follow_up_status,
      nextFollowUpDate: item.next_follow_up || null,
      recentNotes: entityNotes,
    });
    setUniversalPanelOpen(true);
  }, [unifiedNotes]);


  const [actionItem, setActionItem] = useState<ActionItem | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteNextStep, setNoteNextStep] = useState("");
  const [noteType, setNoteType] = useState("Call");
  const [followUpDate, setFollowUpDate] = useState("");
  const [inlineNoteId, setInlineNoteId] = useState<string | null>(null);
  const [inlineNoteText, setInlineNoteText] = useState("");
  const [inlineNextStep, setInlineNextStep] = useState("");
  const [inlineNoteType, setInlineNoteType] = useState("Call");
  const [inlineFollowUpDate, setInlineFollowUpDate] = useState("");
  const [detailItem, setDetailItem] = useState<ActionItem | null>(null);
  const [detailNoteText, setDetailNoteText] = useState("");
  const [detailNextStep, setDetailNextStep] = useState("");
  const [detailNoteType, setDetailNoteType] = useState("Call");
  const [detailFollowUpDate, setDetailFollowUpDate] = useState("");
  const [showDistribute, setShowDistribute] = useState(false);
  const [distributeDays, setDistributeDays] = useState("60");
  const [distributeFilter, setDistributeFilter] = useState<"overdue-today" | "no-date" | "dormant-warm">("overdue-today");
  const [distributeSelectedIds, setDistributeSelectedIds] = useState<Set<string>>(new Set());
  const [distributeStep, setDistributeStep] = useState<"configure" | "preview">("configure");

  // ─── Fresh Start (manual backlog reset) ───
  // Reschedules ALL current Today/Overdue follow-ups forward and staggers them across
  // the chosen window so the user can recover from a backlog flood without losing data.
  const [showFreshStart, setShowFreshStart] = useState(false);
  const [freshStartDays, setFreshStartDays] = useState<"7" | "14" | "30">("14");
  const [freshStartUndo, setFreshStartUndo] = useState<Array<{
    itemType: string;
    id: string;
    previousDate: string | null;
    eventTaskId?: string;
  }> | null>(null);

  const [scheduleDelivery, setScheduleDelivery] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(toLocalDateKey(addDays(new Date(), 1)));
  const [deliveryNotes, setDeliveryNotes] = useState("");

   // ─── Auto-counts for 6 Most Important Things ───
   const focusAutoCounts = useMemo(() => {
      const todayKey = toLocalDateKey();

       const metrics = computeMetricsForDate(todayKey, {
         unifiedNotes,
         allNotes,
         customers,
         prospects,
         bookingLeads,
         consultants,
         events,
       });

       const booking_attempts = metrics.bookingAttempts;
       const client_followup = metrics.clientFollowUpDetails.length;
       const customer_followup = metrics.customerFollowUpDetails.length;
       const lead_followup = metrics.leadFollowUpDetails.length;
       const hostess_coaching = metrics.hostessCoachingDetails.length;
       const recruiting_followup = metrics.recruitingFollowUpDetails.length;
       const consultant_coaching = metrics.coachingDetails.length;
       const relationship = metrics.relationshipDetails.length;

       return { booking_attempts, customer_followup, lead_followup, client_followup, hostess_coaching, recruiting_followup, consultant_coaching, relationship };
    }, [unifiedNotes, prospects, events, allNotes, bookingLeads, customers, consultants]);

  // Mobile detection
  const isMobile = useIsMobile();

  // Relationship Touches collapsed state
  const [touchesOpen, setTouchesOpen] = useState(false);

  // Reschedule workflow state
  const [rescheduleActivityEvent, setRescheduleActivityEvent] = useState<EventRecord | null>(null);
  const [rescheduleNoteText, setRescheduleNoteText] = useState("");
  const [rescheduleNoteType, setRescheduleNoteType] = useState("Call");
  const [rescheduleStep, setRescheduleStep] = useState<"log" | "confirm">("log");
  const [rescheduleNewDate, setRescheduleNewDate] = useState<string | null>(null);
  const [setNewDateEvent, setSetNewDateEvent] = useState<EventRecord | null>(null);
  const [newEventDate, setNewEventDate] = useState("");
  const [manualNextStepEvent, setManualNextStepEvent] = useState<EventRecord | null>(null);

  const notesByCustomer = useMemo(() => {
    const map = new Map<string, CustomerNote>();
    for (const n of allNotes) { if (!map.has(n.customer_id)) map.set(n.customer_id, n); }
    return map;
  }, [allNotes]);

  // Map latest unified note (with next_step) per customer
  const unifiedNotesByCustomer = useMemo(() => {
    const map = new Map<string, { note_body: string; next_step: string | null }>();
    for (const n of unifiedNotes) {
      if (n.entity_type === "Customer" && n.customer_id && !map.has(n.customer_id)) {
        map.set(n.customer_id, { note_body: (n as any).note_body || "", next_step: (n as any).next_step || null });
      }
    }
    return map;
  }, [unifiedNotes]);

  const enrichedCustomers = useMemo(() => {
    // During Out of Office, anchor all time-based customer derivations to the frozen date.
    // This prevents activity-status drift, days-since-last-order growth, and auto follow-up
    // dates from sliding into the past while the user is away.
    return customers
      .filter((c) => c.is_active !== false && c.relationship_status !== "Consultant")
      .filter((c) => !(Array.isArray((c as any).tags) && (c as any).tags.includes("DNC")))
      .map((c) => {
        const custOrders = allOrders.filter((o) => o.customer_id === c.id);
        const computed = computeCustomerFields(c, custOrders, isOOOActive ? frozenToday : undefined);
        return { ...c, ...computed };
      });
  }, [customers, allOrders, isOOOActive, frozenToday]);

  const customerDncSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of customers) {
      if (Array.isArray((c as any).tags) && (c as any).tags.includes("DNC")) s.add(c.id);
    }
    return s;
  }, [customers]);

  // Detail sheet queries
  const { data: detailNotes = [] } = useQuery({
    queryKey: ["customer-notes", detailItem?.id],
    queryFn: () => fetchCustomerNotes(detailItem!.id),
    enabled: !!detailItem && detailItem.itemType === "customer",
  });
  const { data: detailProspectNotes = [] } = useQuery({
    queryKey: ["prospect-notes", detailItem?.id],
    queryFn: () => fetchProspectNotes(detailItem!.id),
    enabled: !!detailItem && detailItem.itemType === "prospect",
  });

  // ─── Build unified action items ───
  const { todayActions, upcomingActions, todayEvents, upcomingEvents, reschedulingFollowUp, birthdaysToday, birthdaysOverdue, birthdaysUpcoming } = useMemo(() => {
    // When OOO is active, freeze "today" to the day before OOO started so follow-up
    // timers do not progress (no new overdue, no new due-today, no backlog).
    const todayDate = frozenToday;
    const todayKey = frozenTodayKey;
    const upcoming7Key = toLocalDateKey(addDays(todayDate, 7));

    // Customer items
    const customerItems: ActionItem[] = enrichedCustomers.map((c) => {
      const effectiveFollowUp = normalizeFollowUpDate(c.next_follow_up_date) || normalizeFollowUpDate(c.next_follow_up);
      const followUpStatus = getFollowUpStatus(effectiveFollowUp, todayKey) || c.follow_up_status;
      const daysOverdue = followUpStatus === "OVERDUE" ? getDaysOverdue(effectiveFollowUp, todayDate) : null;
      const lastNote = notesByCustomer.get(c.id);
      const notePreview = lastNote
        ? `${lastNote.note_type}: ${lastNote.note_text.slice(0, 60)}${lastNote.note_text.length > 60 ? "…" : ""}`
        : undefined;
      const unifiedNote = unifiedNotesByCustomer.get(c.id);
      const lastNextStep = unifiedNote?.next_step || null;
      const fullAddress = [c.address_line_1, c.address_line_2, [c.city, c.state_territory, c.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return {
        id: c.id, itemType: "customer" as const, name: c.full_name,
        phone: c.phone, email: c.email, vip: c.vip,
        next_follow_up: effectiveFollowUp, follow_up_status: followUpStatus,
        activity_status: c.activity_status, days_since_last_order: c.days_since_last_order,
        new_follow_up_stage: c.new_follow_up_stage,
        dormant_follow_up_stage: (c as any).dormant_follow_up_stage || null,
        birthday_mmdd: c.birthday_mmdd,
        birthday: c.birthday, daysOverdue,
        followUpReason: c.follow_up_reason || "Customer Follow-Up",
        lastNotePreview: notePreview, lastNextStep: lastNextStep || undefined, lastContacted: c.last_contacted,
        actionLabel: "Follow-up",
        allow_non_working_day: !!(c as any).allow_non_working_day,
        _address: fullAddress || null,
        _relationship_status: c.relationship_status,
      };
    });

    // Prospect items
    const prospectItems: ActionItem[] = prospects
      .filter((p) => !(p.customer_id && customerDncSet.has(p.customer_id)))
      .filter((p) => normalizeFollowUpDate(p.next_step_date || p.next_follow_up_date) && !["Not Interested", "Joined", "Converted", "Closed"].includes(p.opportunity_status))
      .map((p) => {
        const effectiveFollowUp = normalizeFollowUpDate(p.next_step_date) || normalizeFollowUpDate(p.next_follow_up_date);
        const status = getFollowUpStatus(effectiveFollowUp, todayKey) || "UPCOMING";
        const daysOverdue = status === "OVERDUE" ? getDaysOverdue(effectiveFollowUp, todayDate) : null;
        return {
          id: p.id, itemType: "prospect" as const, name: p.name,
          phone: p.phone, email: p.email,
          next_follow_up: effectiveFollowUp, follow_up_status: status,
          opportunity_status: p.opportunity_status, daysOverdue,
          followUpReason: p.next_step_type || `Prospect - ${p.opportunity_status}`,
          lastContacted: p.last_contact_date,
          actionLabel: p.next_step_type || "Next Step",
          allow_non_working_day: !!(p as any).allow_non_working_day,
        };
      });

    // Consultant items
    const consultantItems: ActionItem[] = consultants
      .filter((c) => normalizeFollowUpDate(c.next_coaching_date))
      .map((c) => {
        const effectiveDate = normalizeFollowUpDate(c.next_coaching_date);
        const status = getFollowUpStatus(effectiveDate, todayKey) || "UPCOMING";
        const daysOverdue = status === "OVERDUE" ? getDaysOverdue(effectiveDate, todayDate) : null;
        // Find last contact date from unified notes
        const lastConsultantNote = unifiedNotes.find((n: any) => n.entity_type === "Consultant" && n.note_body?.includes(c.name));
        return {
          id: c.id, itemType: "consultant" as const, name: c.name,
          phone: c.phone, email: c.email,
          next_follow_up: effectiveDate, follow_up_status: status,
          daysOverdue,
          followUpReason: (c as any).coaching_focus || "Coaching",
          lastContacted: lastConsultantNote?.note_date || null,
          actionLabel: "Coaching",
          allow_non_working_day: !!(c as any).allow_non_working_day,
        };
      });

    // Hostess coaching items (from events with hostess_next_action_date)
    // EXCLUDE events that are in rescheduling flow — those appear in the separate reschedule section
    const hostessItems: ActionItem[] = events
      .filter((e) => {
        if (e.is_archived || !e.hostess_name || !(e as any).hostess_next_action_date) return false;
        const reschedule = e.reschedule_status || "None";
        if (reschedule === "In Process of Rescheduling" || e.event_status === "Cancelled") return false;
        return true;
      })
      .map((e) => {
        const effectiveDate = normalizeFollowUpDate((e as any).hostess_next_action_date);
        const status = getFollowUpStatus(effectiveDate, todayKey) || "UPCOMING";
        const daysOverdue = status === "OVERDUE" ? getDaysOverdue(effectiveDate, todayDate) : null;
        // Find last contact date from unified notes
        const lastHostessNote = unifiedNotes.find((n: any) => n.entity_type === "Hostess" && n.note_body?.includes(e.hostess_name!));
        return {
          id: e.id, itemType: "hostess" as const, name: e.hostess_name!,
          phone: e.hostess_phone, email: e.hostess_email,
          next_follow_up: effectiveDate, follow_up_status: status,
          daysOverdue,
          followUpReason: (e as any).hostess_next_action || "Hostess Coaching",
          lastContacted: lastHostessNote?.note_date || null,
          actionLabel: "Hostess Coaching",
          allow_non_working_day: !!(e as any).allow_non_working_day,
        };
      });

    // Booking lead items (converted to ActionItems)
    const leadItems: ActionItem[] = bookingLeads
      .filter((lead) => !(lead.converted_customer_id && customerDncSet.has(lead.converted_customer_id)))
      .filter((lead) => lead.status !== "Not Interested" && !lead.converted_customer_id && normalizeFollowUpDate(lead.next_follow_up_date))
      .map((lead) => {
        const effectiveDate = normalizeFollowUpDate(lead.next_follow_up_date);
        const status = getFollowUpStatus(effectiveDate, todayKey) || "UPCOMING";
        const daysOverdue = status === "OVERDUE" ? getDaysOverdue(effectiveDate, todayDate) : null;
        return {
          id: lead.id, itemType: "lead" as const, name: lead.name,
          phone: lead.phone, email: lead.email,
          next_follow_up: effectiveDate, follow_up_status: status,
          daysOverdue,
          followUpReason: lead.lead_source ? `Booking Lead - ${lead.lead_source}` : "Booking Follow-Up",
          lastContacted: lead.last_contact_date,
          actionLabel: "Booking Follow-Up",
          allow_non_working_day: !!(lead as any).allow_non_working_day,
        };
      });

    // Event workflow tasks (incomplete, with due dates)
    const eventTaskItems: ActionItem[] = (eventTasksRaw as EventTask[])
      .filter((t) => !t.is_completed && t.due_date)
      .map((t) => {
        const matchedEvent = events.find((e) => e.event_id === t.event_id);
        const effectiveDate = normalizeFollowUpDate(t.due_date);
        const status = getFollowUpStatus(effectiveDate, todayKey) || "UPCOMING";
        const daysOverdue = status === "OVERDUE" ? getDaysOverdue(effectiveDate, todayDate) : null;
        // Build a clear display name: "Hostess Name — Task (Event Type M/D)"
        const hostessName = matchedEvent?.hostess_name || "Hostess";
        const eventDateFormatted = matchedEvent?.event_date
          ? (() => { const d = parseLocalDate(matchedEvent.event_date); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ""; })()
          : "";
        const eventTypeLabel = matchedEvent?.event_type || "Event";
        const displayName = `${hostessName}`;
        const taskDetail = eventDateFormatted
          ? `${t.task_name} (${eventTypeLabel} ${eventDateFormatted})`
          : t.task_name;
        return {
          id: t.id, itemType: "event_task" as const,
          name: displayName,
          phone: matchedEvent?.hostess_phone || null, email: matchedEvent?.hostess_email || null,
          next_follow_up: effectiveDate, follow_up_status: status,
          daysOverdue,
          followUpReason: taskDetail,
          lastContacted: null,
          actionLabel: "Hostess Coaching",
          allow_non_working_day: !!(t as any).allow_non_working_day,
          _eventTaskId: t.id,
          _eventId: t.event_id,
        };
      });

    const allItems = [...customerItems, ...prospectItems, ...consultantItems, ...hostessItems, ...leadItems, ...eventTaskItems];
    const sortItems = (items: ActionItem[]) => items.sort((a, b) => {
      // Overdue first, then today
      const aOverdue = a.follow_up_status === "OVERDUE" ? 0 : 1;
      const bOverdue = b.follow_up_status === "OVERDUE" ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const aDate = getDateOnlyTime(a.next_follow_up) ?? Number.MAX_SAFE_INTEGER;
      const bDate = getDateOnlyTime(b.next_follow_up) ?? Number.MAX_SAFE_INTEGER;
      if (aDate !== bDate) return aDate - bDate;
      return a.name.localeCompare(b.name);
    });

    const todayActions = sortItems(allItems.filter((item) => {
      if (!item.next_follow_up || !isDueTodayOrEarlier(item.next_follow_up, todayKey)) return false;
      // Non-working days: still show all already-due/overdue work. We just don't
      // auto-generate new tasks elsewhere — existing scheduled items remain visible.
      return true;
    }));

    const upcomingActions = sortItems(allItems.filter((item) => {
      if (!item.next_follow_up) return false;
      const normalized = normalizeDateOnly(item.next_follow_up);
      if (!normalized) return false;
      return normalized > todayKey && normalized <= upcoming7Key;
    }));

    // Events — only show active events (Booked + Reschedule=None + today)
    const todayEvents = events.filter((e) => {
      if (!e.event_date || e.is_archived) return false;
      if (normalizeDateOnly(e.event_date) !== todayKey) return false;
      if (e.event_status !== "Booked") return false;
      const reschedule = e.reschedule_status || "None";
      if (reschedule !== "None") return false;
      return true;
    });

    // Rescheduling follow-up: events needing rebooking attention.
    // Only surface in Today when the next reschedule follow-up is due (≤ today)
    // OR there is no scheduled date yet OR a manual next step is required.
    // This ensures that if the user pushes the date forward, the task clears.
    const reschedulingFollowUp = events.filter((e) => {
      if (e.is_archived) return false;
      const reschedule = e.reschedule_status || "None";
      const isReschedule = reschedule === "In Process of Rescheduling" || e.event_status === "Cancelled";
      if (!isReschedule) return false;
      if (e.requires_manual_next_step) return true;
      const fu = e.reschedule_next_follow_up_date;
      if (!fu) return true;
      return fu <= todayKey;
    }).sort((a, b) => {
      // Due today/overdue first
      const aDate = a.reschedule_next_follow_up_date || "9999";
      const bDate = b.reschedule_next_follow_up_date || "9999";
      return aDate.localeCompare(bDate);
    });

    const upcomingEvents = events.filter((e) => {
      if (!e.event_date || e.is_archived) return false;
      if (e.event_status !== "Booked") return false;
      const reschedule = e.reschedule_status || "None";
      if (reschedule !== "None") return false;
      const normalized = normalizeDateOnly(e.event_date);
      return normalized && normalized > todayKey && normalized! <= upcoming7Key;
    }).sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));

    // Relationship touches: customer birthdays + consultant birthdays + consultant anniversaries.
    // Includes overdue (past) events up to 30 days back, today, and upcoming 7d.
    const birthdaysToday: (ActionItem & { _daysUntil?: number })[] = [];
    const birthdaysOverdue: (ActionItem & { _daysUntil: number })[] = [];
    const birthdaysUpcoming: (ActionItem & { _daysUntil: number })[] = [];

    const pushByOffset = (item: ActionItem & { _daysUntil?: number }, days: number) => {
      if (days === 0) birthdaysToday.push({ ...item, _daysUntil: 0 });
      else if (days < 0 && days >= -30) birthdaysOverdue.push({ ...item, _daysUntil: days });
      else if (days > 0 && days <= 7) birthdaysUpcoming.push({ ...item, _daysUntil: days });
    };

    // Customer birthdays
    for (const c of customerItems) {
      const days = daysToBirthday({ birthday: c.birthday, birthday_mmdd: c.birthday_mmdd });
      if (days === null) continue;
      pushByOffset({ ...c, _eventType: "birthday" }, days);
    }

    // Consultant birthdays + anniversaries — iterate ALL consultants, not just
    // those with a coaching date. Anniversaries are based on join_date (start date).
    const todayYear = new Date().getFullYear();
    for (const tc of consultants) {
      if (tc.status === "Inactive") continue;
      const baseItem: ActionItem = {
        id: tc.id,
        itemType: "consultant" as const,
        name: tc.name,
        phone: tc.phone || null,
        email: tc.email || null,
        next_follow_up: null,
        follow_up_status: "",
        followUpReason: "Relationship Touch",
        lastContacted: null,
        actionLabel: "Relationship",
        allow_non_working_day: !!(tc as any).allow_non_working_day,
        birthday: tc.birthday || null,
      };

      // Birthday
      if (tc.birthday) {
        const days = daysToBirthday({ birthday: tc.birthday });
        if (days !== null) {
          pushByOffset({ ...baseItem, _eventType: "birthday" }, days);
        }
      }

      // Anniversary (yearly recurrence of join_date)
      if (tc.join_date) {
        const joinParts = tc.join_date.slice(0, 10).split("-");
        if (joinParts.length === 3) {
          const joinYear = parseInt(joinParts[0], 10);
          const joinMonth = parseInt(joinParts[1], 10);
          const joinDay = parseInt(joinParts[2], 10);
          if (joinYear && joinMonth >= 1 && joinMonth <= 12 && joinDay >= 1 && joinDay <= 31) {
            // Skip the same calendar year they joined (no 0-year anniversary)
            if (todayYear > joinYear) {
              // Reuse daysToBirthday-style logic by passing as YYYY-MM-DD synth
              const days = daysToBirthday({
                birthday: `${joinYear}-${String(joinMonth).padStart(2, "0")}-${String(joinDay).padStart(2, "0")}`,
              });
              if (days !== null) {
                const years = todayYear - joinYear;
                pushByOffset(
                  { ...baseItem, _eventType: "anniversary", _anniversaryYears: years, _anniversaryDate: tc.join_date },
                  days
                );
              }
            }
          }
        }
      }
    }
    birthdaysOverdue.sort((a, b) => b._daysUntil - a._daysUntil); // most recent first
    birthdaysUpcoming.sort((a, b) => a._daysUntil - b._daysUntil);

    const liveTodayActions = todayActions;
    const liveUpcomingActions = upcomingActions;

    if (isOOOActive && followUpSnapshot) {
      // OOO snapshot pinning + manual-action override:
      //   • The snapshot pins WHICH items are visible at OOO start (no auto-backlog growth).
      //   • Manual actions during OOO push next_follow_up_date forward. We honor those
      //     by checking the item's CURRENT next_follow_up against the frozen-today key —
      //     if the user pushed it past today, it drops out of the frozen Today list.
      //   • CRITICAL: We do NOT intersect with the live Today/Upcoming sets, because
      //     those re-derive membership from many factors (stage, status, ordering)
      //     under frozen time and can spuriously drop items that should remain pinned.
      //     The snapshot is the source of truth; manual reschedule is the only override.
      const itemMap = new Map(allItems.map((item) => [getActionItemKey(item), item]));
      const frozenKey = frozenTodayKey;

      const stillPinnedToday = (item: ActionItem) => {
        const next = item.next_follow_up;
        // No date set (e.g., team consultant with no coaching date cleared) — keep pinned.
        if (!next) return true;
        // Item still due on or before frozen-today (i.e., not pushed forward by manual action).
        return next <= frozenKey;
      };

      const frozenTodayActions = followUpSnapshot.today
        .map((key) => itemMap.get(key))
        .filter((item): item is ActionItem => Boolean(item))
        .filter(stillPinnedToday);

      const frozenUpcomingActions = followUpSnapshot.upcoming
        .map((key) => itemMap.get(key))
        .filter((item): item is ActionItem => Boolean(item));

      return {
        todayActions: sortItems(frozenTodayActions),
        upcomingActions: sortItems(frozenUpcomingActions),
        todayEvents,
        upcomingEvents,
        reschedulingFollowUp,
        birthdaysToday,
        birthdaysUpcoming,
        birthdaysOverdue,
      };
    }

    return {
      todayActions: liveTodayActions,
      upcomingActions: liveUpcomingActions,
      todayEvents,
      upcomingEvents,
      reschedulingFollowUp,
      birthdaysToday,
      birthdaysOverdue,
      birthdaysUpcoming,
    };
  }, [enrichedCustomers, prospects, consultants, events, notesByCustomer, bookingLeads, eventTasksRaw, isNonWorkday, frozenToday, frozenTodayKey, isOOOActive, followUpSnapshot, customerDncSet]);

  useEffect(() => {
    const activeStartDate = scheduleSettings?.ooo_start_date || null;
    const snapshotIsCurrent = !!followUpSnapshot && scheduleSettings?.ooo_followup_frozen_on === activeStartDate;

    if (isLoading) return;

    if (isOOOActive && activeStartDate && !snapshotIsCurrent) {
      void upsertScheduleSettings({
        ooo_followup_snapshot: {
          today: todayActions.map(getActionItemKey),
          upcoming: upcomingActions.map(getActionItemKey),
        },
        ooo_followup_frozen_on: activeStartDate,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["schedule-settings"] });
      });
      return;
    }

    if (!isOOOActive && (scheduleSettings?.ooo_followup_snapshot || scheduleSettings?.ooo_followup_frozen_on)) {
      // ─── EASE BACK IN ───────────────────────────────────────────────────────
      // OOO just ended. Without this pass, every item that became overdue during
      // OOO would dump into Today (e.g. 131 items). We instead:
      //   • Keep the most-overdue ~25 items in Today (they're already "due now").
      //   • Spread everything else across the next workdays at 8 per day.
      //   • Update each entity's next_follow_up_date so future renders match.
      //
      // Guarded by easeBackInRanRef so the pass runs once per OOO exit.
      if (easeBackInRanRef.current) return;
      easeBackInRanRef.current = true;

      const TODAY_CAP = 25;
      const PER_DAY = 8;
      const todayKey = toLocalDateKey();

      // Items currently overdue OR due-today (the flood we want to ease).
      const flooded = todayActions.filter(
        (i) => i.follow_up_status === "OVERDUE" || i.follow_up_status === "TODAY"
      );

      // Sort: most overdue first → keep them in Today.
      const sorted = [...flooded].sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
      const keepInToday = sorted.slice(0, TODAY_CAP);
      const toReschedule = sorted.slice(TODAY_CAP);

      const runEaseBackIn = async () => {
        if (toReschedule.length > 0) {
          // Spread tomorrow → forward, max PER_DAY per workday.
          const tomorrow = toLocalDateKey(addDays(new Date(), 1));
          const seedDates = toReschedule.map(() => tomorrow);
          // OOO has just ended, so we don't need to skip any OOO range when spreading.
          const blackout = new Set<string>(); // custom blackouts not loaded here; safe default
          const newDates = spreadTasks(seedDates, PER_DAY, null, blackout, workdayFlags);

          // Apply per-entity updates in parallel.
          await Promise.allSettled(
            toReschedule.map((item, idx) => {
              const newDate = newDates[idx];
              switch (item.itemType) {
                case "customer":
                  return updateCustomer(item.id, { next_follow_up_date: newDate } as any);
                case "lead":
                  return updateBookingLead(item.id, { next_follow_up_date: newDate } as any);
                case "prospect":
                  return updateProspect(item.id, { next_follow_up_date: newDate } as any);
                case "consultant":
                  return updateTeamConsultant(item.id, { next_coaching_date: newDate } as any);
                case "hostess":
                  return updateEvent(item.id, { hostess_next_action_date: newDate } as any);
                case "event_task":
                  return supabase.from("event_tasks").update({ due_date: newDate }).eq("id", item._eventTaskId || item.id);
                default:
                  return Promise.resolve();
              }
            })
          );
        }

        await upsertScheduleSettings({
          ooo_followup_snapshot: null,
          ooo_followup_frozen_on: null,
        });

        queryClient.invalidateQueries({ queryKey: ["schedule-settings"] });
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["prospects"] });
        queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
        queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
        queryClient.invalidateQueries({ queryKey: ["events"] });
        queryClient.invalidateQueries({ queryKey: ["event-tasks"] });

        if (toReschedule.length > 0) {
          toast.success(
            `Welcome back! Today shows ${keepInToday.length} priority follow-ups; ${toReschedule.length} more spread across upcoming workdays.`,
            { duration: 8000 }
          );
        }
      };

      void runEaseBackIn();
    }
  }, [
    isLoading,
    isOOOActive,
    scheduleSettings?.ooo_start_date,
    scheduleSettings?.ooo_end_date,
    scheduleSettings?.ooo_followup_snapshot,
    scheduleSettings?.ooo_followup_frozen_on,
    followUpSnapshot,
    todayActions,
    upcomingActions,
    queryClient,
    workdayFlags,
  ]);

  // ─── Daily Follow-Up Limit Auto-Distribution ─────────────────────────────────
  // For Customer and Lead categories, if the number of items currently visible in
  // Today exceeds the user's per-day cap, push the lowest-priority overflow forward
  // across upcoming workdays (each category distributed independently). Runs at most
  // once per (date, category) per session to avoid loops; user actions invalidate
  // queries which give us a fresh chance on the next pass.
  useEffect(() => {
    if (isLoading) return;
    if (isOOOActive) return; // OOO has its own ease-back-in flow
    if (!scheduleSettings) return;

    const todayKey = toLocalDateKey();
    const customerLimit = Math.max(1, Number(scheduleSettings.daily_customer_followup_limit ?? 10));
    const leadLimit = Math.max(1, Number(scheduleSettings.daily_lead_followup_limit ?? 10));

    const runForCategory = async (
      category: "customer" | "lead",
      limit: number,
      items: ActionItem[],
    ) => {
      if (items.length <= limit) return;
      const memoKey = `${todayKey}:${category}`;
      if (dailyLimitDistributedRef.current.has(memoKey)) return;
      dailyLimitDistributedRef.current.add(memoKey);

      // Sort: most overdue first → keep them in Today; least overdue → push forward.
      const sorted = [...items].sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
      const toPush = sorted.slice(limit);
      if (toPush.length === 0) return;

      const tomorrow = toLocalDateKey(addDays(new Date(), 1));
      const seedDates = toPush.map(() => tomorrow);
      const blackout = new Set<string>();
      const newDates = spreadTasks(seedDates, limit, null, blackout, workdayFlags);

      await Promise.allSettled(
        toPush.map((item, idx) => {
          const newDate = newDates[idx];
          if (category === "customer") {
            return updateCustomer(item.id, { next_follow_up_date: newDate } as any);
          }
          return updateBookingLead(item.id, { next_follow_up_date: newDate } as any);
        })
      );

      queryClient.invalidateQueries({ queryKey: category === "customer" ? ["customers"] : ["booking-leads"] });
    };

    const customerItems = todayActions.filter((i) => i.itemType === "customer");
    const leadItems = todayActions.filter((i) => i.itemType === "lead");
    void runForCategory("customer", customerLimit, customerItems);
    void runForCategory("lead", leadLimit, leadItems);
  }, [
    isLoading,
    isOOOActive,
    scheduleSettings,
    todayActions,
    workdayFlags,
    queryClient,
  ]);


  const distributeCandidates = useMemo(() => {
    switch (distributeFilter) {
      case "overdue-today": return enrichedCustomers.filter((c) => c.follow_up_status === "OVERDUE" || c.follow_up_status === "TODAY");
      case "no-date": return enrichedCustomers.filter((c) => !c.next_follow_up);
      case "dormant-warm": return enrichedCustomers.filter((c) => c.activity_status === "Dormant" || c.activity_status === "Warm");
      default: return [];
    }
  }, [enrichedCustomers, distributeFilter]);

  const MAX_PER_DAY = 10;
  const distributePreview = useMemo(() => {
    const maxDays = Math.max(1, parseInt(distributeDays) || 60);
    const selected = distributeCandidates
      .filter((c) => distributeSelectedIds.has(c.id))
      .sort((a, b) => {
        const aDate = a.next_follow_up ? parseLocalDate(a.next_follow_up).getTime() : Infinity;
        const bDate = b.next_follow_up ? parseLocalDate(b.next_follow_up).getTime() : Infinity;
        return aDate - bDate;
      });
    const tomorrow = addDays(new Date(), 1);
    const daysNeeded = Math.max(maxDays, Math.ceil(selected.length / MAX_PER_DAY));
    return selected.map((c, i) => ({ id: c.id, name: c.full_name, date: format(addDays(tomorrow, i % daysNeeded), "yyyy-MM-dd") }));
  }, [distributeCandidates, distributeSelectedIds, distributeDays]);

  const perDay = useMemo(() => {
    const maxDays = Math.max(1, parseInt(distributeDays) || 60);
    const count = distributeSelectedIds.size;
    const daysNeeded = Math.max(maxDays, Math.ceil(count / MAX_PER_DAY));
    return Math.ceil(count / daysNeeded);
  }, [distributeSelectedIds, distributeDays]);

  // ─── Mutations ───
  const bookingLeadContactMut = useMutation({
    mutationFn: async (lead: BookingLead) => {
      await updateBookingLead(lead.id, { last_contact_date: toLocalDateKey(), status: lead.status === "New" ? "Contacted" : lead.status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      toast.success("Lead marked as contacted");
    },
  });

  const contactMutation = useMutation({
    mutationFn: async ({ item, note, nextStep, type, nextDate, isBookingAttempt, isFollowUp }: { item: ActionItem; note: string; nextStep?: string; type: string; nextDate?: string; isBookingAttempt?: boolean; isFollowUp?: boolean }) => {
      const today = toLocalDateKey();
      if (item.itemType === "customer") {
        const updates: Record<string, string | null> = { last_contacted: today };
        // Always update next_follow_up_date: set it to the new date or clear it
        updates.next_follow_up_date = nextDate || null;
        await updateCustomer(item.id, updates as any);
        await logCustomerActivity({ customerId: item.id, noteType: type, noteText: note, nextStep, nextFollowUpDate: nextDate ?? null, isBookingAttempt: isBookingAttempt ?? false, isFollowUp: isFollowUp ?? true });
      } else if (item.itemType === "prospect") {
        const updates: Record<string, string | null> = { last_contact_date: today };
        updates.next_follow_up_date = nextDate || null;
        await updateProspect(item.id, updates as any);
        if (note.trim()) await createProspectNote({ prospect_id: item.id, note_text: note.trim() });
        const pBody = note.trim() || `${type} follow-up`;
        const pReason = pBody.match(/^\s*\[([^\]]+)\]/)?.[1] || null;
        const pCategory = resolveIntentCategory(pReason || "Recruiting Follow-Up");
        await createNote({ entity_type: "Prospect", prospect_id: item.id, note_body: pBody, note_type: type, tags: [categoryTag(pCategory)], next_step: nextStep?.trim() || null, next_follow_up_date: nextDate ?? null, is_booking_attempt: isBookingAttempt ?? false, is_follow_up: isFollowUp ?? true });
      } else if (item.itemType === "consultant") {
        const updates: Record<string, string | null> = {};
        if (nextDate) updates.next_coaching_date = nextDate;
        await updateTeamConsultant(item.id, updates as any);
        const consultantNoteBody = note.trim()
          ? `[${item.name}] ${note.trim()}`
          : `[${item.name}] ${type} coaching`;
        await createNote({
          entity_type: "Consultant",
          person_type: "consultant",
          person_id: item.id,
          tags: ["consultant_coaching", categoryTag("Team Building")],
          note_body: consultantNoteBody,
          note_type: type,
          next_step: nextStep?.trim() || null,
          next_follow_up_date: nextDate ?? null,
          is_booking_attempt: false,
          is_follow_up: false,
        });
      } else if (item.itemType === "hostess") {
        const updates: Record<string, string | null> = {};
        if (nextDate) updates.hostess_next_action_date = nextDate;
        await updateEvent(item.id, updates as any);
        const hostessNoteBody = note.trim()
          ? `[${item.name}] ${note.trim()}`
          : `[${item.name}] ${type} hostess coaching`;
        // Derive category from intent (the [Reason] prefix), not from person type.
        // Hostess interactions only count as Coaching when the user explicitly
        // picked a coaching reason; otherwise they fall to Follow-Up.
        const hReason = (note.trim().match(/^\s*\[([^\]]+)\]/)?.[1]) || null;
        const hCategory = resolveIntentCategory(hReason);
        await createNote({
          entity_type: "Hostess",
          note_body: hostessNoteBody,
          note_type: type,
          tags: [categoryTag(hCategory)],
          next_step: nextStep?.trim() || null,
          next_follow_up_date: nextDate ?? null,
          is_booking_attempt: hCategory === "Booking" || (isBookingAttempt ?? false),
          is_follow_up: hCategory === "Follow-Up" || (isFollowUp ?? true),
        });
      } else if (item.itemType === "lead") {
        const defaultNext = format(addDays(new Date(), 2), "yyyy-MM-dd");
        const updates: Record<string, string | null> = {
          last_contact_date: today,
          next_follow_up_date: nextDate || defaultNext,
        };
        if (!nextDate) updates.status = "Contacted";
        await updateBookingLead(item.id, updates as any);
        const lBody = note.trim() || `${type} follow-up`;
        const lReason = lBody.match(/^\s*\[([^\]]+)\]/)?.[1] || null;
        const lCategory = resolveIntentCategory(lReason);
        await createNote({
          entity_type: "Lead",
          person_id: item.id,
          person_type: "lead",
          note_body: lBody,
          note_type: type,
          tags: [categoryTag(lCategory)],
          next_step: nextStep?.trim() || null,
          next_follow_up_date: nextDate || defaultNext,
          is_booking_attempt: isBookingAttempt ?? false,
          is_follow_up: isFollowUp ?? true,
        });
      } else if (item.itemType === "event_task") {
        await completeEventTask(item.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-notes"] });
      queryClient.invalidateQueries({ queryKey: ["focus-daily-progress"] });
      setActionItem(null); setNoteText(""); setNoteNextStep(""); setNoteType("Call"); setFollowUpDate("");
      setInlineNoteId(null); setInlineNoteText(""); setInlineNextStep(""); setInlineNoteType("Call"); setInlineFollowUpDate("");
      toast.success("Marked as contacted");
    },
  });

  // ─── Skip / Did Not Reach Out mutation ──────────────────────────
  // Skip means "not today" — the PRIMARY job is to clear the person from the
  // current workload by rescheduling the next follow-up. Activity logging is
  // secondary (and intentionally does NOT count as outreach: trigger ignores
  // last_contacted for note_type='Skipped'; is_follow_up:false, is_booking_attempt:false).
  //
  // Order of operations (revised — clearance first):
  //   1) Reschedule next_follow_up_date FIRST so the person disappears from Today
  //      even if activity logging later fails. This prevents the "still due" bug.
  //   2) Optimistically update the React Query cache so the UI reflects the change
  //      immediately (no flicker / no waiting for refetch).
  //   3) Log the skip note (best-effort timeline + structured note).
  //
  // Default reschedule: customer/lead/prospect/hostess +2 days, consultant +3 days.
  const skipFollowUpMutation = useMutation({
    mutationFn: async ({ item, nextDate, noFollowUp, note }: {
      item: ActionItem;
      nextDate?: string | null;
      noFollowUp?: boolean;
      note?: string;
    }) => {
      // Caller MUST pass either nextDate or noFollowUp (no auto +2/+3 day defaults).
      const computed = noFollowUp ? null : (nextDate || null);
      const skipNoteBody = note?.trim() || "Skipped — did not reach out";

      if (item.itemType === "customer") {
        // 1) Reschedule FIRST — this is what clears the person from Today.
        await updateCustomer(item.id, {
          next_follow_up_date: computed,
          follow_up_reason: noFollowUp ? "No follow-up needed" : "Skipped — rescheduled",
        } as any);
        // 2) Log activity (best-effort — failure here must NOT leave person stuck on Today).
        try {
          await createNote({
            entity_type: "Customer",
            customer_id: item.id,
            person_id: item.id,
            person_type: "customer",
            note_body: skipNoteBody,
            note_type: "Skipped",
            next_follow_up_date: computed,
            is_booking_attempt: false,
            is_follow_up: false,
          });
        } catch (e) {
          console.warn("[skip] note insert failed (date already rescheduled):", e);
        }
        try {
          await createCustomerNote({ customer_id: item.id, note_text: skipNoteBody, note_type: "Skipped" });
        } catch { /* non-critical timeline mirror */ }
      } else if (item.itemType === "prospect") {
        await updateProspect(item.id, { next_follow_up_date: computed } as any);
        try {
          await createNote({
            entity_type: "Prospect",
            prospect_id: item.id,
            person_id: item.id,
            person_type: "prospect",
            note_body: skipNoteBody,
            note_type: "Skipped",
            next_follow_up_date: computed,
            is_booking_attempt: false,
            is_follow_up: false,
          });
        } catch (e) { console.warn("[skip] prospect note failed:", e); }
      } else if (item.itemType === "consultant") {
        if (computed) await updateTeamConsultant(item.id, { next_coaching_date: computed } as any);
        try {
          await createNote({
            entity_type: "Consultant",
            person_type: "consultant",
            person_id: item.id,
            tags: ["consultant_coaching"],
            note_body: `[${item.name}] ${skipNoteBody}`,
            note_type: "Skipped",
            next_follow_up_date: computed,
            is_booking_attempt: false,
            is_follow_up: false,
          });
        } catch (e) { console.warn("[skip] consultant note failed:", e); }
      } else if (item.itemType === "hostess") {
        if (computed) await updateEvent(item.id, { hostess_next_action_date: computed } as any);
        try {
          await createNote({
            entity_type: "Hostess",
            note_body: `[${item.name}] ${skipNoteBody}`,
            note_type: "Skipped",
            next_follow_up_date: computed,
            is_booking_attempt: false,
            is_follow_up: false,
          });
        } catch (e) { console.warn("[skip] hostess note failed:", e); }
      } else if (item.itemType === "lead") {
        await updateBookingLead(item.id, { next_follow_up_date: computed } as any);
        try {
          await createNote({
            entity_type: "Lead",
            person_id: item.id,
            person_type: "lead",
            note_body: skipNoteBody,
            note_type: "Skipped",
            next_follow_up_date: computed,
            is_booking_attempt: false,
            is_follow_up: false,
          });
        } catch (e) { console.warn("[skip] lead note failed:", e); }
      } else if (item.itemType === "event_task") {
        // Event tasks: just push the due date out (no separate activity log)
        if (computed) {
          const { error } = await supabase.from("event_tasks").update({ due_date: computed }).eq("id", item.id);
          if (error) throw error;
        }
      }
    },
    // Optimistic clearance: immediately patch the relevant React Query cache so the
    // person disappears from Today before the network round-trip completes.
    onMutate: async ({ item, nextDate, noFollowUp }) => {
      const computed = noFollowUp ? null : (nextDate || null);
      if (item.itemType === "customer") {
        await queryClient.cancelQueries({ queryKey: ["customers"] });
        const prev = queryClient.getQueryData<any[]>(["customers"]);
        queryClient.setQueryData<any[]>(["customers"], (old) =>
          (old || []).map((c) => c.id === item.id ? { ...c, next_follow_up_date: computed, follow_up_reason: noFollowUp ? "No follow-up needed" : "Skipped — rescheduled" } : c)
        );
        return { prev, key: ["customers"] };
      }
      if (item.itemType === "prospect") {
        await queryClient.cancelQueries({ queryKey: ["prospects"] });
        const prev = queryClient.getQueryData<any[]>(["prospects"]);
        queryClient.setQueryData<any[]>(["prospects"], (old) =>
          (old || []).map((p) => p.id === item.id ? { ...p, next_follow_up_date: computed, next_step_date: computed } : p)
        );
        return { prev, key: ["prospects"] };
      }
      if (item.itemType === "consultant") {
        await queryClient.cancelQueries({ queryKey: ["team-consultants"] });
        const prev = queryClient.getQueryData<any[]>(["team-consultants"]);
        queryClient.setQueryData<any[]>(["team-consultants"], (old) =>
          (old || []).map((c) => c.id === item.id ? { ...c, next_coaching_date: computed } : c)
        );
        return { prev, key: ["team-consultants"] };
      }
      if (item.itemType === "lead") {
        await queryClient.cancelQueries({ queryKey: ["booking-leads"] });
        const prev = queryClient.getQueryData<any[]>(["booking-leads"]);
        queryClient.setQueryData<any[]>(["booking-leads"], (old) =>
          (old || []).map((l) => l.id === item.id ? { ...l, next_follow_up_date: computed } : l)
        );
        return { prev, key: ["booking-leads"] };
      }
      if (item.itemType === "hostess") {
        await queryClient.cancelQueries({ queryKey: ["events"] });
        const prev = queryClient.getQueryData<any[]>(["events"]);
        queryClient.setQueryData<any[]>(["events"], (old) =>
          (old || []).map((e) => e.id === item.id ? { ...e, hostess_next_action_date: computed } : e)
        );
        return { prev, key: ["events"] };
      }
      return undefined;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-notes"] });
      const msg = variables.noFollowUp
        ? "Skipped — no follow-up scheduled"
        : "Skipped — rescheduled";
      toast.success(msg);
    },
    onError: (err: any, _vars, context: any) => {
      // Roll back optimistic update on hard failure (the reschedule itself failed).
      if (context?.prev && context?.key) {
        queryClient.setQueryData(context.key, context.prev);
      }
      toast.error(`Failed to skip: ${err?.message || "unknown error"}`);
    },
  });

  // Ref forwarder so handleUniversalAction (declared early) can call rescheduleLogMutation
  // (declared later) without hitting the temporal dead zone.
  const rescheduleLogRef = useRef<((args: { event: EventRecord; noteType: string; noteText: string; overrideNextDate?: string | null }) => void) | null>(null);

  // Universal Action Panel handler (placed after contactMutation)
  const handleUniversalAction = useCallback(({ item: uItem, actionType, note, isBookingAttempt, isFollowUp, nextFollowUpDate }: {
    item: UniversalActionItem;
    actionType: string;
    note: string;
    isBookingAttempt: boolean;
    isFollowUp: boolean;
    nextFollowUpDate?: string | null;
  }) => {
    // If the panel was opened from a Reschedule row, route through reschedule logic so the
    // event's reschedule_* fields update (and the Today task clears once the date moves forward).
    if (universalRescheduleEvent) {
      rescheduleLogRef.current?.({
        event: universalRescheduleEvent,
        noteType: actionType,
        noteText: note,
        overrideNextDate: nextFollowUpDate ?? undefined,
      });
      setUniversalRescheduleEvent(null);
      setUniversalPanelOpen(false);
      setUniversalPanelItem(null);
      return;
    }
    const ai: ActionItem = {
      id: uItem.id, itemType: uItem.personType, name: uItem.name,
      phone: uItem.phone, email: uItem.email,
      next_follow_up: null, follow_up_status: uItem.followUpStatus || "", actionLabel: "",
    };
    contactMutation.mutate({
      item: ai,
      note,
      type: actionType,
      nextDate: nextFollowUpDate ?? undefined,
      isBookingAttempt,
      isFollowUp,
    });
  }, [contactMutation, universalRescheduleEvent]);

  // Open the Universal Action Panel for a Reschedule Follow-Up row.
  // Treats the event as a "hostess" person so the unified UI works as everywhere else.
  const openRescheduleUniversalPanel = useCallback((evt: EventRecord) => {
    const recentNotes = unifiedNotes
      .filter((n: any) => n.entity_type === "Hostess" && evt.hostess_name && n.note_body?.includes(evt.hostess_name))
      .slice(0, 5)
      .map((n: any) => ({
        date: n.note_date ? formatDateOnly(n.note_date, "MMM d") : "",
        actionType: n.note_type || "Note",
        preview: (n.note_body || "").slice(0, 80),
      }));
    setUniversalRescheduleEvent(evt);
    setUniversalPanelItem({
      id: evt.id,
      personType: "hostess",
      name: evt.hostess_name || evt.event_id,
      phone: evt.hostess_phone || null,
      email: evt.hostess_email || null,
      statusLabel: `Reschedule — Attempt #${(evt.reschedule_attempt_number || 0) + 1}`,
      followUpReason: "Rescheduling",
      nextFollowUpDate: evt.reschedule_next_follow_up_date || null,
      recentNotes,
    });
    setUniversalPanelOpen(true);
  }, [unifiedNotes]);

  const [skipDialogItem, setSkipDialogItem] = useState<ActionItem | null>(null);

  const applySkipChoice = useCallback(async (item: ActionItem, choice: SkipChoice) => {
    if (universalRescheduleEvent) {
      let nextDate: string | null = null;
      if (choice.kind === "days") nextDate = format(addDays(new Date(), choice.days), "yyyy-MM-dd");
      else if (choice.kind === "custom") nextDate = choice.date;
      else if (choice.kind === "clear") nextDate = null;
      try {
        await updateEvent(universalRescheduleEvent.id, { reschedule_next_follow_up_date: nextDate } as any);
        queryClient.invalidateQueries({ queryKey: ["events"] });
        toast.success(nextDate ? "Skipped — rescheduled" : "Follow-up cleared");
      } catch (err: any) { toast.error(err?.message || "Failed to skip"); }
      setUniversalRescheduleEvent(null);
      setUniversalPanelOpen(false);
      setUniversalPanelItem(null);
      return;
    }
    if (choice.kind === "pcp" && item.itemType === "customer") {
      try {
        await logCatalogSent({ customerId: item.id, campaignType: "Spring", mailingDate: toLocalDateKey(), scheduleFollowUp: true });
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["all-notes"] });
        queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
        toast.success("Added to PCP — follow-up in 6 days");
      } catch (err: any) { toast.error(err?.message || "Failed to add to PCP"); }
      return;
    }
    if (choice.kind === "clear") {
      skipFollowUpMutation.mutate({ item, noFollowUp: true });
      return;
    }
    const nextDate = choice.kind === "days"
      ? format(addDays(new Date(), choice.days), "yyyy-MM-dd")
      : choice.kind === "custom" ? choice.date : null;
    if (!nextDate) return;
    skipFollowUpMutation.mutate({ item, nextDate });
  }, [skipFollowUpMutation, universalRescheduleEvent, queryClient]);

  const handleUniversalSkip = useCallback((uItem: UniversalActionItem) => {
    const ai: ActionItem = {
      id: uItem.id, itemType: uItem.personType, name: uItem.name,
      phone: uItem.phone, email: uItem.email,
      next_follow_up: null, follow_up_status: uItem.followUpStatus || "", actionLabel: "",
    };
    setSkipDialogItem(ai);
  }, []);

  const handleInlineSave = (item: ActionItem) => {
    contactMutation.mutate({ item, note: inlineNoteText, nextStep: inlineNextStep, type: inlineNoteType, nextDate: normalizeFollowUpDate(inlineFollowUpDate) || undefined });
  };

  const detailNoteMutation = useMutation({
    mutationFn: async () => {
      if (!detailItem || !detailNoteText.trim()) return;
      if (detailItem.itemType === "customer") {
        await logCustomerActivity({
          customerId: detailItem.id,
          noteType: detailNoteType === "General" ? "Other" : detailNoteType,
          noteText: detailNoteText.trim(),
          nextStep: detailNextStep.trim(),
          nextFollowUpDate: normalizeFollowUpDate(detailFollowUpDate),
        });
      }
      else if (detailItem.itemType === "prospect") {
        await createProspectNote({ prospect_id: detailItem.id, note_text: detailNoteText.trim() });
        await createNote({ entity_type: "Prospect", prospect_id: detailItem.id, note_body: detailNoteText.trim(), note_type: detailNoteType, next_step: detailNextStep.trim() || null, next_follow_up_date: normalizeFollowUpDate(detailFollowUpDate) ?? null });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes", detailItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["prospect-notes", detailItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["focus-daily-progress"] });
      setDetailNoteText(""); setDetailNextStep(""); setDetailNoteType("Call"); toast.success("Note added");
    },
  });

  const detailFollowUpMutation = useMutation({
    mutationFn: async () => {
      const normalizedDate = normalizeFollowUpDate(detailFollowUpDate);
      if (!normalizedDate || !detailItem) return;
      if (detailItem.itemType === "customer") await updateCustomer(detailItem.id, { next_follow_up_date: normalizedDate } as any);
      else if (detailItem.itemType === "prospect") await updateProspect(detailItem.id, { next_follow_up_date: normalizedDate } as any);
      else if (detailItem.itemType === "consultant") await updateTeamConsultant(detailItem.id, { next_coaching_date: normalizedDate } as any);
      else if (detailItem.itemType === "hostess") await updateEvent(detailItem.id, { hostess_next_action_date: normalizedDate } as any);
      else if (detailItem.itemType === "lead") await updateBookingLead(detailItem.id, { next_follow_up_date: normalizedDate } as any);
      // event_task items don't support rescheduling via this mechanism
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      setDetailFollowUpDate(""); toast.success("Date updated");
    },
  });

  // Mark Follow-Up Complete (handles dormant cadence automatically)
  const markFollowUpCompleteMutation = useMutation({
    mutationFn: async ({ item, noteText: note, noteType: nType }: { item: ActionItem; noteText: string; noteType: string }) => {
      const today = toLocalDateKey();
      if (item.itemType === "customer") {
        const isDormant = item.activity_status === "Dormant";
        const currentStage = (item.dormant_follow_up_stage || null) as DormantStage;

        let nextDate: string;
        let nextStage: DormantStage = currentStage;

        if (isDormant) {
          // Use dormant cadence
          const effectiveStage = currentStage || "Stage 1";
          nextStage = getNextDormantStage(effectiveStage as DormantStage);
          nextDate = getNextDormantFollowUpDate(effectiveStage as DormantStage);
        } else {
          // Default to Quick Follow-Up (2 days) — not reorder cycle
          nextDate = format(addDays(new Date(), 2), "yyyy-MM-dd");
        }

        const updates: Record<string, any> = {
          last_contacted: today,
          next_follow_up_date: nextDate,
        };
        if (isDormant) {
          updates.dormant_follow_up_stage = nextStage;
        }
        await updateCustomer(item.id, updates as any);
        await logCustomerActivity({ customerId: item.id, noteType: nType, noteText: note, nextFollowUpDate: nextDate });
      } else if (item.itemType === "prospect") {
        const nextDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
        await updateProspect(item.id, { last_contact_date: today, next_follow_up_date: nextDate } as any);
        if (note.trim()) await createProspectNote({ prospect_id: item.id, note_text: note.trim() });
      } else if (item.itemType === "lead") {
        const nextDate = format(addDays(new Date(), 2), "yyyy-MM-dd");
        await updateBookingLead(item.id, { last_contact_date: today, next_follow_up_date: nextDate, status: "Contacted" } as any);
      } else if (item.itemType === "event_task") {
        await completeEventTask(item.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      setDetailItem(null);
      toast.success("Follow-up complete! Next date auto-scheduled.");
    },
  });

  const distributeMutation = useMutation({
    mutationFn: () => bulkUpdateCustomerFollowUps(distributePreview.map((p) => ({ id: p.id, next_follow_up_date: p.date }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowDistribute(false); setDistributeSelectedIds(new Set());
      toast.success(`Distributed ${distributePreview.length} follow-ups across ${distributeDays} days`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openContactDialog = (item: ActionItem, defaultType = "Call") => { setActionItem(item); setNoteText(""); setNoteNextStep(""); setNoteType(defaultType); setFollowUpDate(""); };
  const openDetailSheet = (item: ActionItem) => { setDetailItem(item); setDetailNoteText(""); setDetailNextStep(""); setDetailNoteType("General"); setDetailFollowUpDate(item.next_follow_up || ""); setScheduleDelivery(false); setDeliveryDate(toLocalDateKey(addDays(new Date(), 1))); setDeliveryNotes(""); };
  const handleSubmitAction = () => { if (!actionItem) return; contactMutation.mutate({ item: actionItem, note: noteText, nextStep: noteNextStep, type: noteType, nextDate: normalizeFollowUpDate(followUpDate) || undefined }); };

  // Quick log: 1-tap activity logging with minimal data
  const handleQuickLog = useCallback((item: ActionItem, activityType: string) => {
    contactMutation.mutate({ item, note: `${activityType} contact`, type: activityType });
  }, [contactMutation]);

  const deliveryCreateMut = useMutation({
    mutationFn: async () => {
      if (!detailItem) return;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id || null;
      const customer = detailItem.itemType === "customer" ? customers.find((c) => c.id === detailItem.id) : null;
      const { error } = await supabase.from("daily_plan_items" as any).insert({
        plan_date: deliveryDate,
        item_type: "delivery",
        customer_name: detailItem.name,
        customer_id: detailItem.itemType === "customer" ? detailItem.id : null,
        address: customer ? [customer.address_line_1, customer.city, customer.state_territory].filter(Boolean).join(", ") : null,
        phone: detailItem.phone,
        notes: deliveryNotes || null,
        sort_order: 0,
        owner_user_id: uid,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-counts"] });
      setScheduleDelivery(false);
      setDeliveryNotes("");
      toast.success(`Delivery scheduled for ${formatDateOnly(deliveryDate)}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Reschedule cadence ───
  const RESCHEDULE_CADENCE_DAYS = [1, 2, 3, 14, 30]; // attempt 0→+1, 1→+2, 2→+3, 3→+14, 4→+30, 5→STOP
  const getNextRescheduleFollowUp = (attempt: number): string | null => {
    if (attempt >= RESCHEDULE_CADENCE_DAYS.length) return null;
    return toLocalDateKey(addDays(new Date(), RESCHEDULE_CADENCE_DAYS[attempt]));
  };

  const rescheduleLogMutation = useMutation({
    mutationFn: async ({ event, noteType: nt, noteText: text, overrideNextDate }: { event: EventRecord; noteType: string; noteText: string; overrideNextDate?: string | null }) => {
      const newAttempt = (event.reschedule_attempt_number || 0) + 1;
      // Honor a user-chosen next follow-up date if provided; otherwise fall back to cadence.
      const nextFollowUp = overrideNextDate !== undefined
        ? overrideNextDate
        : getNextRescheduleFollowUp(newAttempt);
      const updates: Record<string, any> = {
        reschedule_last_contact_date: toLocalDateKey(),
        reschedule_attempt_number: newAttempt,
        reschedule_next_follow_up_date: nextFollowUp,
        reschedule_status: "In Process of Rescheduling",
        requires_manual_next_step: newAttempt >= 5 && !nextFollowUp,
      };
      await updateEvent(event.id, updates);
      // Log centralized note for traceability and 6 Important tracking
      const hostessName = event.hostess_name || "Hostess";
      const noteBody = text.trim()
        ? `[${hostessName}] [Reschedule] ${text.trim()}`
        : `[${hostessName}] [Reschedule] ${nt} contact`;
      await createNote({
        entity_type: "Hostess",
        note_body: noteBody,
        note_type: nt,
        next_step: null,
        next_follow_up_date: nextFollowUp,
        is_booking_attempt: true,
        is_follow_up: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["focus-daily-progress"] });
      setRescheduleActivityEvent(null);
      setRescheduleNoteText("");
      setRescheduleNoteType("Call");
      setRescheduleStep("log");
      toast.success("Reschedule follow-up logged");
    },
    onError: (err: Error) => toast.error(err.message),
  });
  // Wire the ref so handleUniversalAction (defined earlier) can invoke this mutation.
  rescheduleLogRef.current = (args) => rescheduleLogMutation.mutate(args);

  const rescheduleSetNewDateMutation = useMutation({
    mutationFn: async ({ event, newDate }: { event: EventRecord; newDate: string }) => {
      await updateEvent(event.id, {
        event_date: newDate,
        event_status: "Booked",
        reschedule_status: "None",
        reschedule_attempt_number: 0,
        reschedule_next_follow_up_date: null,
        reschedule_last_contact_date: null,
        requires_manual_next_step: false,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setSetNewDateEvent(null);
      setNewEventDate("");
      toast.success("Event rebooked successfully!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Fresh Start: reschedule all current Today/Overdue follow-ups forward ───
  // Spreads them across [tomorrow, today + N days] using the existing workday-aware
  // spreadTasks helper so the user lands on a clean Today without losing data.
  // Captures previous dates for one-shot Undo.
  const freshStartMutation = useMutation({
    mutationFn: async (windowDays: number) => {
      const itemsToReset = todayActions.filter(
        (i) => i.follow_up_status === "OVERDUE" || i.follow_up_status === "TODAY"
      );
      if (itemsToReset.length === 0) return { undo: [] as Array<any>, count: 0, perDay: 0 };

      // Distribute evenly across the window (ceil) so all items fit.
      const perDay = Math.max(1, Math.ceil(itemsToReset.length / windowDays));
      const tomorrow = toLocalDateKey(addDays(new Date(), 1));
      const seedDates = itemsToReset.map(() => tomorrow);
      const blackout = new Set<string>();
      const newDates = spreadTasks(seedDates, perDay, null, blackout, workdayFlags);

      const undo: Array<{ itemType: string; id: string; previousDate: string | null; eventTaskId?: string }> = [];

      await Promise.allSettled(
        itemsToReset.map((item, idx) => {
          const newDate = newDates[idx];
          undo.push({
            itemType: item.itemType,
            id: item.id,
            previousDate: item.next_follow_up || null,
            eventTaskId: item._eventTaskId,
          });
          switch (item.itemType) {
            case "customer":
              return updateCustomer(item.id, { next_follow_up_date: newDate } as any);
            case "lead":
              return updateBookingLead(item.id, { next_follow_up_date: newDate } as any);
            case "prospect":
              return updateProspect(item.id, { next_follow_up_date: newDate } as any);
            case "consultant":
              return updateTeamConsultant(item.id, { next_coaching_date: newDate } as any);
            case "hostess":
              return updateEvent(item.id, { hostess_next_action_date: newDate } as any);
            case "event_task":
              return supabase.from("event_tasks").update({ due_date: newDate }).eq("id", item._eventTaskId || item.id);
            default:
              return Promise.resolve();
          }
        })
      );

      return { undo, count: itemsToReset.length, perDay };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      setShowFreshStart(false);
      if (result.count === 0) {
        toast.info("Nothing to reset — Today is already clear.");
        return;
      }
      setFreshStartUndo(result.undo);
      toast.success(`Fresh Start: ${result.count} follow-ups spread across the next ${freshStartDays} days.`, { duration: 8000 });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to reset follow-ups"),
  });

  // Undo the most recent Fresh Start (restores prior next_follow_up dates).
  const freshStartUndoMutation = useMutation({
    mutationFn: async () => {
      if (!freshStartUndo) return 0;
      await Promise.allSettled(
        freshStartUndo.map((u) => {
          switch (u.itemType) {
            case "customer":
              return updateCustomer(u.id, { next_follow_up_date: u.previousDate } as any);
            case "lead":
              return updateBookingLead(u.id, { next_follow_up_date: u.previousDate } as any);
            case "prospect":
              return updateProspect(u.id, { next_follow_up_date: u.previousDate } as any);
            case "consultant":
              return updateTeamConsultant(u.id, { next_coaching_date: u.previousDate } as any);
            case "hostess":
              return updateEvent(u.id, { hostess_next_action_date: u.previousDate } as any);
            case "event_task":
              return supabase.from("event_tasks").update({ due_date: u.previousDate }).eq("id", u.eventTaskId || u.id);
            default:
              return Promise.resolve();
          }
        })
      );
      return freshStartUndo.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      setFreshStartUndo(null);
      toast.success(`Undone — restored ${count} follow-up dates.`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to undo"),
  });

  const rescheduleArchiveMutation = useMutation({
    mutationFn: async (event: EventRecord) => {
      await updateEvent(event.id, { is_archived: true, reschedule_next_follow_up_date: null, requires_manual_next_step: false } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setManualNextStepEvent(null);
      toast.success("Event archived — follow-up stopped");
    },
  });

  const rescheduleToNurtureMutation = useMutation({
    mutationFn: async (event: EventRecord) => {
      await updateEvent(event.id, { reschedule_next_follow_up_date: null, requires_manual_next_step: false, reschedule_status: "None", event_status: "Cancelled" } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setManualNextStepEvent(null);
      toast.success("Moved to nurture — no further auto follow-up");
    },
  });

  const toggleWorkdayOverrideMutation = useMutation({
    mutationFn: async ({ item, newValue }: { item: ActionItem; newValue: boolean }) => {
      const tableMap: Record<string, string> = {
        customer: "customers",
        prospect: "prospects",
        lead: "booking_leads",
        consultant: "team_consultants",
        hostess: "events",
        event_task: "event_tasks",
      };
      const table = tableMap[item.itemType];
      if (!table) return;
      const { error } = await supabase
        .from(table as any)
        .update({ allow_non_working_day: newValue } as any)
        .eq("id", item.itemType === "hostess" ? item.id : (item._eventTaskId || item.id));
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      toast.success("Workday override updated");
    },
  });

  const toggleInlineNote = (item: ActionItem) => { if (inlineNoteId === item.id) { setInlineNoteId(null); } else { setInlineNoteId(item.id); setInlineNoteText(""); setInlineNextStep(""); setInlineNoteType("Call"); setInlineFollowUpDate(""); } };
  const navigateToItem = (item: ActionItem) => {
    if (item.itemType === "customer") navigate(`/customers/${item.id}`, { state: { from: "/follow-ups" } });
    else if (item.itemType === "prospect") navigate(`/prospects/${item.id}`, { state: { from: "/follow-ups" } });
    else if (item.itemType === "lead") navigate(`/booking-leads/${item.id}`, { state: { from: "/follow-ups" } });
    else if (item.itemType === "hostess") {
      const evt = events.find(e => e.id === item.id);
      if (evt) navigate(`/events/${evt.event_id}`);
      else navigate("/events");
    } else if (item.itemType === "event_task" && item._eventId) {
      navigate(`/events/${item._eventId}`);
    }
    else navigate("/leadership");
  };

  // ─── Render ───
  return (
    <Layout>
      <div className={cn("pb-8", isMobile ? "space-y-2" : "space-y-4")}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={cn("font-bold tracking-tight text-foreground", isMobile ? "text-xl" : "text-2xl")}>Today</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {todayActions.length} action{todayActions.length !== 1 ? "s" : ""} · {todayEvents.length} event{todayEvents.length !== 1 ? "s" : ""} · {birthdaysToday.filter(c => !isRelationshipDone(c)).length + birthdaysOverdue.filter(c => !isRelationshipDone(c)).length} touch{(birthdaysToday.filter(c => !isRelationshipDone(c)).length + birthdaysOverdue.filter(c => !isRelationshipDone(c)).length) !== 1 ? "es" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {freshStartUndo && freshStartUndo.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => freshStartUndoMutation.mutate()}
                disabled={freshStartUndoMutation.isPending}
                title="Restore previous follow-up dates"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Undo Fresh Start
              </Button>
            )}
            {todayActions.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowFreshStart(true)}
                title="Reschedule all of Today's follow-ups forward to recover from a backlog"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Fresh Start
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "today" | "upcoming")}>
              <TabsList>
                <TabsTrigger value="today" className="gap-1.5">
                  <Clock className="w-3.5 h-3.5" />Today
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{todayActions.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="upcoming" className="gap-1.5">
                  <CalendarRange className="w-3.5 h-3.5" />Upcoming
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{upcomingActions.length + upcomingEvents.length}</Badge>
                </TabsTrigger>
              </TabsList>

              {/* ===== TODAY TAB — COMMAND CENTER ===== */}
              <TabsContent value="today" className="mt-4">
                {isOOOActive && (
                  <div className="mb-3 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/20 px-3 py-2 sm:flex sm:items-center sm:gap-3">
                    {/* Mobile: stacked compact rows. Desktop (sm+): single row. */}
                    <div className="flex items-center gap-2 sm:flex-1 sm:min-w-0">
                      <Palmtree className="w-4 h-4 text-primary shrink-0" />
                      <p className="text-sm font-semibold text-foreground leading-tight">Out of Office ON</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 sm:mt-0 sm:text-xs sm:flex-1">
                      Workflow paused • Birthdays still show{showFollowUpsOverride ? " • Revealed" : ""}
                    </p>
                    <Button
                      size="sm"
                      variant={showFollowUpsOverride ? "secondary" : "default"}
                      className="mt-2 sm:mt-0 h-7 w-full sm:w-auto text-xs gap-1.5"
                      onClick={() => setShowFollowUpsOverride((v) => !v)}
                    >
                      {showFollowUpsOverride ? (<><EyeOff className="w-3.5 h-3.5" /> Hide Follow-Ups</>) : (<><Eye className="w-3.5 h-3.5" /> Show Follow-Ups</>)}
                    </Button>
                  </div>
                )}

                {isNonWorkday && !isOOOActive && (
                  <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3 flex items-center gap-2">
                    <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">Today is a non-working day. Showing existing due/overdue items only — no new tasks will be generated.</p>
                  </div>
                )}

                <div className={cn(isMobile ? "space-y-2" : "space-y-4")}>

                  {/* ═══ Daily Quote ═══ */}
                  {(() => {
                    const quotes = [
                      { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
                      { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
                      { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
                      { text: "Your only limit is the one you set for yourself.", author: "Unknown" },
                      { text: "She believed she could, so she did.", author: "R.S. Grey" },
                      { text: "Small daily improvements are the key to staggering long-term results.", author: "Unknown" },
                      { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
                    ];
                    const dayIndex = Math.floor(Date.now() / 86400000) % quotes.length;
                    const q = quotes[dayIndex];
                    return (
                      <p className="text-center text-sm italic text-muted-foreground py-1">
                        &ldquo;{q.text}&rdquo; <span className="not-italic font-medium">— {q.author}</span>
                      </p>
                    );
                  })()}

                   {/* Client Cleanup — secondary, low-pressure maintenance card */}
                   <ClientCleanupCard />

                   {/* 6 Most Important Things now lives on the Dashboard (/dashboard).
                       Today is execution-only. */}

                   {/* ═══ SECTION 2: Follow-Ups (Unified View) — hidden in OOO unless overridden ═══ */}
                   {/* Event Tasks (hostess + event_task) are intentionally EXCLUDED here — they
                       live in their own dedicated "Event Tasks" section below to avoid
                       duplication and to keep follow-up counts focused on client/lead/prospect
                       outreach. */}
                   {!hideWorkflow && (() => {
                     const excludedTypes = new Set(["consultant", "hostess", "event_task"]);
                     const followUpItems = todayActions.filter(i => !excludedTypes.has(i.itemType));

                     // Per-category daily limits (user-configurable in Schedule Settings).
                     const customerLimit = Math.max(1, Number(scheduleSettings?.daily_customer_followup_limit ?? 10));
                     const leadLimit = Math.max(1, Number(scheduleSettings?.daily_lead_followup_limit ?? 10));

                     // Split into the three categories. Customers and leads are capped
                     // independently; prospects (recruiting) are unlimited per spec.
                     const allCustomerItems = followUpItems.filter(i => i.itemType === "customer");
                     const allLeadItems = followUpItems.filter(i => i.itemType === "lead");
                     const prospectItems = followUpItems.filter(i => i.itemType === "prospect");

                     // Priority sort within a category: most overdue first, then due-today, then general.
                     const prioritySort = (items: ActionItem[]) => {
                       const score = (i: ActionItem) =>
                         i.follow_up_status === "OVERDUE" ? 0 :
                         i.follow_up_status === "TODAY" ? 1 : 2;
                       return [...items].sort((a, b) => {
                         const sa = score(a);
                         const sb = score(b);
                         if (sa !== sb) return sa - sb;
                         return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
                       });
                     };

                     const customerSorted = prioritySort(allCustomerItems);
                     const leadSorted = prioritySort(allLeadItems);
                     const customerVisible = customerSorted.slice(0, customerLimit);
                     const leadVisible = leadSorted.slice(0, leadLimit);
                     const customerOverflow = Math.max(0, customerSorted.length - customerLimit);
                     const leadOverflow = Math.max(0, leadSorted.length - leadLimit);

                     // Bucket helpers for desktop sub-sections.
                     const splitBuckets = (items: ActionItem[]) => {
                       const overdue = items.filter(i => i.follow_up_status === "OVERDUE");
                       const overdueIds = new Set(overdue.map(i => i.id));
                       const dueToday = items.filter(i => !overdueIds.has(i.id) && i.follow_up_status === "TODAY");
                       const dueIds = new Set(dueToday.map(i => i.id));
                       const general = items.filter(i => !overdueIds.has(i.id) && !dueIds.has(i.id));
                       return { overdue, dueToday, general };
                     };

                     // Mobile: feed the existing MobileTodayView with capped items combined,
                     // preserving overdue/due/general grouping.
                     if (isMobile) {
                       const combined = [...customerVisible, ...leadVisible, ...prospectItems];
                       const overdueItems = combined.filter(i => i.follow_up_status === "OVERDUE");
                       const overdueIds = new Set(overdueItems.map(i => i.id));
                       const dueTodayItems = combined.filter(i => !overdueIds.has(i.id) && i.follow_up_status === "TODAY");
                       const dueTodayIds = new Set(dueTodayItems.map(i => i.id));
                       const usedIds = new Set([...overdueIds, ...dueTodayIds]);
                       const generalItems = combined.filter(i => !usedIds.has(i.id));
                       const highPriorityItems: ActionItem[] = [];

                       const toMobileItem = (item: ActionItem): MobileActionItem => ({
                         id: item.id,
                         itemType: item.itemType,
                         name: item.name,
                         phone: item.phone,
                         email: item.email,
                         follow_up_status: item.follow_up_status,
                         daysOverdue: item.daysOverdue,
                         followUpReason: item.followUpReason,
                         actionLabel: item.actionLabel,
                         lastContacted: item.lastContacted ? formatLastContacted(item.lastContacted) : undefined,
                         days_since_last_order: item.days_since_last_order,
                         vip: item.vip,
                         lastNotePreview: item.lastNotePreview,
                         activity_status: item.activity_status,
                       });

                       return (
                         <>
                           {(customerOverflow > 0 || leadOverflow > 0) && (
                             <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                               Showing top {customerVisible.length}/{customerSorted.length} customers
                               {" · "}top {leadVisible.length}/{leadSorted.length} leads.
                               {(customerOverflow + leadOverflow) > 0 && ` ${customerOverflow + leadOverflow} more pushed to upcoming workdays.`}
                             </div>
                           )}
                           <MobileTodayView
                             overdueItems={overdueItems.map(toMobileItem)}
                             dueTodayItems={dueTodayItems.map(toMobileItem)}
                             highPriorityItems={highPriorityItems.map(toMobileItem)}
                             generalItems={generalItems.map(toMobileItem)}
                             onTapItem={(mi) => {
                               const original = combined.find(i => i.id === mi.id);
                               if (original) openUniversalPanel(original);
                             }}
                             onCompleteItem={(mi) => {
                               const original = combined.find(i => i.id === mi.id);
                               if (original) markFollowUpCompleteMutation.mutate({ item: original, noteText: "Follow-up complete", noteType: "Call" });
                             }}
                             onRescheduleItem={(mi) => {
                               const original = combined.find(i => i.id === mi.id);
                               if (original) openDetailSheet(original);
                             }}
                             onSkipItem={(mi) => {
                               const original = combined.find(i => i.id === mi.id);
                               if (original) skipFollowUpMutation.mutate({ item: original });
                             }}
                             onAddNoteItem={(mi) => {
                               const original = combined.find(i => i.id === mi.id);
                               if (original) toggleInlineNote(original);
                             }}
                             onDidNotConnect={(mi) => {
                               const original = combined.find(i => i.id === mi.id);
                               if (original) contactMutation.mutate({ item: original, note: "Did not connect", type: "Did Not Connect" });
                             }}
                           />
                         </>
                       );
                     }

                     // Desktop: shared row renderer.
                     const renderUnifiedSection = (title: string, icon: React.ElementType, items: ActionItem[], iconColor: string) => {
                       if (items.length === 0) return null;
                       const Icon = icon;
                       return (
                         <div key={title}>
                           <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                             <Icon className={cn("w-3 h-3", iconColor)} /> {title} ({items.length})
                           </p>
                           <div className="divide-y divide-border/40">
                             {items.map(item => (
                               <ActionRow
                                 key={`${item.itemType}-${item.id}`}
                                 item={item}
                                 inlineNoteId={inlineNoteId}
                                 inlineNoteText={inlineNoteText}
                                 inlineNextStep={inlineNextStep}
                                 inlineNoteType={inlineNoteType}
                                 inlineFollowUpDate={inlineFollowUpDate}
                                 setInlineNoteText={setInlineNoteText}
                                 setInlineNextStep={setInlineNextStep}
                                 setInlineNoteType={setInlineNoteType}
                                 setInlineFollowUpDate={setInlineFollowUpDate}
                                 onToggleInline={() => toggleInlineNote(item)}
                                 onInlineSave={() => handleInlineSave(item)}
                                 onOpenDetail={() => openDetailSheet(item)}
                                 isPending={contactMutation.isPending}
                                  onToggleWorkdayOverride={(val) => toggleWorkdayOverrideMutation.mutate({ item, newValue: val })}
                                  onQuickLog={(type) => handleQuickLog(item, type)}
                                  onOpenQuickAction={() => openUniversalPanel(item)}
                                 />
                             ))}
                           </div>
                         </div>
                       );
                     };

                     const renderCategoryCard = (
                       title: string,
                       items: ActionItem[],
                       totalCount: number,
                       limit: number,
                       overflow: number,
                       accentBg: string,
                       accentIcon: string,
                     ) => {
                       const buckets = splitBuckets(items);
                       return (
                         <Card className="border-border/50 shadow-sm">
                           <CardHeader className="pb-2">
                             <div className="flex items-center gap-2 flex-wrap">
                               <div className={cn("p-1.5 rounded-md", accentBg)}>
                                 <Users className={cn("w-4 h-4", accentIcon)} />
                               </div>
                               <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
                               <Badge variant="secondary" className="text-xs">
                                 {items.length}{totalCount > items.length ? ` / ${totalCount}` : ""}
                               </Badge>
                               <Badge variant="outline" className="text-[10px] px-1.5 py-0">Limit {limit}/day</Badge>
                               {overflow > 0 && (
                                 <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                                   +{overflow} pushed to upcoming
                                 </Badge>
                               )}
                             </div>
                           </CardHeader>
                           <CardContent className="pt-0">
                             {items.length === 0 ? (
                               <p className="text-sm text-muted-foreground py-6 text-center">All caught up! 🎉</p>
                             ) : (
                               <div className="space-y-4">
                                 {renderUnifiedSection("Overdue", Clock, buckets.overdue, "text-destructive")}
                                 {renderUnifiedSection("Due Today", CalendarCheck, buckets.dueToday, "text-primary")}
                                 {buckets.general.length > 0 && renderUnifiedSection("General", Users, buckets.general, "text-muted-foreground")}
                               </div>
                             )}
                           </CardContent>
                         </Card>
                       );
                     };

                     return (
                       <div className="space-y-4">
                         {/* Customer Follow-Ups (capped, overflow auto-distributed) */}
                         {renderCategoryCard(
                           "Customer Follow-Ups",
                           customerVisible,
                           customerSorted.length,
                           customerLimit,
                           customerOverflow,
                           "bg-blue-50 dark:bg-blue-950/30",
                           "text-blue-600",
                         )}

                         {/* Lead Follow-Ups (capped, overflow auto-distributed) */}
                         {renderCategoryCard(
                           "Lead Follow-Ups",
                           leadVisible,
                           leadSorted.length,
                           leadLimit,
                           leadOverflow,
                           "bg-amber-50 dark:bg-amber-950/30",
                           "text-amber-600",
                         )}

                         {/* Recruiting (Prospects) — unlimited */}
                         {prospectItems.length > 0 && (
                           <Card className="border-border/50 shadow-sm">
                             <CardHeader className="pb-2">
                               <div className="flex items-center gap-2">
                                 <div className="p-1.5 rounded-md bg-purple-50 dark:bg-purple-950/30">
                                   <Users className="w-4 h-4 text-purple-600" />
                                 </div>
                                 <CardTitle className="text-sm font-semibold text-foreground">Recruiting</CardTitle>
                                 <Badge variant="secondary" className="text-xs">{prospectItems.length}</Badge>
                               </div>
                             </CardHeader>
                             <CardContent className="pt-0">
                               <div className="space-y-4">
                                 {(() => {
                                   const buckets = splitBuckets(prioritySort(prospectItems));
                                   return (
                                     <>
                                       {renderUnifiedSection("Overdue", Clock, buckets.overdue, "text-destructive")}
                                       {renderUnifiedSection("Due Today", CalendarCheck, buckets.dueToday, "text-primary")}
                                       {buckets.general.length > 0 && renderUnifiedSection("General", Users, buckets.general, "text-muted-foreground")}
                                     </>
                                   );
                                 })()}
                               </div>
                             </CardContent>
                           </Card>
                         )}

                         {/* Reschedule Follow-Ups (event reschedules — unlimited) */}
                         {reschedulingFollowUp.length > 0 && (
                           <Card className="border-border/50 shadow-sm">
                             <CardHeader className="pb-2">
                               <div className="flex items-center gap-2">
                                 <div className="p-1.5 rounded-md bg-orange-50 dark:bg-orange-950/30">
                                   <RefreshCw className="w-4 h-4 text-orange-600" />
                                 </div>
                                 <CardTitle className="text-sm font-semibold text-foreground">Reschedule Follow-Ups</CardTitle>
                                 <Badge variant="secondary" className="text-xs">{reschedulingFollowUp.length}</Badge>
                               </div>
                             </CardHeader>
                             <CardContent className="pt-0">
                               <div className="divide-y divide-border/40">
                                 {reschedulingFollowUp.map((evt) => {
                                   const todayKey = toLocalDateKey();
                                   const fuDate = evt.reschedule_next_follow_up_date;
                                   const isDueNow = !fuDate || fuDate <= todayKey;
                                   return (
                                     <div key={evt.id} className="py-2 px-1 space-y-1">
                                       <div className="flex items-center gap-3">
                                         <div className="flex-1 min-w-0">
                                           <p className="text-sm font-medium text-foreground truncate">{evt.hostess_name || evt.event_id}</p>
                                           <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                             {evt.event_type && <span>{evt.event_type}</span>}
                                             {evt.event_date && <span>• Orig: {formatDateOnly(evt.event_date)}</span>}
                                             <span>• Attempt {evt.reschedule_attempt_number || 0}</span>
                                             {evt.reschedule_last_contact_date && <span>• Last: {formatDateOnly(evt.reschedule_last_contact_date)}</span>}
                                             {isDueNow && <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">Due</Badge>}
                                             {evt.requires_manual_next_step && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Manual</Badge>}
                                           </div>
                                         </div>
                                         <div className="flex items-center gap-1 shrink-0">
                                           {evt.hostess_phone && (
                                             <>
                                               <Button variant="ghost" size="icon" className="h-7 w-7" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                                 <a href={`tel:${phoneForLink(evt.hostess_phone)}`}><Phone className="w-3.5 h-3.5 text-primary" /></a>
                                               </Button>
                                                <TextActionButton phone={evt.hostess_phone} trigger="icon" className="h-7 w-7" />
                                             </>
                                           )}
                                         </div>
                                       </div>
                                       <div className="flex items-center gap-1.5 mt-1">
                                         {evt.requires_manual_next_step ? (
                                           <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setManualNextStepEvent(evt)}>Choose Next Step</Button>
                                         ) : (
                                           <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openRescheduleUniversalPanel(evt)}>Log Activity</Button>
                                         )}
                                         <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => { setSetNewDateEvent(evt); setNewEventDate(""); }}>Set New Date</Button>
                                         <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => navigate(`/events/${evt.event_id}`, { state: { from: "/follow-ups" } })}>
                                           <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                                         </Button>
                                       </div>
                                     </div>
                                   );
                                 })}
                               </div>
                             </CardContent>
                           </Card>
                         )}
                       </div>
                     );
                  })()}



                  {/* ═══ SECTION 3: Coaching (Consultants) — hidden in OOO unless overridden ═══ */}
                  {!hideWorkflow && (() => {
                    const coachingActions = todayActions.filter(i => i.itemType === "consultant");
                    if (coachingActions.length === 0) return null;

                    if (isMobile) {
                      const toTeamItem = (item: ActionItem): MobileTeamItem => ({
                        id: item.id,
                        itemType: item.itemType as MobileTeamItem["itemType"],
                        name: item.name,
                        phone: item.phone,
                        follow_up_status: item.follow_up_status,
                        daysOverdue: item.daysOverdue,
                        lastContacted: item.lastContacted ? formatLastContacted(item.lastContacted) : undefined,
                        followUpReason: item.followUpReason,
                        actionLabel: item.actionLabel,
                        focusGroup: (consultants.find(c => c.id === item.id)?.focus_group || undefined),
                      });

                      return (
                        <MobileTeamAttention
                          items={coachingActions.map(toTeamItem)}
                          onSchedule={(mi) => { const o = coachingActions.find(i => i.id === mi.id); if (o) openDetailSheet(o); }}
                          onCall={(mi) => { const o = coachingActions.find(i => i.id === mi.id); if (o) openUniversalPanel(o); }}
                          onText={(mi) => { const o = coachingActions.find(i => i.id === mi.id); if (o) openUniversalPanel(o); }}
                          onNote={(mi) => { const o = coachingActions.find(i => i.id === mi.id); if (o) openUniversalPanel(o); }}
                          onOpen={(mi) => { const o = coachingActions.find(i => i.id === mi.id); if (o) navigateToItem(o); }}
                        />
                      );
                    }

                    return (
                      <Card className="border-border/50 shadow-sm">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-violet-50 dark:bg-violet-950/30">
                              <Crown className="w-4 h-4 text-violet-600" />
                            </div>
                            <CardTitle className="text-sm font-semibold text-foreground">Coaching</CardTitle>
                            <Badge variant="secondary" className="text-xs">{coachingActions.length}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="divide-y divide-border/40">
                            {coachingActions.map(item => (
                              <ActionRow
                                key={`${item.itemType}-${item.id}`}
                                item={item}
                                inlineNoteId={inlineNoteId}
                                inlineNoteText={inlineNoteText}
                                inlineNextStep={inlineNextStep}
                                inlineNoteType={inlineNoteType}
                                inlineFollowUpDate={inlineFollowUpDate}
                                setInlineNoteText={setInlineNoteText}
                                setInlineNextStep={setInlineNextStep}
                                setInlineNoteType={setInlineNoteType}
                                setInlineFollowUpDate={setInlineFollowUpDate}
                                onToggleInline={() => toggleInlineNote(item)}
                                onInlineSave={() => handleInlineSave(item)}
                                onOpenDetail={() => openDetailSheet(item)}
                                isPending={contactMutation.isPending}
                                onToggleWorkdayOverride={(val) => toggleWorkdayOverrideMutation.mutate({ item, newValue: val })}
                                onQuickLog={(type) => handleQuickLog(item, type)}
                                onOpenQuickAction={() => openUniversalPanel(item)}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* ═══ SECTION 3b: Event Tasks (DEDICATED) — hostess coaching + event prep ═══
                      Shown as its own visually distinct card so event work never duplicates
                      with general follow-ups or consultant coaching. */}
                  {!hideWorkflow && (() => {
                    const eventTaskActions = todayActions.filter(i => i.itemType === "hostess" || i.itemType === "event_task");
                    if (eventTaskActions.length === 0) return null;

                    if (isMobile) {
                      const toTeamItem = (item: ActionItem): MobileTeamItem => ({
                        id: item.id,
                        itemType: item.itemType as MobileTeamItem["itemType"],
                        name: item.name,
                        phone: item.phone,
                        follow_up_status: item.follow_up_status,
                        daysOverdue: item.daysOverdue,
                        lastContacted: item.lastContacted ? formatLastContacted(item.lastContacted) : undefined,
                        followUpReason: item.followUpReason,
                        actionLabel: item.actionLabel,
                      });

                      return (
                        <MobileTeamAttention
                          items={eventTaskActions.map(toTeamItem)}
                          onSchedule={(mi) => { const o = eventTaskActions.find(i => i.id === mi.id); if (o) openDetailSheet(o); }}
                          onCall={(mi) => { const o = eventTaskActions.find(i => i.id === mi.id); if (o) openUniversalPanel(o); }}
                          onText={(mi) => { const o = eventTaskActions.find(i => i.id === mi.id); if (o) openUniversalPanel(o); }}
                          onNote={(mi) => { const o = eventTaskActions.find(i => i.id === mi.id); if (o) openUniversalPanel(o); }}
                          onOpen={(mi) => { const o = eventTaskActions.find(i => i.id === mi.id); if (o) navigateToItem(o); }}
                        />
                      );
                    }

                    return (
                      <Card className="border-2 border-emerald-300/60 dark:border-emerald-800/60 shadow-sm bg-emerald-50/30 dark:bg-emerald-950/10">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40">
                              <CalendarCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
                            </div>
                            <CardTitle className="text-base font-bold text-emerald-900 dark:text-emerald-100 tracking-tight">Event Tasks</CardTitle>
                            <Badge className="text-xs bg-emerald-600 hover:bg-emerald-600 text-white">{eventTaskActions.length}</Badge>
                          </div>
                          <p className="text-xs text-emerald-800/70 dark:text-emerald-200/70 mt-1 ml-9">
                            Hostess coaching, event prep & event-related follow-ups
                          </p>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="divide-y divide-emerald-200/50 dark:divide-emerald-900/40">
                            {eventTaskActions.map(item => (
                              <ActionRow
                                key={`${item.itemType}-${item.id}`}
                                item={item}
                                inlineNoteId={inlineNoteId}
                                inlineNoteText={inlineNoteText}
                                inlineNextStep={inlineNextStep}
                                inlineNoteType={inlineNoteType}
                                inlineFollowUpDate={inlineFollowUpDate}
                                setInlineNoteText={setInlineNoteText}
                                setInlineNextStep={setInlineNextStep}
                                setInlineNoteType={setInlineNoteType}
                                setInlineFollowUpDate={setInlineFollowUpDate}
                                onToggleInline={() => toggleInlineNote(item)}
                                onInlineSave={() => handleInlineSave(item)}
                                onOpenDetail={() => openDetailSheet(item)}
                                isPending={contactMutation.isPending}
                                onToggleWorkdayOverride={(val) => toggleWorkdayOverrideMutation.mutate({ item, newValue: val })}
                                onQuickLog={(type) => handleQuickLog(item, type)}
                                onOpenQuickAction={() => openUniversalPanel(item)}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* ═══ SECTION 4: Today's Schedule ═══ */}
                  <Card className="border-border/50 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
                            <Calendar className="w-4 h-4 text-emerald-600" />
                          </div>
                          <CardTitle className="text-sm font-semibold text-foreground">Today's Schedule</CardTitle>
                          <Badge variant="secondary" className="text-xs">{(hideWorkflow ? 0 : todayEvents.length + todayDeliveries.length) + birthdaysToday.filter(c => !isRelationshipDone(c)).length + birthdaysOverdue.filter(c => !isRelationshipDone(c)).length}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground cursor-pointer" htmlFor="upcoming-toggle">+7d birthdays</label>
                          <Switch id="upcoming-toggle" checked={showUpcoming7} onCheckedChange={setShowUpcoming7} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {(hideWorkflow ? 0 : todayEvents.length) === 0 && (hideWorkflow ? 0 : todayDeliveries.length) === 0 && birthdaysToday.filter(c => !isRelationshipDone(c)).length === 0 && birthdaysOverdue.filter(c => !isRelationshipDone(c)).length === 0 && (!showUpcoming7 || birthdaysUpcoming.length === 0) ? (
                        <p className="text-sm text-muted-foreground py-3 text-center">Nothing scheduled today</p>
                      ) : (
                        <div className="space-y-3">
                          {!hideWorkflow && todayEvents.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> Events ({todayEvents.length})
                              </p>
                              <div className="divide-y divide-border/40">
                                {todayEvents.map((evt) => (
                                  <div key={evt.id} className="py-2 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-md px-1"
                                    onClick={() => navigate(`/events/${evt.event_id}`, { state: { from: "/follow-ups" } })}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-foreground truncate">{evt.event_id}</p>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                        {evt.event_type && <span>{evt.event_type}</span>}
                                        {evt.hostess_name && <span>• Hostess: {evt.hostess_name}</span>}
                                      </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {!hideWorkflow && todayDeliveries.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                <Truck className="w-3 h-3" /> Deliveries ({todayDeliveries.length})
                              </p>
                              <div className="divide-y divide-border/40">
                                {todayDeliveries.map((del: any) => (
                                  <div key={del.id} className="py-2 flex items-center gap-3 px-1">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">{del.customer_name || "Delivery"}</p>
                                      {del.address && <p className="text-xs text-muted-foreground truncate">{del.address}</p>}
                                      {del.notes && <p className="text-xs text-muted-foreground italic truncate">{del.notes}</p>}
                                    </div>
                                    {del.phone && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                                        <a href={`tel:${phoneForLink(del.phone)}`}><Phone className="w-3.5 h-3.5 text-primary" /></a>
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Relationship touches: birthdays + anniversaries (overdue + today + upcoming) */}
                          {(() => {
                            const activeOverdue = birthdaysOverdue.filter(c => !isRelationshipDone(c));
                            const activeToday = birthdaysToday.filter(c => !isRelationshipDone(c));
                            const completedCount = [...birthdaysToday, ...birthdaysOverdue].filter(c => isRelationshipDone(c)).length;
                            const totalActive = activeOverdue.length + activeToday.length;

                            if (totalActive === 0 && completedCount === 0 && (!showUpcoming7 || birthdaysUpcoming.length === 0)) return null;

                            const rowKey = (c: ActionItem & { _eventType?: string }) => `${c.itemType}-${c.id}-${c._eventType || "birthday"}`;

                            return (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                  <Cake className="w-3 h-3" /> Birthdays & Anniversaries ({totalActive})
                                </p>
                                <div className="space-y-1.5">
                                  {/* Overdue */}
                                  {activeOverdue.map((c) => (
                                    <BirthdayRow
                                      key={rowKey(c)}
                                      item={c}
                                      label={`Missed by ${Math.abs(c._daysUntil)}d`}
                                      isOverdue
                                      onNavigate={() => navigateToItem(c)}
                                      onAction={(type) => openContactDialog(c, type)}
                                      onDone={() => markBirthdayDone(c)}
                                    />
                                  ))}
                                  {/* Today */}
                                  {activeToday.map((c) => (
                                    <BirthdayRow
                                      key={rowKey(c)}
                                      item={c}
                                      label={c._eventType === "anniversary" ? "Today 🎉" : "Today 🎉"}
                                      onNavigate={() => navigateToItem(c)}
                                      onAction={(type) => openContactDialog(c, type)}
                                      onDone={() => markBirthdayDone(c)}
                                    />
                                  ))}
                                  {/* Completed summary */}
                                  {completedCount > 0 && (
                                    <p className="text-[10px] text-muted-foreground italic px-2 py-1">
                                      ✓ {completedCount} relationship touch{completedCount > 1 ? "es" : ""} sent
                                    </p>
                                  )}
                                  {/* Upcoming */}
                                  {showUpcoming7 && birthdaysUpcoming.map((c) => (
                                    <BirthdayRow
                                      key={rowKey(c)}
                                      item={c}
                                      label={`in ${c._daysUntil}d`}
                                      onNavigate={() => navigateToItem(c)}
                                      onAction={(type) => openContactDialog(c, type)}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Daily Scorecard removed — 6 Most Important Things is the single source of truth for daily execution. */}

                  {/* ═══ SECTION 6: Relationship Touches (Collapsed) — hidden in OOO unless overridden ═══ */}
                  {!hideWorkflow && (
                    <Collapsible open={touchesOpen} onOpenChange={setTouchesOpen}>
                      <Card className="border-border/50 shadow-sm">
                        <CollapsibleTrigger className="w-full">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-md bg-pink-50 dark:bg-pink-950/30">
                                  <Heart className="w-4 h-4 text-pink-600" />
                                </div>
                                <CardTitle className="text-sm font-semibold text-foreground">Relationship Touches</CardTitle>
                              </div>
                              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", touchesOpen && "rotate-180")} />
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-xs font-semibold text-foreground">Notes</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">Send a personal note or thank-you card</p>
                              </div>
                              <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <Gift className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-xs font-semibold text-foreground">Gifts</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">Surprise a customer or team member with a small gift</p>
                              </div>
                              <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-xs font-semibold text-foreground">Check-ins</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">Quick call or text just to say hi — no sales agenda</p>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground text-center italic">
                              Coming soon: Track and log relationship touches to strengthen connections
                            </p>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  )}
                </div>
              </TabsContent>

              {/* ===== UPCOMING TAB ===== */}
              <TabsContent value="upcoming" className="mt-4">
                <div className="space-y-4">
                  {/* Upcoming Actions */}
                  <Card className="border-border/50 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30">
                          <CalendarRange className="w-4 h-4 text-blue-600" />
                        </div>
                        <CardTitle className="text-sm font-semibold text-foreground">Upcoming Actions (Next 7 Days)</CardTitle>
                        <Badge variant="secondary" className="text-xs">{upcomingActions.length}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {upcomingActions.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">No upcoming actions this week</p>
                      ) : (
                        <div className="divide-y divide-border/40">
                          {upcomingActions.map((item) => (
                            <div key={`${item.itemType}-${item.id}`} className="py-2.5 flex items-center gap-3 group">
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetailSheet(item)}>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", TYPE_BADGE[item.itemType].className)}>
                                    {TYPE_BADGE[item.itemType].label}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                  <span>{item.actionLabel}</span>
                                  <span>• {formatDateOnly(item.next_follow_up, "EEE, MMM d")}</span>
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetailSheet(item)}>
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Upcoming Events */}
                  <Card className="border-border/50 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
                          <Calendar className="w-4 h-4 text-emerald-600" />
                        </div>
                        <CardTitle className="text-sm font-semibold text-foreground">Upcoming Events (Next 7 Days)</CardTitle>
                        <Badge variant="secondary" className="text-xs">{upcomingEvents.length}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {upcomingEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">No upcoming events this week</p>
                      ) : (
                        <div className="divide-y divide-border/40">
                          {upcomingEvents.map((evt) => (
                            <div key={evt.id} className="py-2.5 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-md px-1"
                              onClick={() => navigate(`/events/${evt.event_id}`)}>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{evt.event_id}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                  {evt.event_type && <span>{evt.event_type}</span>}
                                  {evt.hostess_name && <span>• Hostess: {evt.hostess_name}</span>}
                                  <span>• {formatDateOnly(evt.event_date, "EEE, MMM d")}</span>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Log Contact Dialog */}
        <Dialog open={!!actionItem} onOpenChange={(open) => !open && setActionItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">
                Log Contact — {actionItem?.name}
                {actionItem && actionItem.itemType !== "customer" && (
                  <span className={cn("ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium align-middle", TYPE_BADGE[actionItem.itemType].className)}>
                    {TYPE_BADGE[actionItem.itemType].label}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            {actionItem && (
              <div className="flex gap-2">
                {actionItem.phone && (
                  <>
                    <Button variant="outline" size="sm" asChild><a href={`tel:${phoneForLink(actionItem.phone)}`}><Phone className="w-3.5 h-3.5 mr-1" />Call</a></Button>
                    <TextActionButton phone={actionItem.phone} trigger="labeled" />
                  </>
                )}
                {actionItem.email && (
                  <Button variant="outline" size="sm" asChild><a href={`mailto:${actionItem.email}`} onClick={(e) => openEmail(actionItem.email!, e)}><Mail className="w-3.5 h-3.5 mr-1" />Email</a></Button>
                )}
              </div>
            )}
            <div className="space-y-3">
              {/* Quick-tap activity type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {["Call", "Text", "Email", "In Person"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNoteType(type)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                        noteType === type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea placeholder="Add a note (optional)..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-[60px]" />
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {actionItem?.itemType === "consultant" ? "Next Coaching Date" : "Next Follow-Up Date"} (optional)
                </label>
                <Input type="date" value={followUpDate} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setFollowUpDate(e.target.value)} className="h-9" />
              </div>
              <Button className="w-full" onClick={handleSubmitAction} disabled={contactMutation.isPending}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {contactMutation.isPending ? "Saving..." : "Mark Contacted"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Universal Action Panel */}
        <UniversalActionPanel
          item={universalPanelItem}
          open={universalPanelOpen}
          onClose={() => { setUniversalPanelOpen(false); setUniversalPanelItem(null); setUniversalRescheduleEvent(null); }}
          onLogAction={handleUniversalAction}
          onSkip={handleUniversalSkip}
          onNavigateToProfile={(uItem) => {
            const ai: ActionItem = { id: uItem.id, itemType: uItem.personType, name: uItem.name, phone: uItem.phone, email: uItem.email, next_follow_up: null, follow_up_status: "", actionLabel: "" };
            navigateToItem(ai);
          }}
          isPending={contactMutation.isPending || skipFollowUpMutation.isPending}
        />

        {/* Detail Sheet */}
        <Sheet open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
          <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
            <SheetHeader className="p-6 pb-4 border-b border-border">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg">{detailItem?.name}</SheetTitle>
                {detailItem && (
                  <Button variant="outline" size="sm" onClick={() => navigateToItem(detailItem)}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />Full Profile
                  </Button>
                )}
              </div>
              {detailItem && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-medium", TYPE_BADGE[detailItem.itemType].className)}>
                    {TYPE_BADGE[detailItem.itemType].label}
                  </span>
                  {detailItem.follow_up_status === "OVERDUE" && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">
                      Overdue {detailItem.daysOverdue ? `${detailItem.daysOverdue}d` : ""}
                    </span>
                  )}
                  {detailItem.follow_up_status === "TODAY" && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Due Today</span>
                  )}
                  {detailItem.vip === "VIP" && <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">VIP</span>}
                  {detailItem.activity_status && <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{detailItem.activity_status}</span>}
                  {detailItem.followUpReason && <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">{detailItem.followUpReason}</span>}
                </div>
              )}
              {detailItem && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                  {detailItem.phone && <span>📱 {detailItem.phone}</span>}
                  {detailItem.email && <span>✉️ {detailItem.email}</span>}
                  {detailItem._address && <span>📍 {detailItem._address}</span>}
                  {detailItem._relationship_status && <span>🏷️ {detailItem._relationship_status}</span>}
                  {detailItem.lastContacted && <span>Last contact: {formatLastContacted(detailItem.lastContacted)}</span>}
                  {detailItem.days_since_last_order != null && <span>{detailItem.days_since_last_order}d since last order</span>}
                  {detailItem.next_follow_up && <span>Next FU: {formatDateOnly(detailItem.next_follow_up, "MMM d")}</span>}
                </div>
              )}
              {detailItem && (
                <div className="flex gap-2 mt-3">
                  {detailItem.phone && (
                    <>
                      <Button variant="outline" size="sm" className="h-8 text-xs" asChild><a href={`tel:${detailItem.phone}`}><Phone className="w-3 h-3 mr-1" />Call</a></Button>
                      <TextActionButton phone={detailItem.phone} trigger="labeled" className="h-8 text-xs" />
                    </>
                  )}
                  {detailItem.email && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" asChild><a href={`mailto:${detailItem.email}`} onClick={(e) => openEmail(detailItem.email!, e)}><Mail className="w-3 h-3 mr-1" />Email</a></Button>
                  )}
                </div>
              )}
            </SheetHeader>
            <ScrollArea className="flex-1 p-6">
              {/* Consultant inline edit panel */}
              {detailItem?.itemType === "consultant" ? (
                <ConsultantEditPanel
                  item={detailItem}
                  consultants={consultants}
                  queryClient={queryClient}
                  onClose={() => setDetailItem(null)}
                />
              ) : detailItem?.itemType === "lead" ? (
                <LeadEditPanel
                  item={detailItem}
                  bookingLeads={bookingLeads}
                  queryClient={queryClient}
                  onClose={() => setDetailItem(null)}
                />
              ) : detailItem?.itemType === "customer" ? (
                <CustomerEditPanel
                  item={detailItem}
                  customers={customers}
                  enrichedCustomers={enrichedCustomers}
                  queryClient={queryClient}
                  onClose={() => setDetailItem(null)}
                  detailNotes={detailNotes}
                  scheduleDelivery={scheduleDelivery}
                  setScheduleDelivery={setScheduleDelivery}
                  deliveryDate={deliveryDate}
                  setDeliveryDate={setDeliveryDate}
                  deliveryNotes={deliveryNotes}
                  setDeliveryNotes={setDeliveryNotes}
                  deliveryCreateMut={deliveryCreateMut}
                />
              ) : (
                <>
                  {/* Update date */}
                  <div className="mb-6 p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <CalendarRange className="w-3 h-3" />
                      Next Follow-Up Date
                    </label>
                    <div className="flex gap-2">
                      <Input type="date" value={detailFollowUpDate} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDetailFollowUpDate(e.target.value)} className="h-9 flex-1" />
                      <Button size="sm" onClick={() => detailFollowUpMutation.mutate()} disabled={detailFollowUpMutation.isPending || !detailFollowUpDate}>
                        {detailFollowUpMutation.isPending ? "Saving..." : "Update"}
                      </Button>
                    </div>
                  </div>

                  {/* Add note */}
                  <div className="mb-6 p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> Add Note</label>
                    <Textarea placeholder="Enter note..." value={detailNoteText} onChange={(e) => setDetailNoteText(e.target.value)} className="min-h-[60px]" />
                    <Button size="sm" onClick={() => detailNoteMutation.mutate()} disabled={detailNoteMutation.isPending || !detailNoteText.trim()}>
                      {detailNoteMutation.isPending ? "Saving..." : "Save Note"}
                    </Button>
                  </div>

                  {/* Notes Timeline (Prospects) */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notes History</h4>
                    {detailProspectNotes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
                    ) : (
                      <div className="space-y-2">
                        {detailProspectNotes.map((note) => (
                          <div key={note.id} className="p-3 rounded-lg bg-muted/30 border border-border/40">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(note.created_at).toLocaleDateString()} {new Date(note.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{note.note_text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* Fresh Start Dialog — reschedule today's backlog forward */}
        <Dialog open={showFreshStart} onOpenChange={setShowFreshStart}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary" /> Fresh Start
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will move <strong>all {todayActions.filter(i => i.follow_up_status === "OVERDUE" || i.follow_up_status === "TODAY").length} current Today &amp; Overdue follow-ups</strong> forward and stagger them across the next several workdays. No data is deleted — you can Undo right after.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Spread across</label>
                <div className="flex gap-2">
                  {(["7", "14", "30"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setFreshStartDays(d)}
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all",
                        freshStartDays === d
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/50"
                      )}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                <p>• Items spread starting tomorrow, distributed across workdays.</p>
                <p>• All history, notes, and relationships are preserved.</p>
                <p>• Undo button appears after the reset.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowFreshStart(false)}>Cancel</Button>
                <Button
                  className="flex-1"
                  disabled={freshStartMutation.isPending}
                  onClick={() => freshStartMutation.mutate(parseInt(freshStartDays, 10))}
                >
                  {freshStartMutation.isPending ? "Resetting…" : `Reset ${todayActions.filter(i => i.follow_up_status === "OVERDUE" || i.follow_up_status === "TODAY").length} follow-ups`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Distribute Dialog */}
        <Dialog open={showDistribute} onOpenChange={(open) => { setShowDistribute(open); if (!open) { setDistributeStep("configure"); setDistributeSelectedIds(new Set()); } }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-base">Distribute Follow-Ups</DialogTitle></DialogHeader>
            {distributeStep === "configure" ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select group</label>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { value: "overdue-today" as const, label: "Overdue + Today" },
                      { value: "no-date" as const, label: "No follow-up date" },
                      { value: "dormant-warm" as const, label: "Dormant + Warm" },
                    ]).map((opt) => (
                      <Button key={opt.value} variant={distributeFilter === opt.value ? "default" : "outline"} size="sm" className="h-7 text-xs"
                        onClick={() => { setDistributeFilter(opt.value); setDistributeSelectedIds(new Set()); setDistributeStep("configure"); }}>
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Spread across how many days?</label>
                  <Input type="number" min="1" max="365" value={distributeDays} onChange={(e) => setDistributeDays(e.target.value)} className="h-9 w-32" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{distributeCandidates.length} customers found · {distributeSelectedIds.size} selected</span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setDistributeSelectedIds(new Set(distributeCandidates.map((c) => c.id)))}>Select All</Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setDistributeSelectedIds(new Set())}>Clear</Button>
                    </div>
                  </div>
                  <div className="border border-border rounded-md max-h-48 overflow-y-auto">
                    {distributeCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4 text-center">No customers match this filter</p>
                    ) : distributeCandidates.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer">
                        <Checkbox checked={distributeSelectedIds.has(c.id)} onCheckedChange={() => {
                          setDistributeSelectedIds((prev) => { const next = new Set(prev); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next; });
                        }} />
                        <span className="text-sm text-foreground truncate">{c.full_name}</span>
                        {c.activity_status && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium ml-auto shrink-0">{c.activity_status}</span>}
                      </label>
                    ))}
                  </div>
                </div>
                {distributeSelectedIds.size > 0 && (
                  <div className="bg-muted/50 rounded-md p-3">
                    <p className="text-sm text-foreground"><span className="font-semibold">{distributeSelectedIds.size}</span> customers across <span className="font-semibold">{distributeDays}</span> days = ~<span className="font-semibold">{perDay}</span> per day</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Starting tomorrow</p>
                  </div>
                )}
                <Button className="w-full" disabled={distributeSelectedIds.size === 0} onClick={() => setDistributeStep("preview")}>Preview Distribution</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-md p-3">
                  <p className="text-sm text-foreground"><span className="font-semibold">{distributePreview.length}</span> follow-ups across <span className="font-semibold">{distributeDays}</span> days (~{perDay}/day)</p>
                </div>
                <div className="border border-border rounded-md max-h-60 overflow-y-auto">
                  {distributePreview.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-sm border-b border-border/50 last:border-b-0">
                      <span className="text-foreground truncate">{p.name}</span>
                      <span className="text-muted-foreground text-xs shrink-0 ml-2">{formatDateOnly(p.date)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDistributeStep("configure")}>Back</Button>
                  <Button className="flex-1" onClick={() => distributeMutation.mutate()} disabled={distributeMutation.isPending}>
                    {distributeMutation.isPending ? "Distributing..." : "Apply Distribution"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Reschedule Activity Log Dialog */}
        <Dialog open={!!rescheduleActivityEvent} onOpenChange={(open) => { if (!open) { setRescheduleActivityEvent(null); setRescheduleStep("log"); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {rescheduleStep === "log" ? "Log Reschedule Activity" : "Confirm Next Step"}
              </DialogTitle>
            </DialogHeader>
            {rescheduleActivityEvent && rescheduleStep === "log" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {rescheduleActivityEvent.hostess_name} — {rescheduleActivityEvent.event_type || "Event"} (Attempt #{(rescheduleActivityEvent.reschedule_attempt_number || 0) + 1})
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Activity Type</label>
                  <Select value={rescheduleNoteType} onValueChange={setRescheduleNoteType}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Call", "Text", "Email", "In Person"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
                  <Textarea className="text-xs mt-1 min-h-[60px]" placeholder="Left voicemail, sent text..." value={rescheduleNoteText} onChange={(e) => setRescheduleNoteText(e.target.value)} />
                </div>
                <Button className="w-full" onClick={() => setRescheduleStep("confirm")}>Continue to Confirm</Button>
              </div>
            )}
            {rescheduleActivityEvent && rescheduleStep === "confirm" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Activity: <strong>{rescheduleNoteType}</strong> — Attempt #{(rescheduleActivityEvent.reschedule_attempt_number || 0) + 1}
                </p>
                {(rescheduleActivityEvent.reschedule_attempt_number || 0) + 1 >= 5 ? (
                  <p className="text-sm text-destructive font-medium">This is attempt #5. No further auto-scheduling. You will need to choose a manual next step.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Next follow-up will be auto-scheduled in {RESCHEDULE_CADENCE_DAYS[(rescheduleActivityEvent.reschedule_attempt_number || 0)]} day(s).
                  </p>
                )}
                <Button
                  className="w-full"
                  disabled={rescheduleLogMutation.isPending}
                  onClick={() => rescheduleLogMutation.mutate({ event: rescheduleActivityEvent, noteType: rescheduleNoteType, noteText: rescheduleNoteText })}
                >
                  {rescheduleLogMutation.isPending ? "Saving..." : "Confirm Next Step"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Set New Date Dialog */}
        <Dialog open={!!setNewDateEvent} onOpenChange={(open) => { if (!open) setSetNewDateEvent(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Set New Event Date</DialogTitle>
            </DialogHeader>
            {setNewDateEvent && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Rebook <strong>{setNewDateEvent.hostess_name || setNewDateEvent.event_id}</strong> — {setNewDateEvent.event_type || "Event"}
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">New Event Date</label>
                  <Input type="date" className="h-8 text-xs mt-1" value={newEventDate} min={toLocalDateKey()} onChange={(e) => setNewEventDate(e.target.value)} />
                </div>
                <Button
                  className="w-full"
                  disabled={!newEventDate || rescheduleSetNewDateMutation.isPending}
                  onClick={() => rescheduleSetNewDateMutation.mutate({ event: setNewDateEvent, newDate: newEventDate })}
                >
                  {rescheduleSetNewDateMutation.isPending ? "Rebooking..." : "Rebook Event"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Manual Next Step Dialog (Attempt 5+) */}
        <Dialog open={!!manualNextStepEvent} onOpenChange={(open) => { if (!open) setManualNextStepEvent(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Choose Next Step</DialogTitle>
            </DialogHeader>
            {manualNextStepEvent && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  <strong>{manualNextStepEvent.hostess_name || manualNextStepEvent.event_id}</strong> has reached 5 reschedule attempts. Choose what to do next:
                </p>
                <Button className="w-full" variant="default" onClick={() => { setManualNextStepEvent(null); setSetNewDateEvent(manualNextStepEvent); setNewEventDate(""); }}>
                  <CalendarCheck className="w-4 h-4 mr-2" /> Reschedule (Set New Date)
                </Button>
                <Button className="w-full" variant="outline" disabled={rescheduleToNurtureMutation.isPending} onClick={() => rescheduleToNurtureMutation.mutate(manualNextStepEvent)}>
                  Move to Nurture Follow-Up
                </Button>
                <Button className="w-full" variant="secondary" disabled={rescheduleArchiveMutation.isPending} onClick={() => rescheduleArchiveMutation.mutate(manualNextStepEvent)}>
                  Archive / Stop Follow-Up
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// ─── Consultant Edit Panel (inline in detail sheet) ───

function ConsultantEditPanel({ item, consultants, queryClient, onClose }: {
  item: ActionItem;
  consultants: TeamConsultant[];
  queryClient: ReturnType<typeof useQueryClient>;
  onClose: () => void;
}) {
  const consultant = consultants.find((c) => c.id === item.id);
  const [focusGroup, setFocusGroup] = useState(consultant?.focus_group || "General");
  const [coachingFocus, setCoachingFocus] = useState(consultant?.coaching_focus || "");
  const [nextCoachingDate, setNextCoachingDate] = useState(consultant?.next_coaching_date || "");
  const [notes, setNotes] = useState(consultant?.notes || "");
  const [saving, setSaving] = useState(false);

  // Cadence info for New Consultants
  const cadence = useMemo(() => {
    if (focusGroup !== "New Consultant") return null;
    return getCadenceInfo(consultant?.join_date);
  }, [focusGroup, consultant?.join_date]);

  // Auto-populate coaching date for New Consultant if empty
  useEffect(() => {
    if (focusGroup === "New Consultant" && !nextCoachingDate && consultant?.join_date) {
      const autoDate = getNextCoachingDate(consultant.join_date, null);
      if (autoDate) setNextCoachingDate(autoDate);
    }
  }, [focusGroup, consultant?.join_date, nextCoachingDate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTeamConsultant(item.id, {
        focus_group: focusGroup,
        coaching_focus: coachingFocus || null,
        next_coaching_date: nextCoachingDate || null,
        notes: notes || null,
      });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      toast.success("Consultant updated");
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const handleMarkComplete = async () => {
    setSaving(true);
    try {
      let nextDate: string | null;
      if (focusGroup === "New Consultant" && consultant?.join_date) {
        nextDate = getNextCoachingDate(consultant.join_date, nextCoachingDate || null);
      } else {
        nextDate = nextCoachingDate
          ? format(addDays(parseLocalDate(nextCoachingDate), 7), "yyyy-MM-dd")
          : format(addDays(new Date(), 7), "yyyy-MM-dd");
      }

      const cadenceLabel = cadence ? ` (${cadence.label})` : "";
      await updateTeamConsultant(item.id, {
        focus_group: focusGroup,
        coaching_focus: coachingFocus || null,
        next_coaching_date: nextDate,
        notes: notes || null,
      });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      toast.success(`Coaching complete — next: ${nextDate ? formatDateOnly(nextDate) : "none"}${cadenceLabel}`);
      onClose();
    } catch { toast.error("Failed to update"); }
    setSaving(false);
  };

  const handleSnooze = async (days: number) => {
    setSaving(true);
    try {
      const snoozed = snoozeCoachingDate(nextCoachingDate || null, days);
      setNextCoachingDate(snoozed);
      await updateTeamConsultant(item.id, { next_coaching_date: snoozed });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      toast.success(`Snoozed ${days} days → ${formatDateOnly(snoozed)}`);
    } catch { toast.error("Failed to snooze"); }
    setSaving(false);
  };

  const completeLabel = cadence && cadence.phase !== "graduated"
    ? `Mark Complete (+${cadence.daysBetweenSessions}d)`
    : "Mark Coaching Complete (+7 days)";

  return (
    <div className="space-y-5">
      {/* Cadence Info Badge */}
      {cadence && cadence.phase !== "graduated" && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-1">
          <p className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1">
            <CalendarCheck className="w-3 h-3" /> Auto Coaching Cadence
          </p>
          <p className="text-sm font-medium">{cadence.label}</p>
          <p className="text-xs text-muted-foreground">Day {cadence.daysSinceStart} since start • {cadence.sessionsPerWeek}x/week</p>
        </div>
      )}
      {cadence && cadence.phase === "graduated" && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cadence Graduated</p>
          <p className="text-xs text-muted-foreground">Day {cadence.daysSinceStart} — consider moving to Key or General.</p>
        </div>
      )}

      {/* Focus Group */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Focus Group</label>
        <Select value={focusGroup} onValueChange={setFocusGroup}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FOCUS_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Coaching Focus */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Coaching Focus</label>
        <Select value={coachingFocus || "none"} onValueChange={(v) => setCoachingFocus(v === "none" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select focus..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {COACHING_FOCUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Next Coaching Date */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <CalendarRange className="w-3 h-3" /> Next Coaching Date
        </label>
        <Input type="date" value={nextCoachingDate} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setNextCoachingDate(e.target.value)} className="h-9" />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <FileText className="w-3 h-3" /> Notes
        </label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Coaching notes..." className="min-h-[100px]" />
      </div>

      {/* Save button */}
      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>

      {/* Mark Complete button */}
      <Button variant="outline" className="w-full gap-1.5" onClick={handleMarkComplete} disabled={saving}>
        <CheckCircle2 className="w-4 h-4" />
        {completeLabel}
      </Button>

      {/* Snooze / Skip (for non-responsive consultants) */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snooze / Skip</label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => handleSnooze(3)} disabled={saving}>+3 days</Button>
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => handleSnooze(7)} disabled={saving}>+1 week</Button>
          <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => handleSnooze(14)} disabled={saving}>+2 weeks</Button>
        </div>
      </div>

      {/* Info */}
      {consultant && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Details</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {consultant.onboarding_stage && focusGroup !== "General" && <div><span className="text-muted-foreground text-xs">Growth Stage:</span> <span className="font-medium">{consultant.onboarding_stage}</span></div>}
            {consultant.join_date && <div><span className="text-muted-foreground text-xs">Start Date:</span> <span className="font-medium">{formatDateOnly(consultant.join_date)}</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Customer Edit Panel (unified activity + next step flow) ───

const CUSTOMER_ACTIVITY_TYPES = ["Call", "Text", "Email", "Delivery", "Reorder Conversation", "Did Not Connect"] as const;

const FOLLOW_UP_TYPES = ["Quick Follow-Up", "Standard Follow-Up", "Reorder Cycle"] as const;
type FollowUpType = typeof FOLLOW_UP_TYPES[number];

function getFollowUpDaysForType(followUpType: FollowUpType, activityStatus: string | undefined, dormantStage: string | null | undefined): { days: number; label: string } {
  if (followUpType === "Quick Follow-Up") {
    return { days: 2, label: "Quick Follow-Up (2 days)" };
  }
  if (followUpType === "Standard Follow-Up") {
    return { days: 7, label: "Standard Follow-Up (7 days)" };
  }
  // Reorder Cycle — use activity-based long cadence
  if (activityStatus === "Dormant") {
    const stage = (dormantStage || "Stage 1") as DormantStage;
    if (stage === "Stage 3" || stage === "Annual") {
      return { days: 365, label: "Reorder Cycle — Annual (1 year)" };
    }
    return { days: 5, label: "Dormant cadence (5 days)" };
  }
  if (activityStatus === "Warm") {
    return { days: 45, label: "Reorder Cycle (45 days)" };
  }
  if (activityStatus === "Active") {
    return { days: 75, label: "Reorder Cycle (75 days)" };
  }
  return { days: 90, label: "Reorder Cycle (90 days)" };
}

function getCustomerAutoFollowUpDays(activityStatus: string | undefined, dormantStage: string | null | undefined): { days: number; label: string } {
  // Default to Quick Follow-Up
  return getFollowUpDaysForType("Quick Follow-Up", activityStatus, dormantStage);
}

function getSkipRetryDays(activityStatus: string | undefined): { days: number; label: string } {
  if (activityStatus === "Dormant") return { days: 4, label: "Retry in 4 days (Dormant)" };
  if (activityStatus === "Warm") return { days: 7, label: "Retry in 7 days (Warm)" };
  if (activityStatus === "Active") return { days: 14, label: "Retry in 14 days (Active)" };
  return { days: 7, label: "Retry in 7 days" };
}

function CustomerEditPanel({ item, customers, enrichedCustomers, queryClient, onClose, detailNotes, scheduleDelivery, setScheduleDelivery, deliveryDate, setDeliveryDate, deliveryNotes, setDeliveryNotes, deliveryCreateMut }: {
  item: ActionItem;
  customers: Customer[];
  enrichedCustomers: Enriched[];
  queryClient: ReturnType<typeof useQueryClient>;
  onClose: () => void;
  detailNotes: CustomerNote[];
  scheduleDelivery: boolean;
  setScheduleDelivery: (v: boolean) => void;
  deliveryDate: string;
  setDeliveryDate: (v: string) => void;
  deliveryNotes: string;
  setDeliveryNotes: (v: string) => void;
  deliveryCreateMut: ReturnType<typeof useMutation<void, Error, void>>;
}) {
  const customer = customers.find((c) => c.id === item.id);
  const enriched = enrichedCustomers.find((c) => c.id === item.id);
  const isDormant = item.activity_status === "Dormant";
  const currentDormantStage = (item.dormant_follow_up_stage || null) as DormantStage;

  const [followUpType, setFollowUpType] = useState<FollowUpType>("Quick Follow-Up");

  const [activityType, setActivityType] = useState<string>("Call");
  const [newNote, setNewNote] = useState("");
  const [nextStepText, setNextStepText] = useState("");
  const [saving, setSaving] = useState(false);
  const [activityLogged, setActivityLogged] = useState(false);
  const nextStepConfirmed = false;
  const [loggedMessage, setLoggedMessage] = useState("");
  const [skipNote, setSkipNote] = useState("");
  const [didNotConnect, setDidNotConnect] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [isBookingAttempt, setIsBookingAttempt] = useState(false);
  const [isFollowUpFlag, setIsFollowUpFlag] = useState(true);
  const nextFollowUpRef = useRef<HTMLInputElement>(null);

  // Fetch active catalog follow-ups for this customer
  const { data: catalogFollowUps = [] } = useQuery({
    queryKey: ["catalog-followups", item.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_campaign_customers" as any)
        .select("*, catalog_campaigns:campaign_id(campaign_type, mailing_date)")
        .eq("customer_id", item.id)
        .eq("follow_up_completed", false);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Find the earliest pending catalog follow-up
  const catalogFollowUp = useMemo(() => {
    if (catalogFollowUps.length === 0) return null;
    const sorted = [...catalogFollowUps]
      .filter((cf: any) => cf.follow_up_date)
      .sort((a: any, b: any) => a.follow_up_date.localeCompare(b.follow_up_date));
    return sorted[0] || null;
  }, [catalogFollowUps]);

  const autoInfo = useMemo(() => getFollowUpDaysForType(followUpType, item.activity_status, currentDormantStage), [followUpType, item.activity_status, currentDormantStage]);

  // Determine initial next follow-up: catalog takes priority if earlier
  const [nextFollowUp, setNextFollowUp] = useState(() => {
    const cadenceDate = format(addDays(new Date(), 2), "yyyy-MM-dd"); // Default: Quick Follow-Up
    const existingDate = customer?.next_follow_up_date && compareDateOnly(customer.next_follow_up_date) === 1
      ? customer.next_follow_up_date : cadenceDate;
    return existingDate;
  });

  // Update date when follow-up type changes
  useEffect(() => {
    if (followUpSource !== "manual" && followUpSource !== "catalog") {
      const newDate = format(addDays(new Date(), autoInfo.days), "yyyy-MM-dd");
      setNextFollowUp(newDate);
      setFollowUpSource("cadence");
    }
  }, [followUpType]);

  const [followUpSource, setFollowUpSource] = useState<"cadence" | "catalog" | "manual">("cadence");

  // Once catalog data loads, check if it should take priority
  useEffect(() => {
    if (catalogFollowUp && catalogFollowUp.follow_up_date) {
      const catalogDate = catalogFollowUp.follow_up_date;
      if (!nextFollowUp || catalogDate < nextFollowUp) {
        setNextFollowUp(catalogDate);
        setFollowUpSource("catalog");
      }
    }
  }, [catalogFollowUp]);

  const catalogType = catalogFollowUp?.catalog_campaigns?.campaign_type;

  const handleLogActivity = async () => {
    const isDidNotConnect = activityType === "Did Not Connect";
    if (!isDidNotConnect && !newNote.trim()) {
      toast.error("Please add a note about what happened");
      return;
    }
    setSaving(true);
    try {
      const today = toLocalDateKey();

      let autoNextDate: string;
      let nextStage = currentDormantStage;
      let cadenceLabel: string;

      if (isDidNotConnect) {
        // Did Not Connect uses shorter retry intervals
        const retryInfo = getSkipRetryDays(item.activity_status);
        autoNextDate = format(addDays(new Date(), retryInfo.days), "yyyy-MM-dd");
        cadenceLabel = retryInfo.label;
      } else if (isDormant) {
        const effectiveStage = currentDormantStage || "Stage 1";
        nextStage = getNextDormantStage(effectiveStage);
        autoNextDate = getNextDormantFollowUpDate(effectiveStage);
        cadenceLabel = getDormantStageLabel(nextStage);
      } else {
        const info = getCustomerAutoFollowUpDays(item.activity_status, currentDormantStage);
        autoNextDate = format(addDays(new Date(), info.days), "yyyy-MM-dd");
        cadenceLabel = info.label;
      }

      // Check if catalog follow-up is earlier (only for non-DNC)
      let effectiveDate = autoNextDate;
      let effectiveSource: "cadence" | "catalog" = "cadence";
      let effectiveLabel = cadenceLabel;
      if (!isDidNotConnect && catalogFollowUp?.follow_up_date && catalogFollowUp.follow_up_date < autoNextDate) {
        effectiveDate = catalogFollowUp.follow_up_date;
        effectiveSource = "catalog";
        effectiveLabel = `${catalogType} Catalog Follow-Up`;
      }

      const updates: Record<string, any> = {
        last_contacted: today,
        next_follow_up_date: effectiveDate,
        follow_up_reason: isDidNotConnect
          ? "Did not connect — retry scheduled"
          : effectiveSource === "catalog" ? `${catalogType} Catalog Follow-Up` : cadenceLabel,
      };
      if (!isDidNotConnect && isDormant) {
        updates.dormant_follow_up_stage = nextStage;
      }

      await updateCustomer(item.id, updates as any);
      const noteText = isDidNotConnect
        ? (newNote.trim() || "Did not connect — attempted contact")
        : newNote.trim();
      await logCustomerActivity({ customerId: item.id, noteType: activityType, noteText, nextStep: nextStepText.trim(), nextFollowUpDate: effectiveDate, isBookingAttempt, isFollowUp: isFollowUpFlag });

      setNextFollowUp(effectiveDate);
      setFollowUpSource(effectiveSource);
      setNewNote("");
      setActivityLogged(true);
      if (isDidNotConnect) setDidNotConnect(true);
      setLoggedMessage(
        isDidNotConnect
          ? `Attempt logged ✓ Retry auto-set to ${formatDateOnly(effectiveDate)} — ${effectiveLabel}`
          : `Activity logged ✓ Next follow-up auto-set to ${formatDateOnly(effectiveDate)} — ${effectiveLabel}`
      );

      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes", item.id] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["focus-daily-progress"] });

      setTimeout(() => nextFollowUpRef.current?.focus(), 100);
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const handleSkipped = async () => {
    setSaving(true);
    try {
      const retryInfo = getSkipRetryDays(item.activity_status);
      const retryDate = format(addDays(new Date(), retryInfo.days), "yyyy-MM-dd");

      // Do NOT update last_contacted — no outreach was attempted
      const updates: Record<string, any> = {
        next_follow_up_date: retryDate,
        follow_up_reason: "Skipped — rescheduled",
      };
      await updateCustomer(item.id, updates as any);

      // Log optional note if provided (as a non-contact note type)
      if (skipNote.trim()) {
        await logCustomerActivity({ customerId: item.id, noteType: "Other", noteText: `Skipped: ${skipNote.trim()}`, nextFollowUpDate: retryDate });
      }

      setNextFollowUp(retryDate);
      setFollowUpSource("manual");
      setSkipped(true);
      setActivityLogged(true);
      setLoggedMessage(`Skipped — next follow-up auto-set to ${formatDateOnly(retryDate)} (${retryInfo.label})`);

      queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (skipNote.trim()) {
        queryClient.invalidateQueries({ queryKey: ["all-notes"] });
        queryClient.invalidateQueries({ queryKey: ["customer-notes", item.id] });
      }

      setTimeout(() => nextFollowUpRef.current?.focus(), 100);
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const handleSaveNextStep = async () => {
    if (!activityLogged) {
      toast.error("Please log activity first, or skip this follow-up");
      return;
    }
    setSaving(true);
    try {
      const reason = skipped
        ? "Skipped — rescheduled"
        : didNotConnect
        ? "Did not connect — retry scheduled"
        : followUpSource === "catalog" && catalogType
        ? `${catalogType} Catalog Follow-Up`
        : followUpSource === "manual" ? "Manual follow-up" : `${followUpType} — ${autoInfo.label}`;
      await updateCustomer(item.id, { next_follow_up_date: nextFollowUp || null, follow_up_reason: reason } as any);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      toast.success("Follow-up complete ✓");
      onClose();
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const todayFormatted = format(new Date(), "MMMM d, yyyy");

  const followUpReasonLabel = useMemo(() => {
    if (!nextFollowUp) return null;
    if (followUpSource === "catalog" && catalogType) {
      return `${catalogType} Catalog Follow-Up — ${formatDateOnly(nextFollowUp)}`;
    }
    if (followUpSource === "manual") {
      return `Manually set to ${formatDateOnly(nextFollowUp)}`;
    }
    return `${autoInfo.label} — ${formatDateOnly(nextFollowUp)}`;
  }, [nextFollowUp, followUpSource, catalogType, autoInfo]);

  return (
    <div className="space-y-6">
      {/* Dormant Cadence Info */}
      {isDormant && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-1">
          <p className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1">
            <CalendarCheck className="w-3 h-3" /> Dormant Follow-Up Cadence
          </p>
          <p className="text-sm font-medium text-foreground">
            {getDormantStageLabel(currentDormantStage)}
          </p>
          <p className="text-xs text-muted-foreground">
            Logging activity will auto-advance to next touch
            {currentDormantStage === "Stage 3" || currentDormantStage === "Annual" ? " (1 year)" : " (5 days)"}
          </p>
        </div>
      )}

      {/* Catalog follow-up priority notice */}
      {catalogFollowUp && (
        <div className="p-3 rounded-lg bg-accent/50 border border-accent space-y-1">
          <p className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1">
            📬 Active Catalog Follow-Up
          </p>
          <p className="text-sm font-medium text-foreground">
            {catalogType} Catalog — due {formatDateOnly(catalogFollowUp.follow_up_date)}
          </p>
          <p className="text-xs text-muted-foreground">
            This catalog follow-up takes priority over normal cadence
          </p>
        </div>
      )}

      {/* Completion banner */}
      {activityLogged && nextStepConfirmed && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Follow-up cycle complete ✓ You can close this panel.
        </div>
      )}

      {/* Activity logged but next step not confirmed */}
      {activityLogged && !nextStepConfirmed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          {skipped ? "Skipped" : didNotConnect ? "Attempt noted" : "Activity logged"} — please confirm the next step below to complete this follow-up
        </div>
      )}

      {/* Success message */}
      {activityLogged && loggedMessage && !nextStepConfirmed && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {loggedMessage}
        </div>
      )}

      {/* ── SECTION 1: Log Today's Activity ── */}
      <div className={cn("rounded-lg border bg-card p-4 space-y-3", activityLogged ? "border-green-200 dark:border-green-800 opacity-75" : "border-border")}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Log Today's Activity
            {activityLogged && <CheckCircle2 className="w-4 h-4 text-green-600" />}
          </h3>
          <span className="text-xs text-muted-foreground">Today — {todayFormatted}</span>
        </div>

        {!activityLogged && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity Type</label>
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CUSTOMER_ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3 h-3" /> What Happened <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Brief conversation summary — what was discussed?"
                className="min-h-[70px]"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                ➡️ Next Step
              </label>
              <Input
                value={nextStepText}
                onChange={(e) => setNextStepText(e.target.value)}
                placeholder="e.g., Send samples, Follow up on reorder, Schedule facial..."
                className="h-9"
              />
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={isFollowUpFlag} onCheckedChange={(v) => setIsFollowUpFlag(!!v)} />
                <span className="text-muted-foreground">Follow-Up</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={isBookingAttempt} onCheckedChange={(v) => setIsBookingAttempt(!!v)} />
                <span className="text-muted-foreground">Booking Attempt</span>
              </label>
            </div>

            <Button className="w-full" onClick={handleLogActivity} disabled={saving || (activityType !== "Did Not Connect" && !newNote.trim())}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {saving ? "Saving..." : activityType === "Did Not Connect" ? "Log Attempt" : "Log Activity"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              {activityType === "Did Not Connect"
                ? "Counts as a reach out attempt · updates last contacted · uses shorter retry interval"
                : "Logging updates last contacted and auto-sets next follow-up"}
            </p>
          </>
        )}
      </div>

      {/* ── Skip (no outreach attempted) ── */}
      {!activityLogged && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <SkipForward className="w-4 h-4 text-muted-foreground" />
            Skip This Follow-Up
          </h3>
          <p className="text-[11px] text-muted-foreground">
            No outreach attempted. Moves the follow-up forward without counting as a reach out or updating last contacted.
          </p>
          <Textarea
            value={skipNote}
            onChange={(e) => setSkipNote(e.target.value)}
            placeholder="Optional: reason for skipping..."
            className="min-h-[50px]"
          />
          <Button
            variant="outline"
            className="w-full border-muted-foreground/30 text-muted-foreground hover:bg-muted"
            onClick={handleSkipped}
            disabled={saving}
          >
            <SkipForward className="w-4 h-4 mr-1.5" />
            {saving ? "Saving..." : "Skip — Move to Next"}
          </Button>
        </div>
      )}

      {/* ── SECTION 2: Next Step (highlighted after activity logged) ── */}
      <div className={cn(
        "rounded-lg border bg-card p-4 space-y-3",
        activityLogged && !nextStepConfirmed
          ? "border-primary ring-2 ring-primary/20"
          : nextStepConfirmed ? "border-green-200 dark:border-green-800" : "border-border"
      )}>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          Next Step
          {nextStepConfirmed && <CheckCircle2 className="w-4 h-4 text-green-600" />}
          {activityLogged && !nextStepConfirmed && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Required</Badge>
          )}
        </h3>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            Follow-Up Type <span className="text-destructive">*</span>
          </label>
          <Select value={followUpType} onValueChange={(v) => { setFollowUpType(v as FollowUpType); setFollowUpSource("cadence"); }}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FOLLOW_UP_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "Quick Follow-Up" ? "Quick Follow-Up (1–3 days)"
                    : t === "Standard Follow-Up" ? "Standard Follow-Up (manual)"
                    : `Reorder Cycle (${item.activity_status === "Warm" ? "45" : item.activity_status === "Active" ? "75" : "90"} days)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <CalendarRange className="w-3 h-3" /> Next Follow-Up Date
          </label>
          <Input
            ref={nextFollowUpRef}
            type="date"
            value={nextFollowUp}
            min={format(addDays(new Date(), 1), "yyyy-MM-dd")}
            onChange={(e) => { setNextFollowUp(e.target.value); setFollowUpSource("manual"); }}
            className="h-9"
            disabled={nextStepConfirmed}
          />
          {followUpReasonLabel && (
            <p className={cn(
              "text-[11px] italic",
              followUpSource === "catalog" ? "text-primary font-medium" : "text-muted-foreground"
            )}>
              {followUpReasonLabel}
            </p>
          )}
        </div>

        {!nextStepConfirmed && (
          <Button className="w-full" onClick={handleSaveNextStep} disabled={saving}>
            <CalendarCheck className="w-4 h-4 mr-1.5" />
            {saving ? "Saving..." : "Confirm Next Step"}
          </Button>
        )}
      </div>

      {/* Schedule Delivery */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="schedule-delivery-cust"
            checked={scheduleDelivery}
            onCheckedChange={(v) => setScheduleDelivery(!!v)}
          />
          <label htmlFor="schedule-delivery-cust" className="text-xs font-medium text-muted-foreground flex items-center gap-1 cursor-pointer">
            <Truck className="w-3 h-3" /> Schedule Delivery
          </label>
        </div>
        {scheduleDelivery && (
          <div className="space-y-2 pt-1">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Delivery Date</label>
              <Input type="date" value={deliveryDate} min={toLocalDateKey()} onChange={(e) => setDeliveryDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Notes (optional)</label>
              <Input placeholder="Delivery notes..." value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} className="h-9" />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              disabled={!deliveryDate || deliveryCreateMut.isPending}
              onClick={() => deliveryCreateMut.mutate()}
            >
              <Truck className="w-3.5 h-3.5" />
              {deliveryCreateMut.isPending ? "Creating..." : "Create Delivery"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Notes History ── */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notes History</h4>
        {detailNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
        ) : (
          <div className="space-y-2">
            {detailNotes.map((note) => (
              <div key={note.id} className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{note.note_type}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(note.created_at).toLocaleDateString()} {new Date(note.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.note_text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lead Edit Panel (inline in detail sheet) ───

const LEAD_ACTIVITY_TYPES = ["Call", "Text", "Email", "Booking", "Sharing"] as const;

function getAutoFollowUpDays(status: string): number {
  if (status === "New") return 1;
  if (status === "Contacted") return 2;
  return 2;
}

function LeadEditPanel({ item, bookingLeads, queryClient, onClose }: {
  item: ActionItem;
  bookingLeads: BookingLead[];
  queryClient: ReturnType<typeof useQueryClient>;
  onClose: () => void;
}) {
  const lead = bookingLeads.find((l) => l.id === item.id);
  const isFirstContact = lead?.status === "New";
  const [status, setStatus] = useState(lead?.status || "New");
  const [activityType, setActivityType] = useState<string>("Call");
  const [newNote, setNewNote] = useState("");
  const [nextStepText, setNextStepText] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState(() => {
    if (lead?.next_follow_up_date) return lead.next_follow_up_date;
    const days = getAutoFollowUpDays(lead?.status || "New");
    return format(addDays(new Date(), days), "yyyy-MM-dd");
  });
  const [saving, setSaving] = useState(false);
  const [activityLogged, setActivityLogged] = useState(false);
  const [loggedMessage, setLoggedMessage] = useState("");
  // Lead logic: first contact = booking attempt only, subsequent = follow-up + optional booking attempt
  const [isBookingAttempt, setIsBookingAttempt] = useState(true);
  const [isFollowUpFlag, setIsFollowUpFlag] = useState(!isFirstContact);
  const nextFollowUpRef = useRef<HTMLInputElement>(null);

  // Sync state when lead data refreshes (after mutation + invalidation)
  useEffect(() => {
    if (lead) {
      setStatus(lead.status);
      if (lead.next_follow_up_date) setNextFollowUp(lead.next_follow_up_date);
    }
  }, [lead?.status, lead?.next_follow_up_date]);

  const notesHistory = useMemo(() => {
    if (!lead?.notes) return [];
    const lines = lead.notes.split("\n").filter(Boolean);
    return lines.map((line, i) => ({ id: String(i), text: line })).reverse();
  }, [lead?.notes]);

  const handleLogActivity = async () => {
    if (!newNote.trim()) {
      toast.error("Please add a note about what happened");
      return;
    }
    setSaving(true);
    try {
      const today = toLocalDateKey();
      const timestamp = format(new Date(), "MM/dd/yyyy h:mm a");
      const entry = `[${timestamp}] (${activityType}) ${newNote.trim()}`;
      const currentNotes = lead?.notes || "";
      const updatedNotes = currentNotes ? `${currentNotes}\n${entry}` : entry;

      const newStatus = status === "New" ? "Contacted" : status;
      const autoFollowUpDays = getAutoFollowUpDays(newStatus);
      const autoNextDate = format(addDays(new Date(), autoFollowUpDays), "yyyy-MM-dd");

      await Promise.all([
        updateBookingLead(item.id, {
          last_contact_date: today,
          next_follow_up_date: autoNextDate,
          status: newStatus,
          notes: updatedNotes,
          lead_activity: activityType,
        } as any),
        createNote({
          entity_type: "Lead",
          person_id: item.id,
          person_type: "lead",
          note_body: newNote.trim(),
          note_type: activityType,
          next_step: nextStepText.trim() || null,
          next_follow_up_date: autoNextDate,
          is_booking_attempt: isBookingAttempt,
          is_follow_up: isFollowUpFlag,
        }),
      ]);

      // Update local state immediately
      setNextFollowUp(autoNextDate);
      setStatus(newStatus);
      setNewNote("");
      setActivityLogged(true);
      setLoggedMessage(`Activity logged ✓ Next follow-up set to ${formatDateOnly(autoNextDate)}`);

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["focus-daily-progress"] });

      // Focus the next follow-up date input
      setTimeout(() => nextFollowUpRef.current?.focus(), 100);
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const handleSaveNextStep = async () => {
    setSaving(true);
    try {
      await updateBookingLead(item.id, {
        status: status as any,
        next_follow_up_date: nextFollowUp || null,
      } as any);
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      toast.success("Next step updated");
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const todayFormatted = format(new Date(), "MMMM d, yyyy");
  const autoFollowUpLabel = useMemo(() => {
    if (!nextFollowUp) return null;
    const days = getAutoFollowUpDays(status === "New" ? "Contacted" : status);
    const autoDate = format(addDays(new Date(), days), "yyyy-MM-dd");
    if (nextFollowUp === autoDate) {
      return `Auto-set to ${formatDateOnly(nextFollowUp)} based on ${status === "New" ? "Contacted" : status} lead cadence`;
    }
    return `Manually set to ${formatDateOnly(nextFollowUp)}`;
  }, [nextFollowUp, status]);

  return (
    <div className="space-y-6">
      {/* Contact Info Bar */}
      {lead && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
          {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
          {lead.lead_source && <Badge variant="secondary" className="text-[10px]">{lead.lead_source}</Badge>}
          {lead.last_contact_date && <span className="text-xs">Last: {formatDateOnly(lead.last_contact_date)}</span>}
        </div>
      )}

      {/* Success confirmation banner */}
      {activityLogged && loggedMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {loggedMessage}
        </div>
      )}

      {/* ── SECTION 1: Log Today's Activity ── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Log Today's Activity</h3>
          <span className="text-xs text-muted-foreground">Today — {todayFormatted}</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity Type</label>
          <Select value={activityType} onValueChange={setActivityType}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <FileText className="w-3 h-3" /> What Happened <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Brief conversation summary — what was discussed?"
            className="min-h-[70px]"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            ➡️ Next Step
          </label>
          <Input
            value={nextStepText}
            onChange={(e) => setNextStepText(e.target.value)}
            placeholder="e.g., Book facial, Send info packet, Follow up next week..."
            className="h-9"
          />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={isBookingAttempt} onCheckedChange={(v) => setIsBookingAttempt(!!v)} />
            <span className="text-muted-foreground">Booking Attempt</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={isFollowUpFlag} onCheckedChange={(v) => setIsFollowUpFlag(!!v)} />
            <span className="text-muted-foreground">Follow-Up</span>
          </label>
        </div>
        {isFirstContact && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            First contact — defaults to Booking Attempt only
          </p>
        )}

        <Button className="w-full" onClick={handleLogActivity} disabled={saving || !newNote.trim()}>
          <CheckCircle2 className="w-4 h-4 mr-1.5" />
          {saving ? "Saving..." : "Log Activity"}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Logging marks as contacted and auto-sets next follow-up
        </p>
      </div>

      {/* ── SECTION 2: Next Step ── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Next Step</h3>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BOOKING_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <CalendarRange className="w-3 h-3" /> Next Follow-Up Date
          </label>
          <Input
            ref={nextFollowUpRef}
            type="date"
            value={nextFollowUp}
            min={format(addDays(new Date(), 1), "yyyy-MM-dd")}
            onChange={(e) => setNextFollowUp(e.target.value)}
            className="h-9"
          />
          {autoFollowUpLabel && (
            <p className="text-[11px] text-muted-foreground italic">{autoFollowUpLabel}</p>
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={handleSaveNextStep} disabled={saving}>
          {saving ? "Saving..." : "Update Next Step"}
        </Button>
      </div>

      {/* ── Notes History ── */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notes History</h4>
        {notesHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
        ) : (
          <div className="space-y-2">
            {notesHistory.map((note) => (
              <div key={note.id} className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Quick Activity Types ───
const QUICK_ACTIVITY_TYPES = ["Call", "Text", "Email", "In Person"] as const;

// ─── Action Row Component ───

function ActionRow({
  item, inlineNoteId, inlineNoteText, inlineNextStep, inlineNoteType, inlineFollowUpDate,
  setInlineNoteText, setInlineNextStep, setInlineNoteType, setInlineFollowUpDate,
  onToggleInline, onInlineSave, onOpenDetail, isPending, onToggleWorkdayOverride,
  onQuickLog, onOpenQuickAction,
}: {
  item: ActionItem;
  inlineNoteId: string | null;
  inlineNoteText: string;
  inlineNextStep: string;
  inlineNoteType: string;
  inlineFollowUpDate: string;
  setInlineNoteText: (v: string) => void;
  setInlineNextStep: (v: string) => void;
  setInlineNoteType: (v: string) => void;
  setInlineFollowUpDate: (v: string) => void;
  onToggleInline: () => void;
  onInlineSave: () => void;
  onOpenDetail: () => void;
  isPending: boolean;
  onToggleWorkdayOverride?: (newValue: boolean) => void;
  onQuickLog?: (activityType: string) => void;
  onOpenQuickAction?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [tagFollowUp, setTagFollowUp] = useState(true);
  const [tagBookingAttempt, setTagBookingAttempt] = useState(false);
  const [tagHostessCoaching, setTagHostessCoaching] = useState(item.itemType === "hostess" || item.itemType === "event_task");
  const badge = TYPE_BADGE[item.itemType];
  const isOpen = inlineNoteId === item.id;

  return (
    <div>
      <div className="py-2.5 group">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenQuickAction || onOpenDetail}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
              {item.vip === "VIP" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-medium shrink-0">VIP</span>}
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", badge.className)}>
                {badge.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
              <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium text-[10px]">{item.actionLabel}</span>
              {item.followUpReason && item.followUpReason !== item.actionLabel && (
                <span className="text-[10px] text-muted-foreground">{item.followUpReason}</span>
              )}
              {item.lastContacted && <span>Last: {formatLastContacted(item.lastContacted)}</span>}
              {item.days_since_last_order != null && <span>{item.days_since_last_order}d since order</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {item.allow_non_working_day && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">Any Day</span>
            )}
            {item.follow_up_status === "OVERDUE" ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">
                {item.daysOverdue ? `${item.daysOverdue}d overdue` : "Overdue"}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Today</span>
            )}
            {onToggleWorkdayOverride && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", item.allow_non_working_day ? "text-primary" : "text-muted-foreground")}
                onClick={(e) => { e.stopPropagation(); onToggleWorkdayOverride(!item.allow_non_working_day); }}
                title={item.allow_non_working_day ? "Remove non-working day override" : "Allow on non-working days"}
              >
                <CalendarCheck className="w-3.5 h-3.5" />
              </Button>
            )}
            {item.phone && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild><a href={`tel:${item.phone}`}><Phone className="w-3.5 h-3.5 text-primary" /></a></Button>
                <TextActionButton phone={item.phone} trigger="icon" className="h-8 w-8" />
              </>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleInline} title="Log Activity"><FileText className="w-3.5 h-3.5 text-primary" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenDetail}><ChevronRight className="w-4 h-4 text-muted-foreground" /></Button>
          </div>
        </div>
        {item.lastNotePreview && <p className="text-[11px] text-muted-foreground truncate mt-1 italic">📝 {item.lastNotePreview}</p>}
        {item.lastNextStep && <p className="text-[11px] text-primary truncate mt-0.5">➡️ Next: {item.lastNextStep}</p>}
      </div>
      {isOpen && (
        <div className="pb-3 space-y-2 border-t border-border/30 pt-2 bg-muted/20 rounded-b-md px-3">
          {/* Quick-tap activity type chips */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Quick Log</label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIVITY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setInlineNoteType(type);
                    onQuickLog?.(type);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    "border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary",
                    "active:scale-95"
                  )}
                >
                  {type === "Call" && "📞 "}
                  {type === "Text" && "💬 "}
                  {type === "Email" && "✉️ "}
                  {type === "In Person" && "🤝 "}
                  {type}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Tap to log instantly · add details below (optional)</p>
          </div>

          {/* Optional tags */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTagFollowUp(!tagFollowUp)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                tagFollowUp ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              Follow-Up
            </button>
            <button
              type="button"
              onClick={() => setTagBookingAttempt(!tagBookingAttempt)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                tagBookingAttempt ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              Booking Attempt
            </button>
            {(item.itemType === "hostess" || item.itemType === "event_task") && (
              <button
                type="button"
                onClick={() => setTagHostessCoaching(!tagHostessCoaching)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                  tagHostessCoaching ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                Hostess Coaching
              </button>
            )}
          </div>

          {/* Expandable details section */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("w-3 h-3 transition-transform", showDetails && "rotate-180")} />
            {showDetails ? "Hide details" : "Add notes & next step (optional)"}
          </button>

          {showDetails && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={inlineNoteType} onValueChange={setInlineNoteType}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{NOTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="date" value={inlineFollowUpDate} min={toLocalDateKey()} onChange={(e) => setInlineFollowUpDate(e.target.value)} className="h-8 w-[140px] text-xs" placeholder="Next FU" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">What Happened</label>
                <Textarea placeholder="Brief summary (optional)..." value={inlineNoteText} onChange={(e) => setInlineNoteText(e.target.value)} className="min-h-[40px] text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Next Step</label>
                <Input placeholder="e.g., Send samples, Follow up..." value={inlineNextStep} onChange={(e) => setInlineNextStep(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs" onClick={onInlineSave} disabled={isPending}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Saving..." : "Save with Details"}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onToggleInline}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Birthday Row ───

function getBirthdayAge(item: ActionItem): number | null {
  const bd = item.birthday;
  if (!bd) return null;
  const parts = bd.slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  if (year < 1900 || year > 2020) return null;
  const today = new Date();
  const parsed = getBirthdayMonthDay(item);
  if (!parsed) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < parsed.month || (today.getMonth() + 1 === parsed.month && today.getDate() < parsed.day)) age--;
  return age > 0 && age < 120 ? age : null;
}

function BirthdayRow({ item, label, isOverdue, onNavigate, onAction, onDone }: {
  item: ActionItem;
  label: string;
  isOverdue?: boolean;
  onNavigate: () => void;
  onAction: (type: string) => void;
  onDone?: () => void;
}) {
  const isAnniversary = item._eventType === "anniversary";
  const age = isAnniversary ? null : getBirthdayAge(item);
  const eventLabel = isAnniversary
    ? `🎉 Anniversary${item._anniversaryYears ? ` — Year ${item._anniversaryYears}` : ""}`
    : `🎂 Birthday`;
  const dateText = isAnniversary && item._anniversaryDate
    ? formatDateOnly(item._anniversaryDate, "MMMM d")
    : formatBirthday(item);
  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-2",
      isOverdue
        ? "border-destructive/30 bg-destructive/5"
        : "border-border/50 bg-card"
    )}>
      {/* Line 1: Name + event-type badge + person-type badge */}
      <div className="flex items-center gap-2 cursor-pointer" onClick={onNavigate}>
        <span className="text-sm font-bold text-foreground truncate flex-1">{item.name}</span>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
          isAnniversary
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            : "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
        )}>
          {isAnniversary ? "🎉 Anniversary" : "🎂 Birthday"}
        </span>
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", TYPE_BADGE[item.itemType].className)}>
          {TYPE_BADGE[item.itemType].label}
        </span>
        {item.vip === "VIP" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 font-medium shrink-0">VIP</span>}
      </div>

      {/* Line 2: Date + status */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          {eventLabel} · {dateText}{age ? ` (${age})` : ""}
        </span>
        <span className="text-border">·</span>
        <span className={cn(
          "font-semibold",
          isOverdue ? "text-destructive" : "text-pink-600"
        )}>
          {label}
        </span>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-1.5">
        {onDone && (
          <Button
            variant={isOverdue ? "destructive" : "default"}
            size="sm"
            className="h-10 px-4 text-xs font-semibold rounded-lg"
            onClick={onDone}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" /> Done
          </Button>
        )}
        <div className="flex-1" />
        <div className="flex gap-0.5">
          {item.phone && (
            <>
              <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
                <a href={`tel:${item.phone}`}><Phone className="w-4 h-4 text-primary" /></a>
              </Button>
              <TextActionButton phone={item.phone} trigger="icon" className="h-9 w-9" iconClassName="w-4 h-4" />
            </>
          )}
          {item.email && (
            <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
              <a href={`mailto:${item.email}`} onClick={(e) => openEmail(item.email!, e)}><Mail className="w-4 h-4 text-primary" /></a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
