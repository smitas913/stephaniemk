import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCustomers, fetchOrders, updateCustomer, createCustomerNote, fetchLatestNotes, fetchCustomerNotes,
  fetchProspects, updateProspect, createProspectNote, fetchProspectNotes,
  bulkUpdateCustomerFollowUps, fetchBookingLeads, updateBookingLead,
  fetchTeamConsultants, updateTeamConsultant, fetchEvents, updateEvent,
  fetchAllLatestNotes,
} from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import { NOTE_TYPES } from "@/lib/types";
import type { Customer, CustomerComputed, CustomerNote, ProspectNote, BookingLead, TeamConsultant, EventRecord } from "@/lib/types";
import Layout from "@/components/Layout";
import TodaysFocus from "@/components/TodaysFocus";
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
import { Cake, Phone, MessageSquare, Mail, FileText, CheckCircle2, CalendarRange, ExternalLink, Clock, ChevronRight, CalendarCheck, Calendar, Users, Crown } from "lucide-react";
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
  itemType: "customer" | "prospect" | "consultant" | "hostess";
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
  birthday_mmdd?: string | null;
  birthday?: string | null;
  daysOverdue?: number | null;
  followUpReason?: string;
  lastNotePreview?: string;
  lastContacted?: string | null;
  actionLabel: string;
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
  consultant: { label: "Consultant", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", icon: Crown },
  hostess: { label: "Hostess", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: Crown },
};

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
  const isLoading = cLoading || oLoading;

  // ─── Compute Today's Focus metrics from completed actions ───
  const { reachOutsToday, bookingsToday, sharingToday } = useMemo(() => {
    const todayKey = toLocalDateKey();
    const contactTypes = new Set(["Call", "Text", "Email", "In Person"]);

    // Reach-outs: customer_notes + unified notes logged today with contact types
    const customerNoteReachOuts = allNotes.filter(
      (n) => n.created_at.startsWith(todayKey) && contactTypes.has(n.note_type)
    ).length;
    const unifiedNoteReachOuts = unifiedNotes.filter(
      (n) => n.created_at.startsWith(todayKey) && contactTypes.has(n.note_type)
    ).length;
    // Deduplicate: unified notes cover customers & prospects; customer_notes is legacy
    // Use the higher count to avoid double-counting
    const reachOuts = Math.max(customerNoteReachOuts, unifiedNoteReachOuts);

    // Bookings: events created today
    const bookings = events.filter((e) => e.created_at.startsWith(todayKey)).length;

    // Sharing: prospect notes or unified notes with sharing-related content logged today
    // Count prospects that moved to "Shared" status today, or sharing_appointments on events today
    const sharingFromProspects = prospects.filter(
      (p) => p.opportunity_status === "Shared" && p.updated_at?.startsWith(todayKey)
    ).length;
    const sharingFromEvents = events
      .filter((e) => e.event_date === todayKey)
      .reduce((sum, e) => sum + (e.sharing_appointments_count || 0), 0);
    const sharing = sharingFromProspects + sharingFromEvents;

    return { reachOutsToday: reachOuts, bookingsToday: bookings, sharingToday: sharing };
  }, [allNotes, unifiedNotes, events, prospects]);

  // UI state
  const [showUpcoming7, setShowUpcoming7] = useState(false);
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

  const notesByCustomer = useMemo(() => {
    const map = new Map<string, CustomerNote>();
    for (const n of allNotes) { if (!map.has(n.customer_id)) map.set(n.customer_id, n); }
    return map;
  }, [allNotes]);

  const enrichedCustomers = useMemo(() => {
    return customers.filter((c) => c.is_active !== false).map((c) => {
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
  const { todayActions, upcomingActions, todayEvents, upcomingEvents, birthdaysToday, birthdaysUpcoming, bookingLeadsDue } = useMemo(() => {
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
      return {
        id: c.id, itemType: "customer" as const, name: c.full_name,
        phone: c.phone, email: c.email, vip: c.vip,
        next_follow_up: effectiveFollowUp, follow_up_status: followUpStatus,
        activity_status: c.activity_status, days_since_last_order: c.days_since_last_order,
        new_follow_up_stage: c.new_follow_up_stage, birthday_mmdd: c.birthday_mmdd,
        birthday: c.birthday, daysOverdue,
        followUpReason: c.follow_up_reason || "Customer Follow-Up",
        lastNotePreview: notePreview, lastContacted: c.last_contacted,
        actionLabel: "Follow-up",
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

    const allItems = [...customerItems, ...prospectItems, ...consultantItems, ...hostessItems];
    const sortItems = (items: ActionItem[]) => items.sort((a, b) => {
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

    // Events
    const todayEvents = events.filter((e) => e.event_date && normalizeDateOnly(e.event_date) === todayKey && !e.is_archived);
    const upcomingEvents = events.filter((e) => {
      if (!e.event_date || e.is_archived) return false;
      const normalized = normalizeDateOnly(e.event_date);
      return normalized && normalized > todayKey && normalized! <= upcoming7Key;
    }).sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));

    // Birthdays
    const birthdaysToday: (ActionItem & { _daysUntil?: number })[] = [];
    const birthdaysUpcoming: (ActionItem & { _daysUntil: number })[] = [];
    for (const c of customerItems) {
      const days = daysToBirthday({ birthday: c.birthday, birthday_mmdd: c.birthday_mmdd });
      if (days === null) continue;
      if (days === 0) birthdaysToday.push(c);
      else if (days <= 7) birthdaysUpcoming.push({ ...c, _daysUntil: days });
    }
    birthdaysUpcoming.sort((a, b) => a._daysUntil - b._daysUntil);

    // Booking leads
    const bookingLeadsDue = bookingLeads
      .map((lead) => ({ ...lead, next_follow_up_date: normalizeFollowUpDate(lead.next_follow_up_date) }))
      .filter((lead) => lead.status !== "Booked" && lead.status !== "Not Interested" && lead.next_follow_up_date && isDueTodayOrEarlier(lead.next_follow_up_date, todayKey))
      .sort((a, b) => (getDateOnlyTime(a.next_follow_up_date) ?? Number.MAX_SAFE_INTEGER) - (getDateOnlyTime(b.next_follow_up_date) ?? Number.MAX_SAFE_INTEGER));

    return { todayActions, upcomingActions, todayEvents, upcomingEvents, birthdaysToday, birthdaysUpcoming, bookingLeadsDue };
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
        if (note.trim()) await createCustomerNote({ customer_id: item.id, note_text: note.trim(), note_type: type });
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes"] });
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
      if (detailItem.itemType === "customer") await createCustomerNote({ customer_id: detailItem.id, note_text: detailNoteText.trim(), note_type: detailNoteType });
      else if (detailItem.itemType === "prospect") await createProspectNote({ prospect_id: detailItem.id, note_text: detailNoteText.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notes", detailItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["prospect-notes", detailItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setDetailFollowUpDate(""); toast.success("Date updated");
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
  const openDetailSheet = (item: ActionItem) => { setDetailItem(item); setDetailNoteText(""); setDetailNoteType("General"); setDetailFollowUpDate(item.next_follow_up || ""); };
  const handleSubmitAction = () => { if (!actionItem) return; contactMutation.mutate({ item: actionItem, note: noteText, type: noteType, nextDate: normalizeFollowUpDate(followUpDate) || undefined }); };
  const toggleInlineNote = (item: ActionItem) => { if (inlineNoteId === item.id) { setInlineNoteId(null); } else { setInlineNoteId(item.id); setInlineNoteText(""); setInlineNoteType("Call"); setInlineFollowUpDate(""); } };
  const navigateToItem = (item: ActionItem) => {
    if (item.itemType === "customer") navigate(`/customers/${item.id}`);
    else if (item.itemType === "prospect") navigate(`/prospects/${item.id}`);
    else if (item.itemType === "hostess") {
      const evt = events.find(e => e.id === item.id);
      if (evt) navigate(`/events/${evt.event_id}`);
      else navigate("/events");
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

                    {/* Unified Action List */}
                    <Card className="border-border/50 shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30">
                            <Phone className="w-4 h-4 text-blue-600" />
                          </div>
                          <CardTitle className="text-sm font-semibold text-foreground">Actions for Today</CardTitle>
                          <Badge variant="secondary" className="text-xs">{todayActions.length}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {todayActions.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-6 text-center">All caught up! 🎉</p>
                        ) : (
                          <div className="divide-y divide-border/40">
                            {todayActions.map((item) => (
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
                        )}
                      </CardContent>
                    </Card>


                    {/* Booking Leads */}
                    {bookingLeadsDue.length > 0 && (
                      <Card className="border-border/50 shadow-sm">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30">
                                <CalendarCheck className="w-4 h-4 text-amber-600" />
                              </div>
                              <CardTitle className="text-sm font-semibold text-foreground">Booking Leads</CardTitle>
                              <Badge variant="secondary" className="text-xs">{bookingLeadsDue.length}</Badge>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/booking-leads")}>View All</Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="divide-y divide-border/40">
                            {bookingLeadsDue.map((lead) => (
                              <div key={lead.id} className="py-2.5 flex items-center gap-3 group">
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate("/booking-leads")}>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground truncate">{lead.name}</p>
                                    {lead.lead_source && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">{lead.lead_source}</span>}
                                  </div>
                                  <div className="flex items-center gap-x-3 text-xs text-muted-foreground mt-0.5">
                                    {lead.phone && <span>{lead.phone}</span>}
                                    <span>FU: {formatDateOnly(lead.next_follow_up_date)}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {lead.phone && (
                                    <>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild><a href={`tel:${lead.phone}`}><Phone className="w-3.5 h-3.5 text-primary" /></a></Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild><a href={`sms:${lead.phone}`}><MessageSquare className="w-3.5 h-3.5 text-primary" /></a></Button>
                                    </>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => bookingLeadContactMut.mutate(lead)} title="Mark Contacted">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Right Column (1/3) */}
                  <div className="space-y-4">
                    <TodaysFocus reachOutsToday={reachOutsToday} bookingsToday={bookingsToday} sharingToday={sharingToday} />

                    {/* Today's Events */}
                    <Card className="border-border/50 shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
                            <Calendar className="w-4 h-4 text-emerald-600" />
                          </div>
                          <CardTitle className="text-sm font-semibold text-foreground">Today's Events</CardTitle>
                          <Badge variant="secondary" className="text-xs">{todayEvents.length}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {todayEvents.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3 text-center">No events today</p>
                        ) : (
                          <div className="divide-y divide-border/40">
                            {todayEvents.map((evt) => (
                              <div key={evt.id} className="py-2.5 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-md px-1"
                                onClick={() => navigate(`/events/${evt.event_id}`)}>
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
                        )}
                      </CardContent>
                    </Card>


                    <Card className="border-border/50 shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-pink-50 dark:bg-pink-950/30">
                              <Cake className="w-4 h-4 text-pink-600" />
                            </div>
                            <CardTitle className="text-sm font-semibold text-foreground">Birthdays</CardTitle>
                            <Badge variant="secondary" className="text-xs">{birthdaysToday.length}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground cursor-pointer" htmlFor="upcoming-toggle">7 days</label>
                            <Switch id="upcoming-toggle" checked={showUpcoming7} onCheckedChange={setShowUpcoming7} />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {birthdaysToday.length === 0 && (!showUpcoming7 || birthdaysUpcoming.length === 0) ? (
                          <p className="text-sm text-muted-foreground py-3 text-center">No birthdays {showUpcoming7 ? "this week" : "today"} 🎂</p>
                        ) : (
                          <div className="space-y-0.5">
                            {birthdaysToday.map((c) => (
                              <BirthdayRow key={c.id} item={c} label="Today 🎉" onNavigate={() => navigateToItem(c)} onAction={(type) => openContactDialog(c, type)} />
                            ))}
                            {showUpcoming7 && birthdaysUpcoming.map((c) => (
                              <BirthdayRow key={c.id} item={c} label={`in ${c._daysUntil}d`} onNavigate={() => navigateToItem(c)} onAction={(type) => openContactDialog(c, type)} />
                            ))}
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
                    <Button variant="outline" size="sm" asChild><a href={`tel:${actionItem.phone}`}><Phone className="w-3.5 h-3.5 mr-1" />Call</a></Button>
                    <Button variant="outline" size="sm" asChild><a href={`sms:${actionItem.phone}`}><MessageSquare className="w-3.5 h-3.5 mr-1" />Text</a></Button>
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
                  {detailItem.lastContacted && <span>Last contact: {formatLastContacted(detailItem.lastContacted)}</span>}
                  {detailItem.days_since_last_order != null && <span>{detailItem.days_since_last_order}d since last order</span>}
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
              {/* Update date */}
              <div className="mb-6 p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CalendarRange className="w-3 h-3" />
                  {detailItem?.itemType === "consultant" ? "Next Coaching Date" : "Next Follow-Up Date"}
                </label>
                <div className="flex gap-2">
                  <Input type="date" value={detailFollowUpDate} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDetailFollowUpDate(e.target.value)} className="h-9 flex-1" />
                  <Button size="sm" onClick={() => detailFollowUpMutation.mutate()} disabled={detailFollowUpMutation.isPending || !detailFollowUpDate}>
                    {detailFollowUpMutation.isPending ? "Saving..." : "Update"}
                  </Button>
                </div>
              </div>

              {/* Add note (not for consultants) */}
              {detailItem?.itemType !== "consultant" && (
                <div className="mb-6 p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> Add Note</label>
                  {detailItem?.itemType === "customer" && (
                    <Select value={detailNoteType} onValueChange={setDetailNoteType}>
                      <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{NOTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <Textarea placeholder="Enter note..." value={detailNoteText} onChange={(e) => setDetailNoteText(e.target.value)} className="min-h-[60px]" />
                  <Button size="sm" onClick={() => detailNoteMutation.mutate()} disabled={detailNoteMutation.isPending || !detailNoteText.trim()}>
                    {detailNoteMutation.isPending ? "Saving..." : "Save Note"}
                  </Button>
                </div>
              )}

              {/* Notes Timeline */}
              {detailItem?.itemType !== "consultant" && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notes History</h4>
                  {detailItem?.itemType === "customer" ? (
                    detailNotes.length === 0 ? (
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
                    )
                  ) : (
                    detailProspectNotes.length === 0 ? (
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
                    )
                  )}
                </div>
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

function BirthdayRow({ item, label, onNavigate, onAction }: { item: ActionItem; label: string; onNavigate: () => void; onAction: (type: string) => void }) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
        <p className="text-sm font-medium text-foreground truncate">
          {item.name}
          {item.vip === "VIP" && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium align-middle">VIP</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          🎂 {formatBirthday(item)} — <span className="font-medium text-pink-600">{label}</span>
        </p>
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
  );
}
