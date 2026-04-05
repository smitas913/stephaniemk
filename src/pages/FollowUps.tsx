import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomers, fetchOrders, updateCustomer, createCustomerNote, fetchLatestNotes, fetchCustomerNotes,
  fetchProspects, updateProspect, createProspectNote, fetchProspectNotes,
  bulkUpdateCustomerFollowUps, fetchBookingLeads, updateBookingLead,
  fetchTeamConsultants, updateTeamConsultant, fetchEvents, updateEvent,
  fetchAllLatestNotes, fetchEventTasks, completeEventTask, createNote,
} from "@/lib/queries";
import type { EventTask } from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import { getCadenceInfo, getNextCoachingDate, snoozeCoachingDate } from "@/lib/coachingCadence";
import { getNextDormantStage, getNextDormantFollowUpDate, getDormantStageLabel } from "@/lib/dormantCadence";
import type { DormantStage } from "@/lib/dormantCadence";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import { NOTE_TYPES, COACHING_FOCUS_OPTIONS, FOCUS_GROUPS, BOOKING_LEAD_STATUSES } from "@/lib/types";
import type { Customer, CustomerComputed, CustomerNote, ProspectNote, BookingLead, TeamConsultant, EventRecord } from "@/lib/types";
import Layout from "@/components/Layout";
import TodaysFocus from "@/components/TodaysFocus";
import type { FocusDetailItem } from "@/components/TodaysFocus";

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
import { Cake, Phone, MessageSquare, Mail, FileText, CheckCircle2, CalendarRange, ExternalLink, Clock, ChevronRight, CalendarCheck, Calendar, Users, Crown, Truck, PhoneMissed, SkipForward, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
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
  lastContacted?: string | null;
  actionLabel: string;
  // Extra customer fields for enhanced panel
  _address?: string | null;
  _relationship_status?: string | null;
};

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
  let bday = new Date(today.getFullYear(), parsed.month - 1, parsed.day);
  bday.setHours(0, 0, 0, 0);
  if (bday < today) bday = new Date(today.getFullYear() + 1, parsed.month - 1, parsed.day);
  return Math.floor((bday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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

const CUSTOMER_DAILY_ACTIVITY_TYPES = new Set(["Call", "Text", "Email", "In Person", "Delivery", "Reorder Conversation", "Did Not Connect"]);

function getTimestampDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateKey(parsed);
}

async function logCustomerActivity({
  customerId,
  noteType,
  noteText,
  nextFollowUpDate,
}: {
  customerId: string;
  noteType: string;
  noteText?: string;
  nextFollowUpDate?: string | null;
}) {
  const fallbackNote = `${noteType} follow-up completed`;
  const noteBody = noteText?.trim() || fallbackNote;

  await Promise.all([
    createCustomerNote({ customer_id: customerId, note_text: noteBody, note_type: noteType }),
    createNote({
      entity_type: "Customer",
      customer_id: customerId,
      note_body: noteBody,
      note_type: noteType,
      next_follow_up_date: nextFollowUpDate ?? null,
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
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const { data: bookingLeads = [] } = useQuery({ queryKey: ["booking-leads"], queryFn: fetchBookingLeads });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: unifiedNotes = [] } = useQuery({ queryKey: ["unified-notes"], queryFn: fetchAllLatestNotes });
  const { data: eventTasksRaw = [] } = useQuery({ queryKey: ["event-tasks"], queryFn: fetchEventTasks });
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
  const isLoading = cLoading || oLoading;

  // ─── Compute Today's Focus metrics from completed actions ───
  const { reachOutsToday, bookingsToday, sharingToday, reachOutDetails, bookingDetails, sharingDetails } = useMemo(() => {
    const todayKey = toLocalDateKey();
    const contactTypes = new Set(["Call", "Text", "Email", "In Person"]);

    // Reach-out details from unified notes (covers customers & prospects)
    const reachOutItems: FocusDetailItem[] = unifiedNotes
      .filter((n) => {
        const noteDay = n.note_date || getTimestampDateKey(n.created_at);
        if (noteDay !== todayKey) return false;
        return n.entity_type === "Customer"
          ? CUSTOMER_DAILY_ACTIVITY_TYPES.has(n.note_type)
          : contactTypes.has(n.note_type);
      })
      .map((n) => {
        let name = "Unknown";
        let type = n.entity_type || "Customer";
        let id = n.customer_id || n.prospect_id || n.id;
        if (n.entity_type === "Customer" && n.customer_id) {
          const c = customers.find((c) => c.id === n.customer_id);
          name = c?.full_name || "Customer";
          id = n.customer_id;
          type = "Customer";
        } else if (n.entity_type === "Prospect" && n.prospect_id) {
          const p = prospects.find((p) => p.id === n.prospect_id);
          name = p?.name || "Prospect";
          id = n.prospect_id;
          type = "Prospect";
        }
        return { id, name, type, method: n.note_type, detail: undefined };
      });

    // Also include customer_notes logged today (legacy table — ensures customer activities always count)
    const customerNoteItems: FocusDetailItem[] = allNotes
      .filter((n) => getTimestampDateKey(n.created_at) === todayKey && CUSTOMER_DAILY_ACTIVITY_TYPES.has(n.note_type))
      .map((n) => {
        const c = customers.find((c) => c.id === n.customer_id);
        return { id: n.customer_id || n.id, name: c?.full_name || "Customer", type: "Customer", method: n.note_type };
      });

    // Booking Leads contacted today
    const leadReachOutItems: FocusDetailItem[] = bookingLeads
      .filter((l) => l.last_contact_date === todayKey && !l.converted_customer_id)
      .map((l) => ({
        id: l.id,
        name: l.name,
        type: "Lead",
        method: "Call",
        detail: l.lead_activity || undefined,
      }));

    // Consultants coached/contacted today
    const consultantReachOutItems: FocusDetailItem[] = [];
    for (const c of consultants) {
      const updatedToday = c.updated_at?.startsWith(todayKey);
      const coachingAdvanced = c.next_coaching_date && c.next_coaching_date > todayKey;
      if (updatedToday && coachingAdvanced) {
        consultantReachOutItems.push({
          id: c.id,
          name: c.name,
          type: "Consultant",
          method: "Coaching",
          detail: c.coaching_focus || undefined,
        });
      }
    }

    // Deduplicate by id across all sources
    const seenIds = new Set<string>();
    const allReachOutItems: FocusDetailItem[] = [];
    for (const item of [...reachOutItems, ...customerNoteItems, ...leadReachOutItems, ...consultantReachOutItems]) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allReachOutItems.push(item);
      }
    }
    const finalReachOutItems = allReachOutItems;

    // Bookings: events created today
    const bookingItems: FocusDetailItem[] = events
      .filter((e) => e.created_at.startsWith(todayKey))
      .map((e) => ({
        id: e.event_id,
        name: e.hostess_name || e.event_id,
        type: "Event",
        detail: e.event_type || undefined,
      }));

    // Sharing
    const sharingItems: FocusDetailItem[] = [
      ...prospects
        .filter((p) => p.opportunity_status === "Shared" && p.updated_at?.startsWith(todayKey))
        .map((p) => ({ id: p.id, name: p.name, type: "Prospect" as const, detail: "Shared Opportunity" })),
      ...events
        .filter((e) => e.event_date === todayKey && (e.sharing_appointments_count || 0) > 0)
        .map((e) => ({
          id: e.event_id,
          name: e.hostess_name || e.event_id,
          type: "Event" as const,
          detail: `${e.sharing_appointments_count} sharing appt${(e.sharing_appointments_count || 0) > 1 ? "s" : ""}`,
        })),
    ];

    const sharingFromEvents = events
      .filter((e) => e.event_date === todayKey)
      .reduce((sum, e) => sum + (e.sharing_appointments_count || 0), 0);

    return {
      reachOutsToday: finalReachOutItems.length,
      bookingsToday: bookingItems.length,
      sharingToday: sharingItems.filter(s => s.type === "Prospect").length + sharingFromEvents,
      reachOutDetails: finalReachOutItems,
      bookingDetails: bookingItems,
      sharingDetails: sharingItems,
    };
  }, [allNotes, unifiedNotes, events, prospects, customers, bookingLeads, consultants]);

  // UI state
  const [showUpcoming7, setShowUpcoming7] = useState(false);

  // Birthday completion tracking (daily, resets each day via localStorage key)
  const bdayStorageKey = `bday-done-${toLocalDateKey()}`;
  const [completedBirthdays, setCompletedBirthdays] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(bdayStorageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const markBirthdayDone = (id: string) => {
    setCompletedBirthdays((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(bdayStorageKey, JSON.stringify([...next]));
      return next;
    });
    toast.success("Birthday message marked complete!");
  };
  const [actionItem, setActionItem] = useState<ActionItem | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("Call");
  const [followUpDate, setFollowUpDate] = useState("");
  const [inlineNoteId, setInlineNoteId] = useState<string | null>(null);
  const [inlineNoteText, setInlineNoteText] = useState("");
  const [inlineNoteType, setInlineNoteType] = useState("Call");
  const [inlineFollowUpDate, setInlineFollowUpDate] = useState("");
  const [detailItem, setDetailItem] = useState<ActionItem | null>(null);
  const [detailNoteText, setDetailNoteText] = useState("");
  const [detailNoteType, setDetailNoteType] = useState("Call");
  const [detailFollowUpDate, setDetailFollowUpDate] = useState("");
  const [showDistribute, setShowDistribute] = useState(false);
  const [distributeDays, setDistributeDays] = useState("60");
  const [distributeFilter, setDistributeFilter] = useState<"overdue-today" | "no-date" | "dormant-warm">("overdue-today");
  const [distributeSelectedIds, setDistributeSelectedIds] = useState<Set<string>>(new Set());
  const [distributeStep, setDistributeStep] = useState<"configure" | "preview">("configure");

  const [scheduleDelivery, setScheduleDelivery] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(toLocalDateKey(addDays(new Date(), 1)));
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const notesByCustomer = useMemo(() => {
    const map = new Map<string, CustomerNote>();
    for (const n of allNotes) { if (!map.has(n.customer_id)) map.set(n.customer_id, n); }
    return map;
  }, [allNotes]);

  const enrichedCustomers = useMemo(() => {
    return customers
      .filter((c) => c.is_active !== false && c.relationship_status !== "Consultant")
      .map((c) => {
        const custOrders = allOrders.filter((o) => o.customer_id === c.id);
        const computed = computeCustomerFields(c, custOrders);
        return { ...c, ...computed };
      });
  }, [customers, allOrders]);

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
  const { todayActions, upcomingActions, todayEvents, upcomingEvents, reschedulingFollowUp, birthdaysToday, birthdaysUpcoming } = useMemo(() => {
    const todayDate = getLocalToday();
    const todayKey = toLocalDateKey(todayDate);
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
        lastNotePreview: notePreview, lastContacted: c.last_contacted,
        actionLabel: "Follow-up",
        _address: fullAddress || null,
        _relationship_status: c.relationship_status,
      };
    });

    // Prospect items
    const prospectItems: ActionItem[] = prospects
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
        };
      });

    // Consultant items
    const consultantItems: ActionItem[] = consultants
      .filter((c) => normalizeFollowUpDate(c.next_coaching_date))
      .map((c) => {
        const effectiveDate = normalizeFollowUpDate(c.next_coaching_date);
        const status = getFollowUpStatus(effectiveDate, todayKey) || "UPCOMING";
        const daysOverdue = status === "OVERDUE" ? getDaysOverdue(effectiveDate, todayDate) : null;
        return {
          id: c.id, itemType: "consultant" as const, name: c.name,
          phone: c.phone, email: c.email,
          next_follow_up: effectiveDate, follow_up_status: status,
          daysOverdue,
          followUpReason: (c as any).coaching_focus || "Coaching",
          lastContacted: null,
          actionLabel: "Coaching",
        };
      });

    // Hostess coaching items (from events with hostess_next_action_date)
    const hostessItems: ActionItem[] = events
      .filter((e) => !e.is_archived && e.hostess_name && (e as any).hostess_next_action_date)
      .map((e) => {
        const effectiveDate = normalizeFollowUpDate((e as any).hostess_next_action_date);
        const status = getFollowUpStatus(effectiveDate, todayKey) || "UPCOMING";
        const daysOverdue = status === "OVERDUE" ? getDaysOverdue(effectiveDate, todayDate) : null;
        return {
          id: e.id, itemType: "hostess" as const, name: e.hostess_name!,
          phone: e.hostess_phone, email: e.hostess_email,
          next_follow_up: effectiveDate, follow_up_status: status,
          daysOverdue,
          followUpReason: (e as any).hostess_next_action || "Hostess Coaching",
          lastContacted: null,
          actionLabel: "Hostess Coaching",
        };
      });

    // Booking lead items (converted to ActionItems)
    const leadItems: ActionItem[] = bookingLeads
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

    const todayActions = sortItems(allItems.filter((item) => item.next_follow_up && isDueTodayOrEarlier(item.next_follow_up, todayKey)));

    const upcomingActions = sortItems(allItems.filter((item) => {
      if (!item.next_follow_up) return false;
      const normalized = normalizeDateOnly(item.next_follow_up);
      if (!normalized) return false;
      return normalized > todayKey && normalized <= upcoming7Key;
    }));

    // Events — only show active events (Booked + not rescheduling)
    const todayEvents = events.filter((e) => {
      if (!e.event_date || e.is_archived) return false;
      if (normalizeDateOnly(e.event_date) !== todayKey) return false;
      if (e.event_status === "Cancelled") return false;
      const reschedule = (e as any).reschedule_status || "None";
      if (reschedule === "In Process of Rescheduling" || reschedule === "Rescheduled") return false;
      return true;
    });

    // Rescheduling follow-up: events needing rebooking attention
    const reschedulingFollowUp = events.filter((e) => {
      if (e.is_archived) return false;
      const reschedule = (e as any).reschedule_status || "None";
      if (reschedule === "In Process of Rescheduling") return true;
      if (e.event_status === "Cancelled" && e.event_date) return true;
      return false;
    });

    const upcomingEvents = events.filter((e) => {
      if (!e.event_date || e.is_archived) return false;
      if (e.event_status === "Cancelled") return false;
      const reschedule = (e as any).reschedule_status || "None";
      if (reschedule === "In Process of Rescheduling" || reschedule === "Rescheduled") return false;
      const normalized = normalizeDateOnly(e.event_date);
      return normalized && normalized > todayKey && normalized! <= upcoming7Key;
    }).sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));

    // Birthdays (customers + consultants)
    const birthdaysToday: (ActionItem & { _daysUntil?: number })[] = [];
    const birthdaysUpcoming: (ActionItem & { _daysUntil: number })[] = [];
    for (const c of customerItems) {
      const days = daysToBirthday({ birthday: c.birthday, birthday_mmdd: c.birthday_mmdd });
      if (days === null) continue;
      if (days === 0) birthdaysToday.push(c);
      else if (days <= 7) birthdaysUpcoming.push({ ...c, _daysUntil: days });
    }
    for (const c of consultantItems) {
      const consultant = consultants.find((tc) => tc.id === c.id);
      if (!consultant?.birthday) continue;
      const days = daysToBirthday({ birthday: consultant.birthday });
      if (days === null) continue;
      if (days === 0) birthdaysToday.push(c);
      else if (days <= 7) birthdaysUpcoming.push({ ...c, _daysUntil: days });
    }
    birthdaysUpcoming.sort((a, b) => a._daysUntil - b._daysUntil);

    return { todayActions, upcomingActions, todayEvents, upcomingEvents, reschedulingFollowUp, birthdaysToday, birthdaysUpcoming };
  }, [enrichedCustomers, prospects, consultants, events, notesByCustomer, bookingLeads]);

  // Distribution candidates
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["booking-leads"] }); toast.success("Lead marked as contacted"); },
  });

  const contactMutation = useMutation({
    mutationFn: async ({ item, note, type, nextDate }: { item: ActionItem; note: string; type: string; nextDate?: string }) => {
      const today = toLocalDateKey();
      if (item.itemType === "customer") {
        const updates: Record<string, string | null> = { last_contacted: today };
        if (nextDate) updates.next_follow_up_date = nextDate;
        await updateCustomer(item.id, updates as any);
        await logCustomerActivity({ customerId: item.id, noteType: type, noteText: note, nextFollowUpDate: nextDate ?? null });
      } else if (item.itemType === "prospect") {
        const updates: Record<string, string | null> = { last_contact_date: today };
        if (nextDate) updates.next_follow_up_date = nextDate;
        await updateProspect(item.id, updates as any);
        if (note.trim()) await createProspectNote({ prospect_id: item.id, note_text: note.trim() });
      } else if (item.itemType === "consultant") {
        const updates: Record<string, string | null> = {};
        if (nextDate) updates.next_coaching_date = nextDate;
        await updateTeamConsultant(item.id, updates as any);
      } else if (item.itemType === "hostess") {
        const updates: Record<string, string | null> = {};
        if (nextDate) updates.hostess_next_action_date = nextDate;
        await updateEvent(item.id, updates as any);
      } else if (item.itemType === "lead") {
        const defaultNext = format(addDays(new Date(), 2), "yyyy-MM-dd");
        const updates: Record<string, string | null> = {
          last_contact_date: today,
          next_follow_up_date: nextDate || defaultNext,
        };
        if (!nextDate) updates.status = "Contacted";
        await updateBookingLead(item.id, updates as any);
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
      setActionItem(null); setNoteText(""); setNoteType("Call"); setFollowUpDate("");
      setInlineNoteId(null); setInlineNoteText(""); setInlineNoteType("Call"); setInlineFollowUpDate("");
      toast.success("Marked as contacted");
    },
  });

  const handleInlineSave = (item: ActionItem) => {
    contactMutation.mutate({ item, note: inlineNoteText, type: inlineNoteType, nextDate: normalizeFollowUpDate(inlineFollowUpDate) || undefined });
  };

  const detailNoteMutation = useMutation({
    mutationFn: async () => {
      if (!detailItem || !detailNoteText.trim()) return;
      if (detailItem.itemType === "customer") {
        await logCustomerActivity({
          customerId: detailItem.id,
          noteType: detailNoteType === "General" ? "Other" : detailNoteType,
          noteText: detailNoteText.trim(),
          nextFollowUpDate: normalizeFollowUpDate(detailFollowUpDate),
        });
      }
      else if (detailItem.itemType === "prospect") await createProspectNote({ prospect_id: detailItem.id, note_text: detailNoteText.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notes", detailItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["prospect-notes", detailItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      setDetailNoteText(""); setDetailNoteType("Call"); toast.success("Note added");
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
        } else if (item.activity_status === "Warm") {
          nextDate = format(addDays(new Date(), 45), "yyyy-MM-dd");
        } else if (item.activity_status === "Active") {
          nextDate = format(addDays(new Date(), 75), "yyyy-MM-dd");
        } else {
          nextDate = format(addDays(new Date(), 90), "yyyy-MM-dd");
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

  const openContactDialog = (item: ActionItem, defaultType = "Call") => { setActionItem(item); setNoteText(""); setNoteType(defaultType); setFollowUpDate(""); };
  const openDetailSheet = (item: ActionItem) => { setDetailItem(item); setDetailNoteText(""); setDetailNoteType("General"); setDetailFollowUpDate(item.next_follow_up || ""); setScheduleDelivery(false); setDeliveryDate(toLocalDateKey(addDays(new Date(), 1))); setDeliveryNotes(""); };
  const handleSubmitAction = () => { if (!actionItem) return; contactMutation.mutate({ item: actionItem, note: noteText, type: noteType, nextDate: normalizeFollowUpDate(followUpDate) || undefined }); };

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
  const toggleInlineNote = (item: ActionItem) => { if (inlineNoteId === item.id) { setInlineNoteId(null); } else { setInlineNoteId(item.id); setInlineNoteText(""); setInlineNoteType("Call"); setInlineFollowUpDate(""); } };
  const navigateToItem = (item: ActionItem) => {
    if (item.itemType === "customer") navigate(`/customers/${item.id}`, { state: { from: "/follow-ups" } });
    else if (item.itemType === "prospect") navigate(`/prospects/${item.id}`, { state: { from: "/follow-ups" } });
    else if (item.itemType === "lead") navigate("/booking-leads");
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
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Today</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {todayActions.length} action{todayActions.length !== 1 ? "s" : ""} · {todayEvents.length} event{todayEvents.length !== 1 ? "s" : ""} · {birthdaysToday.length} birthday{birthdaysToday.length !== 1 ? "s" : ""}
            </p>
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

              {/* ===== TODAY TAB ===== */}
              <TabsContent value="today" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column (2/3) */}
                  <div className="lg:col-span-2 space-y-4">

                    {/* Grouped Actions for Today */}
                    {(() => {
                      const consultantActions = todayActions.filter((i) => i.itemType === "consultant" || i.itemType === "hostess" || i.itemType === "event_task");
                      const customerActions = todayActions.filter((i) => i.itemType === "customer");
                      const leadProspectActions = todayActions.filter((i) => i.itemType === "lead" || i.itemType === "prospect");

                      const renderSection = (title: string, icon: React.ElementType, items: ActionItem[], iconColor: string, bgColor: string) => {
                        if (items.length === 0) return null;
                        const Icon = icon;
                        return (
                          <Card key={title} className="border-border/50 shadow-sm">
                            <CardHeader className="pb-2">
                              <div className="flex items-center gap-2">
                                <div className={cn("p-1.5 rounded-md", bgColor)}>
                                  <Icon className={cn("w-4 h-4", iconColor)} />
                                </div>
                                <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
                                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="divide-y divide-border/40">
                                {items.map((item) => (
                                  <ActionRow
                                    key={`${item.itemType}-${item.id}`}
                                    item={item}
                                    inlineNoteId={inlineNoteId}
                                    inlineNoteText={inlineNoteText}
                                    inlineNoteType={inlineNoteType}
                                    inlineFollowUpDate={inlineFollowUpDate}
                                    setInlineNoteText={setInlineNoteText}
                                    setInlineNoteType={setInlineNoteType}
                                    setInlineFollowUpDate={setInlineFollowUpDate}
                                    onToggleInline={() => toggleInlineNote(item)}
                                    onInlineSave={() => handleInlineSave(item)}
                                    onOpenDetail={() => openDetailSheet(item)}
                                    isPending={contactMutation.isPending}
                                  />
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      };

                      const hasAny = todayActions.length > 0;
                      return hasAny ? (
                        <>
                          {renderSection("Leads / Prospects", CalendarCheck, leadProspectActions, "text-amber-600", "bg-amber-50 dark:bg-amber-950/30")}
                          {renderSection("Consultants (Coaching)", Crown, consultantActions, "text-violet-600", "bg-violet-50 dark:bg-violet-950/30")}
                          {renderSection("Customers (Follow-Ups)", Users, customerActions, "text-blue-600", "bg-blue-50 dark:bg-blue-950/30")}
                        </>
                      ) : (
                        <Card className="border-border/50 shadow-sm">
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground py-6 text-center">All caught up! 🎉</p>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </div>

                  {/* Right Column (1/3) */}
                  <div className="space-y-4">
                    <TodaysFocus
                      reachOutsToday={reachOutsToday}
                      bookingsToday={bookingsToday}
                      sharingToday={sharingToday}
                      reachOutDetails={reachOutDetails}
                      bookingDetails={bookingDetails}
                      sharingDetails={sharingDetails}
                      rawData={{
                        unifiedNotes: unifiedNotes,
                        allNotes: allNotes,
                        customers: customers,
                        prospects: prospects,
                        bookingLeads: bookingLeads,
                        consultants: consultants,
                        events: events,
                      }}
                      onDetailNavigate={(type, id) => {
                        if (type === "Customer") navigate(`/customers/${id}`, { state: { from: "/follow-ups" } });
                        else if (type === "Prospect") navigate(`/prospects/${id}`, { state: { from: "/follow-ups" } });
                        else if (type === "Event") navigate(`/events/${id}`, { state: { from: "/follow-ups" } });
                        else if (type === "Lead") navigate("/booking-leads");
                        else if (type === "Consultant") navigate("/leadership");
                      }}
                    />
                    

                    {/* Today's Schedule — Events + Deliveries + Birthdays */}
                    <Card className="border-border/50 shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
                              <Calendar className="w-4 h-4 text-emerald-600" />
                            </div>
                            <CardTitle className="text-sm font-semibold text-foreground">Today's Schedule</CardTitle>
                            <Badge variant="secondary" className="text-xs">{todayEvents.length + todayDeliveries.length + birthdaysToday.length}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground cursor-pointer" htmlFor="upcoming-toggle">+7d birthdays</label>
                            <Switch id="upcoming-toggle" checked={showUpcoming7} onCheckedChange={setShowUpcoming7} />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {todayEvents.length === 0 && todayDeliveries.length === 0 && birthdaysToday.length === 0 && (!showUpcoming7 || birthdaysUpcoming.length === 0) ? (
                          <p className="text-sm text-muted-foreground py-3 text-center">Nothing scheduled today</p>
                        ) : (
                          <div className="space-y-3">
                            {/* Events */}
                            {todayEvents.length > 0 && (
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

                            {/* Rescheduling Follow-Up */}
                            {reschedulingFollowUp.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3" /> Rescheduling Follow-Up ({reschedulingFollowUp.length})
                                </p>
                                <div className="divide-y divide-border/40">
                                  {reschedulingFollowUp.map((evt) => (
                                    <div key={evt.id} className="py-2 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-md px-1"
                                      onClick={() => navigate(`/events/${evt.event_id}`, { state: { from: "/follow-ups" } })}>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                          {evt.hostess_name || evt.event_id}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                          {evt.event_type && <span>{evt.event_type}</span>}
                                          {evt.event_date && <span>• {formatDateOnly(evt.event_date)}</span>}
                                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                            {(evt as any).reschedule_status === "In Process of Rescheduling"
                                              ? "Rescheduling"
                                              : evt.event_status}
                                          </Badge>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {evt.hostess_phone && (
                                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                            <a href={`tel:${phoneForLink(evt.hostess_phone)}`}><Phone className="w-3.5 h-3.5 text-primary" /></a>
                                          </Button>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {todayDeliveries.length > 0 && (
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

                            {/* Birthdays */}
                            {(birthdaysToday.length > 0 || (showUpcoming7 && birthdaysUpcoming.length > 0)) && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                  <Cake className="w-3 h-3" /> Birthdays ({birthdaysToday.filter((c) => !completedBirthdays.has(c.id)).length})
                                </p>
                                <div className="space-y-0.5">
                                  {birthdaysToday.filter((c) => !completedBirthdays.has(c.id)).map((c) => (
                                    <BirthdayRow key={c.id} item={c} label="Today 🎉" onNavigate={() => navigateToItem(c)} onAction={(type) => openContactDialog(c, type)} onDone={() => markBirthdayDone(c.id)} />
                                  ))}
                                  {completedBirthdays.size > 0 && birthdaysToday.some((c) => completedBirthdays.has(c.id)) && (
                                    <p className="text-[10px] text-muted-foreground italic px-2 py-1">✓ {birthdaysToday.filter((c) => completedBirthdays.has(c.id)).length} birthday message{birthdaysToday.filter((c) => completedBirthdays.has(c.id)).length > 1 ? "s" : ""} sent today</p>
                                  )}
                                  {showUpcoming7 && birthdaysUpcoming.map((c) => (
                                    <BirthdayRow key={c.id} item={c} label={`in ${c._daysUntil}d`} onNavigate={() => navigateToItem(c)} onAction={(type) => openContactDialog(c, type)} />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
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
                    <Button variant="outline" size="sm" asChild><a href={`sms:${phoneForLink(actionItem.phone)}`}><MessageSquare className="w-3.5 h-3.5 mr-1" />Text</a></Button>
                  </>
                )}
                {actionItem.email && (
                  <Button variant="outline" size="sm" asChild><a href={`mailto:${actionItem.email}`}><Mail className="w-3.5 h-3.5 mr-1" />Email</a></Button>
                )}
              </div>
            )}
            <div className="space-y-3">
              {actionItem?.itemType === "customer" && (
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{NOTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {actionItem?.itemType !== "consultant" && (
                <Textarea placeholder="Add a note (optional)..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-[80px]" />
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {actionItem?.itemType === "consultant" ? "Next Coaching Date" : "Next Follow-Up Date"}
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
                      <Button variant="outline" size="sm" className="h-8 text-xs" asChild><a href={`sms:${detailItem.phone}`}><MessageSquare className="w-3 h-3 mr-1" />Text</a></Button>
                    </>
                  )}
                  {detailItem.email && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" asChild><a href={`mailto:${detailItem.email}`}><Mail className="w-3 h-3 mr-1" />Email</a></Button>
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

function getCustomerAutoFollowUpDays(activityStatus: string | undefined, dormantStage: string | null | undefined): { days: number; label: string } {
  if (activityStatus === "Dormant") {
    const stage = (dormantStage || "Stage 1") as DormantStage;
    if (stage === "Stage 3" || stage === "Annual") {
      return { days: 365, label: "Annual check-in (1 year)" };
    }
    return { days: 5, label: "Dormant cadence (5 days)" };
  }
  if (activityStatus === "Warm") {
    return { days: 45, label: "Warm reorder cycle (45 days)" };
  }
  if (activityStatus === "Active") {
    return { days: 75, label: "Active check-in (75 days)" };
  }
  // No Orders or unknown
  return { days: 90, label: "Reorder cycle (90 days)" };
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

  const [activityType, setActivityType] = useState<string>("Call");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [activityLogged, setActivityLogged] = useState(false);
  const nextStepConfirmed = false; // panel closes on confirm, so always false while open
  const [loggedMessage, setLoggedMessage] = useState("");
  const [skipNote, setSkipNote] = useState("");
  const [didNotConnect, setDidNotConnect] = useState(false);
  const [skipped, setSkipped] = useState(false);
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

  const autoInfo = useMemo(() => getCustomerAutoFollowUpDays(item.activity_status, currentDormantStage), [item.activity_status, currentDormantStage]);

  // Determine initial next follow-up: catalog takes priority if earlier
  const [nextFollowUp, setNextFollowUp] = useState(() => {
    const cadenceDate = format(addDays(new Date(), autoInfo.days), "yyyy-MM-dd");
    const existingDate = customer?.next_follow_up_date && compareDateOnly(customer.next_follow_up_date) === 1
      ? customer.next_follow_up_date : cadenceDate;
    return existingDate;
  });

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
      await logCustomerActivity({ customerId: item.id, noteType: activityType, noteText, nextFollowUpDate: effectiveDate });

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
        : followUpSource === "manual" ? "Manual follow-up" : autoInfo.label;
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
    // Check if it matches the auto cadence
    const autoDate = isDormant
      ? getNextDormantFollowUpDate((currentDormantStage || "Stage 1") as DormantStage)
      : format(addDays(new Date(), autoInfo.days), "yyyy-MM-dd");
    if (nextFollowUp === autoDate) {
      return `Auto-set to ${formatDateOnly(nextFollowUp)} based on ${autoInfo.label}`;
    }
    return `Manually set to ${formatDateOnly(nextFollowUp)}`;
  }, [nextFollowUp, followUpSource, catalogType, isDormant, currentDormantStage, autoInfo]);

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
                <FileText className="w-3 h-3" /> Notes <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="What happened? What was discussed?"
                className="min-h-[80px]"
                autoFocus
              />
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
  const [status, setStatus] = useState(lead?.status || "New");
  const [activityType, setActivityType] = useState<string>("Call");
  const [newNote, setNewNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState(() => {
    if (lead?.next_follow_up_date) return lead.next_follow_up_date;
    const days = getAutoFollowUpDays(lead?.status || "New");
    return format(addDays(new Date(), days), "yyyy-MM-dd");
  });
  const [saving, setSaving] = useState(false);
  const [activityLogged, setActivityLogged] = useState(false);
  const [loggedMessage, setLoggedMessage] = useState("");
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

      await updateBookingLead(item.id, {
        last_contact_date: today,
        next_follow_up_date: autoNextDate,
        status: newStatus,
        notes: updatedNotes,
        lead_activity: activityType,
      } as any);

      // Update local state immediately
      setNextFollowUp(autoNextDate);
      setStatus(newStatus);
      setNewNote("");
      setActivityLogged(true);
      setLoggedMessage(`Activity logged ✓ Next follow-up set to ${formatDateOnly(autoNextDate)}`);

      // Refresh data but DON'T close
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });

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
            <FileText className="w-3 h-3" /> Notes <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="What happened? What was discussed?"
            className="min-h-[80px]"
            autoFocus
          />
        </div>

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

// ─── Action Row Component ───

function ActionRow({
  item, inlineNoteId, inlineNoteText, inlineNoteType, inlineFollowUpDate,
  setInlineNoteText, setInlineNoteType, setInlineFollowUpDate,
  onToggleInline, onInlineSave, onOpenDetail, isPending,
}: {
  item: ActionItem;
  inlineNoteId: string | null;
  inlineNoteText: string;
  inlineNoteType: string;
  inlineFollowUpDate: string;
  setInlineNoteText: (v: string) => void;
  setInlineNoteType: (v: string) => void;
  setInlineFollowUpDate: (v: string) => void;
  onToggleInline: () => void;
  onInlineSave: () => void;
  onOpenDetail: () => void;
  isPending: boolean;
}) {
  const badge = TYPE_BADGE[item.itemType];
  return (
    <div>
      <div className="py-2.5 group">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenDetail}>
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
            {item.follow_up_status === "OVERDUE" ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">
                {item.daysOverdue ? `${item.daysOverdue}d overdue` : "Overdue"}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">Today</span>
            )}
            {item.phone && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild><a href={`tel:${item.phone}`}><Phone className="w-3.5 h-3.5 text-primary" /></a></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild><a href={`sms:${item.phone}`}><MessageSquare className="w-3.5 h-3.5 text-primary" /></a></Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleInline} title="Add Note"><FileText className="w-3.5 h-3.5 text-primary" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenDetail}><ChevronRight className="w-4 h-4 text-muted-foreground" /></Button>
          </div>
        </div>
        {item.lastNotePreview && <p className="text-[11px] text-muted-foreground truncate mt-1 italic">📝 {item.lastNotePreview}</p>}
      </div>
      {inlineNoteId === item.id && (
        <div className="pb-3 space-y-2 border-t border-border/30 pt-2 bg-muted/20 rounded-b-md px-3">
          <div className="flex gap-2">
            {item.itemType === "customer" && (
              <Select value={inlineNoteType} onValueChange={setInlineNoteType}>
                <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{NOTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Input type="date" value={inlineFollowUpDate} min={toLocalDateKey()} onChange={(e) => setInlineFollowUpDate(e.target.value)} className="h-8 w-[140px] text-xs" placeholder="Next FU" />
          </div>
          {item.itemType !== "consultant" && (
            <Textarea placeholder="Quick note (optional)..." value={inlineNoteText} onChange={(e) => setInlineNoteText(e.target.value)} className="min-h-[50px] text-sm" autoFocus />
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs" onClick={onInlineSave} disabled={isPending}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Saving..." : "Mark Contacted"}
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

function BirthdayRow({ item, label, onNavigate, onAction, onDone }: { item: ActionItem; label: string; onNavigate: () => void; onAction: (type: string) => void; onDone?: () => void }) {
  const age = getBirthdayAge(item);
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", TYPE_BADGE[item.itemType].className)}>
            {TYPE_BADGE[item.itemType].label}
          </span>
          {item.vip === "VIP" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">VIP</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          🎂 {formatBirthday(item)}{age ? ` (${age})` : ""} — <span className="font-medium text-pink-600">{label}</span>
        </p>
      </div>
      <div className="flex gap-0.5 items-center shrink-0">
        {onDone && (
          <Button variant="outline" size="sm" className="h-7 text-[11px] px-2 opacity-100" onClick={onDone}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Done
          </Button>
        )}
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.phone && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild><a href={`tel:${item.phone}`}><Phone className="w-3.5 h-3.5 text-primary" /></a></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild><a href={`sms:${item.phone}`}><MessageSquare className="w-3.5 h-3.5 text-primary" /></a></Button>
            </>
          )}
          {item.email && (
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild><a href={`mailto:${item.email}`}><Mail className="w-3.5 h-3.5 text-primary" /></a></Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAction("General")}><FileText className="w-3.5 h-3.5 text-primary" /></Button>
        </div>
      </div>
    </div>
  );
}
