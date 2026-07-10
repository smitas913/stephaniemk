import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomer, fetchCustomerOrders, updateCustomer, deleteOrder, deleteCustomer, archiveCustomer, unarchiveCustomer, convertCustomerToConsultant, fetchOrders, createCustomerNote, createNote, fetchNotes, deleteNote, updateNote, deleteCustomerNote } from "@/lib/queries";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, ScanLine } from "lucide-react";
import ScanPhotoDialog from "@/components/ScanPhotoDialog";
import { supabase } from "@/integrations/supabase/client";
import { computeCustomerFields } from "@/lib/computedFields";
import { RELATIONSHIP_STATUSES, FOLLOW_UP_STAGES } from "@/lib/types";
import { formatDateOnly, toLocalDateKey } from "@/lib/dateOnly";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Plus, Trash2, Phone, MessageSquare, Mail, MapPin, Copy, Truck, ArrowRightLeft, Archive, ArchiveRestore } from "lucide-react";
import { openEmail } from "@/lib/emailPreference";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import UniversalActionPanel from "@/components/UniversalActionPanel";
import type { UniversalActionItem } from "@/components/UniversalActionPanel";
import { usePreviousLocation } from "@/hooks/usePreviousLocation";
import SkipFollowUpDialog, { type SkipChoice } from "@/components/SkipFollowUpDialog";
import { addDays as addDaysFn } from "date-fns";
import CustomerNotesTimeline from "@/components/CustomerNotesTimeline";
import ProfileCompletionCard from "@/components/ProfileCompletionCard";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { normalizeStateAbbreviation } from "@/lib/usStates";
import QuickEditFieldDialog, { type QuickEditField } from "@/components/QuickEditFieldDialog";
import TextActionButton from "@/components/TextActionButton";
import { logCatalogSent, getLastCatalogInfo, CATALOG_CYCLES, todayKey, type CatalogCycle } from "@/lib/catalogTracking";
import { BookOpen, Sparkles } from "lucide-react";
import CustomerTagChips, { DncBadge } from "@/components/CustomerTagChips";
import MergePickerDialog from "@/components/MergePickerDialog";
import { GitMerge } from "lucide-react";
import { fetchTeamConsultants } from "@/lib/queries";
import BeautyNotesCard from "@/components/BeautyNotesCard";
import ThoughtfulTouchesCard from "@/components/ThoughtfulTouchesCard";
import SkincareConversionDialog from "@/components/SkincareConversionDialog";

function FormField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-foreground pt-3 pb-1 border-b border-border/50 mb-3 first:pt-0">{title}</h3>;
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const backPath = (location.state as any)?.from || "/customers";
  // Forward the originating page (e.g. Today) when navigating to sub-forms like AddOrder,
  // so the form can return all the way back to the original context on save/cancel.
  const previousLocation = usePreviousLocation();
  const forwardOrigin = (location.state as any)?.origin || previousLocation || backPath;
  const orderOriginState = { state: { origin: forwardOrigin } } as const;

  const { data: customer } = useQuery({ queryKey: ["customer", id], queryFn: () => fetchCustomer(id!) });
  const { data: orders = [] } = useQuery({ queryKey: ["customer-orders", id], queryFn: () => fetchCustomerOrders(id!) });
  const { data: deliveryCount = 0 } = useQuery({
    queryKey: ["delivery-count", id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("daily_plan_items" as any)
        .select("*", { count: "exact", head: true })
        .eq("customer_id", id!)
        .eq("item_type", "delivery");
      if (error) throw error;
      return count || 0;
    },
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editNote, setEditNote] = useState<{ id: string; isLegacy: boolean; body: string } | null>(null);
  const [editNoteBody, setEditNoteBody] = useState("");
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<{ id: string; isLegacy: boolean } | null>(null);

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id: noteId, isLegacy, body }: { id: string; isLegacy: boolean; body: string }) => {
      if (isLegacy) {
        const { error } = await supabase.from("customer_notes").update({ note_text: body }).eq("id", noteId);
        if (error) throw error;
      } else {
        await updateNote(noteId, { note_body: body });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-unified-notes", id] });
      setEditNote(null);
      toast.success("Note updated");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update note"),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async ({ id: noteId, isLegacy }: { id: string; isLegacy: boolean }) => {
      if (isLegacy) {
        await deleteCustomerNote(noteId);
      } else {
        await deleteNote(noteId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-unified-notes", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes-unified", id] });
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      setDeleteNoteTarget(null);
      toast.success("Activity fully deleted");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to delete note"),
  });
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
  const [actionPanelInitialNote, setActionPanelInitialNote] = useState<string>("");
  const [skincarePromptOpen, setSkincarePromptOpen] = useState(false);
  // null = unchanged from saved record; true/false = user just toggled and chose conversion type
  const [skincareIsNewConversion, setSkincareIsNewConversion] = useState<boolean | null>(null);
  useEffect(() => {
    if (customer) {
      setForm({
        full_name: customer.full_name || "",
        phone: customer.phone || "",
        email: customer.email || "",
        // Display birthday as MM/DD when only mmdd known, or MM/DD/YYYY when full date known.
        birthday_input: (() => {
          const full = (customer as any).birthday as string | null;
          if (full) {
            const [y, m, d] = full.split("-");
            return `${m}/${d}/${y}`;
          }
          const mmdd = customer.birthday_mmdd || "";
          return mmdd; // already MM/DD
        })(),
        address_line_1: customer.address_line_1 || "",
        address_line_2: customer.address_line_2 || "",
        city: customer.city || "",
        state_territory: customer.state_territory || "",
        postal_code: customer.postal_code || "",
        relationship_status: customer.relationship_status || "Customer",
        profile_date_first_order_date: customer.profile_date_first_order_date || "",
        follow_up_reason: customer.follow_up_reason || "",
        notes: customer.notes || "",
        new_follow_up_stage: customer.new_follow_up_stage || "",
        next_follow_up_date: customer.next_follow_up_date || "",
        new_customer_flag: (customer as any).new_customer_flag ? "true" : "false",
        is_skincare_customer: (customer as any).is_skincare_customer ? "true" : "false",
        date_added: (customer as any).date_added || "",
        became_customer_date: (customer as any).became_customer_date || "",
        assigned_consultant_id: (customer as any).assigned_consultant_id || "__me__",
      });
    }
  }, [customer]);

  // Unified notes for recent activity
  const { data: recentUnifiedNotes = [] } = useQuery({
    queryKey: ["customer-unified-notes", id],
    queryFn: () => fetchNotes("Customer", id!),
    enabled: !!id,
  });

  const computed = useMemo(() => {
    if (!customer) return null;
    return computeCustomerFields(customer, orders);
  }, [customer, orders]);

  // Build Universal Action Panel item
  const actionPanelItem = useMemo<UniversalActionItem | null>(() => {
    if (!customer || !computed) return null;
    const recentNotes = recentUnifiedNotes.slice(0, 5).map((n: any) => ({
      date: n.note_date ? formatDateOnly(n.note_date, "MMM d") : "",
      actionType: n.note_type || "Note",
      preview: (n.note_body || "").slice(0, 80),
    }));
    // Infer typical reorder cadence from order history → snap to nearest of {30,60,90}.
    let reorderCycleDays: number | null = null;
    if (orders && orders.length >= 2) {
      const sorted = [...orders]
        .map((o: any) => o.order_date)
        .filter(Boolean)
        .sort();
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const a = new Date(sorted[i - 1] + "T00:00:00").getTime();
        const b = new Date(sorted[i] + "T00:00:00").getTime();
        const d = Math.round((b - a) / 86400000);
        if (d > 0 && d <= 365) gaps.push(d);
      }
      if (gaps.length > 0) {
        const avg = gaps.reduce((s, x) => s + x, 0) / gaps.length;
        reorderCycleDays = [30, 60, 90].reduce((best, c) =>
          Math.abs(c - avg) < Math.abs(best - avg) ? c : best, 30);
      }
    }
    return {
      id: customer.id,
      personType: "customer",
      name: customer.full_name,
      phone: customer.phone,
      email: customer.email,
      statusLabel: computed.activity_status || undefined,
      vip: computed.vip || undefined,
      followUpReason: customer.follow_up_reason || undefined,
      daysOverdue: null,
      followUpStatus: computed.follow_up_status || undefined,
      nextFollowUpDate: customer.next_follow_up_date,
      recentNotes,
      tags: (customer as any).tags || [],
      reorderCycleDays,
    };
  }, [customer, computed, recentUnifiedNotes, orders]);

  // Centralized action handler — same logic as Today workflow
  const actionMutation = useMutation({
    mutationFn: async ({ actionType, note, nextFollowUpDate, isBookingAttempt, isFollowUp, dnc }: {
      actionType: string; note: string; nextFollowUpDate?: string | null; isBookingAttempt: boolean; isFollowUp: boolean; dnc?: boolean;
    }) => {
      const today = toLocalDateKey();
      const updates: Record<string, any> = {
        last_contacted: today,
        next_follow_up_date: dnc ? null : (nextFollowUpDate || null),
      };
      // Mark Do-Not-Contact: append 'DNC' to tags. The enforce_dnc_on_customer trigger
      // will clear follow-ups, cancel daily plan items, and stop catalog campaigns.
      if (dnc) {
        const existingTags: string[] = Array.isArray((customer as any)?.tags) ? (customer as any).tags : [];
        if (!existingTags.includes("DNC")) {
          updates.tags = [...existingTags, "DNC"];
        }
      }
      await updateCustomer(id!, updates as any);
      const noteBody = note.trim() || `${actionType} follow-up completed`;
      await Promise.all([
        createCustomerNote({ customer_id: id!, note_text: noteBody, note_type: actionType }),
        createNote({
          entity_type: "Customer",
          customer_id: id!,
          person_id: id!,
          person_type: "customer",
          note_body: noteBody,
          note_type: actionType,
          next_follow_up_date: dnc ? null : (nextFollowUpDate ?? null),
          is_booking_attempt: isBookingAttempt,
          is_follow_up: isFollowUp,
        }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-unified-notes", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes-unified", id] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      queryClient.invalidateQueries({ queryKey: ["focus-daily-progress"] });
      toast.success("Activity logged — Follow-up count updated");
    },
    onError: (err: any) => {
      toast.error(`Failed to log activity: ${err.message || "Unknown error"}`);
    },
  });

  const handleLogAction = useCallback(({ actionType, note, isBookingAttempt, isFollowUp, nextFollowUpDate, dnc }: {
    item: UniversalActionItem; actionType: string; note: string; isBookingAttempt: boolean; isFollowUp: boolean; nextFollowUpDate?: string | null; dnc?: boolean;
  }) => {
    actionMutation.mutate({ actionType, note, nextFollowUpDate, isBookingAttempt, isFollowUp, dnc });
  }, [actionMutation]);

  // Atomic Skip / Did Not Contact: log the activity FIRST, then move the date.
  // Default: customers reschedule +2 days. Does not count toward Daily Reach Outs
  // (is_follow_up:false, is_booking_attempt:false) and does not update last_contacted.
  const skipMutation = useMutation({
    mutationFn: async ({ nextDate, noFollowUp }: { nextDate: string | null; noFollowUp?: boolean }) => {
      const computed = noFollowUp ? null : nextDate;
      const noteBody = "Skipped — did not reach out";
      await createNote({
        entity_type: "Customer",
        customer_id: id!,
        person_id: id!,
        person_type: "customer",
        note_body: noteBody,
        note_type: "Skipped",
        next_follow_up_date: computed,
        is_booking_attempt: false,
        is_follow_up: false,
      });
      try {
        await createCustomerNote({ customer_id: id!, note_text: noteBody, note_type: "Skipped" });
      } catch { /* non-critical */ }
      await updateCustomer(id!, {
        next_follow_up_date: computed,
        follow_up_reason: noFollowUp ? "No follow-up needed" : "Skipped — rescheduled",
      } as any);
      return computed;
    },
    onSuccess: (nextDate) => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-unified-notes", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes-unified", id] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      toast.success(nextDate ? `Skipped — rescheduled to ${formatDateOnly(nextDate as string)}` : "Skipped — follow-up cleared");
    },
    onError: (err: any) => {
      toast.error(`Failed to skip: ${err?.message || "unknown error"}`);
    },
  });

  // ─── Catalog Sent quick action ───
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogCycle, setCatalogCycle] = useState<CatalogCycle>("Spring");
  const [catalogDate, setCatalogDate] = useState<string>(todayKey());

  const catalogInfo = useMemo(() => getLastCatalogInfo(recentUnifiedNotes as any), [recentUnifiedNotes]);

  const catalogSentMutation = useMutation({
    mutationFn: async () => {
      return logCatalogSent({
        customerId: id!,
        campaignType: catalogCycle,
        mailingDate: catalogDate,
        scheduleFollowUp: true,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-unified-notes", id] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      setCatalogDialogOpen(false);
      toast.success(`Catalog logged — follow-up ${formatDateOnly(res.followUpDate)}`);
    },
    onError: (err: any) => toast.error(`Failed to log catalog: ${err?.message || "Unknown error"}`),
  });

  // ─── Sample Given quick action ───
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false);
  const [sampleName, setSampleName] = useState("");
  const [sampleDate, setSampleDate] = useState<string>(todayKey());

  const sampleGivenMutation = useMutation({
    mutationFn: async () => {
      const trimmed = sampleName.trim();
      if (!trimmed) throw new Error("Sample name required");
      const followUpDate = format(addDaysFn(parseISO(sampleDate), 7), "yyyy-MM-dd");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const { error: noteErr } = await supabase.from("notes").insert({
        entity_type: "Customer",
        customer_id: id!,
        person_type: "customer",
        person_id: id!,
        note_type: "Sample Given",
        note_body: `Sample Given — ${trimmed}`,
        note_date: sampleDate,
        next_follow_up_date: followUpDate,
        is_follow_up: false,
        is_booking_attempt: false,
        tags: ["sample"],
        owner_user_id: userId,
      } as any);
      if (noteErr) throw noteErr;

      // Push next_follow_up forward only if existing one is later or missing (sooner-priority preserved).
      const { data: existing } = await supabase
        .from("customers")
        .select("next_follow_up_date")
        .eq("id", id!)
        .maybeSingle();
      const current = (existing as any)?.next_follow_up_date as string | null;
      if (!current || current > followUpDate) {
        await supabase
          .from("customers")
          .update({
            next_follow_up_date: followUpDate,
            follow_up_reason: `Sample Follow-Up — ${trimmed}`,
          } as any)
          .eq("id", id!);
      }
      return { followUpDate };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-unified-notes", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes-unified", id] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      setSampleDialogOpen(false);
      setSampleName("");
      toast.success(`Sample logged — follow-up ${formatDateOnly(res.followUpDate)}`);
    },
    onError: (err: any) => toast.error(`Failed to log sample: ${err?.message || "Unknown error"}`),
  });

  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const handleSkip = useCallback(() => {
    setSkipDialogOpen(true);
  }, []);

  const applySkipChoice = useCallback(async (choice: SkipChoice) => {
    if (choice.kind === "pcp") {
      try {
        await logCatalogSent({ customerId: id!, campaignType: "Spring", mailingDate: todayKey(), scheduleFollowUp: true });
        queryClient.invalidateQueries({ queryKey: ["customer", id] });
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["all-notes"] });
        queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
        queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
        toast.success("Added to PCP — follow-up in 6 days");
      } catch (err: any) { toast.error(err?.message || "Failed to add to PCP"); }
      return;
    }
    if (choice.kind === "clear") {
      skipMutation.mutate({ nextDate: null, noFollowUp: true });
      return;
    }
    const nextDate = choice.kind === "days"
      ? format(addDaysFn(new Date(), choice.days), "yyyy-MM-dd")
      : choice.date;
    skipMutation.mutate({ nextDate });
  }, [id, queryClient, skipMutation]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, string>) => {
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (k === "birthday_input") continue; // handled separately below
        if (k === "new_customer_flag" || k === "is_skincare_customer") {
          cleaned[k] = v === "true";
        } else if (k === "state_territory") {
          const norm = normalizeStateAbbreviation(v);
          cleaned[k] = norm === "" ? null : norm;
        } else if (k === "assigned_consultant_id") {
          cleaned[k] = v === "__me__" || v === "" ? null : v;
        } else {
          cleaned[k] = v === "" ? null : v;
        }
      }
      // Skincare conversion handling: only stamp skincare_started_at when user
      // explicitly confirmed this is a new conversion. "Already a customer" leaves it null.
      const wasSkincare = !!(customer as any)?.is_skincare_customer;
      const willBeSkincare = cleaned.is_skincare_customer === true;
      if (willBeSkincare && !wasSkincare) {
        cleaned.skincare_started_at = skincareIsNewConversion === true ? toLocalDateKey() : null;
      } else if (!willBeSkincare && wasSkincare) {
        cleaned.skincare_started_at = null;
      }
      // Birthday: accept MM/DD, MM/DD/YYYY, M/D, M/D/YYYY, or YYYY-MM-DD.
      const raw = (data.birthday_input || "").trim();
      if (!raw) {
        cleaned.birthday = null;
        cleaned.birthday_mmdd = null;
      } else {
        const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (isoMatch) {
          const [, y, m, d] = isoMatch;
          const mm = m.padStart(2, "0"), dd = d.padStart(2, "0");
          cleaned.birthday = `${y}-${mm}-${dd}`;
          cleaned.birthday_mmdd = `${mm}/${dd}`;
        } else if (slashMatch) {
          const [, m, d, y] = slashMatch;
          const mm = m.padStart(2, "0"), dd = d.padStart(2, "0");
          cleaned.birthday_mmdd = `${mm}/${dd}`;
          if (y) {
            const fullYear = y.length === 2 ? `19${y}` : y;
            cleaned.birthday = `${fullYear}-${mm}-${dd}`;
          } else {
            cleaned.birthday = null;
          }
        } else {
          throw new Error("Birthday must be MM/DD or MM/DD/YYYY");
        }
      }
      if (cleaned.full_name === null) cleaned.full_name = customer!.full_name;
      return updateCustomer(id!, cleaned as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      setEditing(false);
      toast.success("Customer updated!");
    },
    onError: (err: any) => {
      toast.error(`Failed to save: ${err.message || "Unknown error"}`);
    },
  });

  const deleteOrderMut = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order deleted");
    },
  });

  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showMergePicker, setShowMergePicker] = useState(false);
  const { data: allConsultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const [quickEditField, setQuickEditField] = useState<QuickEditField | null>(null);
  const [showScanDialog, setShowScanDialog] = useState(false);

  const convertToConsultantMut = useMutation({
    mutationFn: () => convertCustomerToConsultant(customer!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      toast.success(`${customer!.full_name} converted to Consultant`);
      navigate("/leadership");
    },
    onError: (err: any) => toast.error(err.message || "Failed to convert"),
  });

  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const customerHasOrders = allOrders.some((o) => o.customer_id === id);

  const archiveMutation = useMutation({
    mutationFn: () => customer!.is_active !== false ? archiveCustomer(id!) : unarchiveCustomer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(customer!.is_active !== false ? "Customer archived" : "Customer restored");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Customer deleted permanently");
      navigate("/customers");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isConsultant = customer?.relationship_status === "Consultant";

  if (!customer || !computed) return <Layout><p className="text-muted-foreground text-center py-12">Loading...</p></Layout>;

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try {
      return format(parseISO(d), "MMM d, yyyy");
    } catch { return d; }
  };

  const formatDateRelative = (d: string | null | undefined) => {
    if (!d) return null;
    try {
      // Use date-only parsing to avoid timezone-induced "hours ago" confusion
      const dateKey = d.slice(0, 10);
      const todayKey = toLocalDateKey();
      if (dateKey === todayKey) return "Today";
      const parsed = parseISO(d);
      const daysDiff = Math.floor((new Date().getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff === 1) return "Yesterday";
      if (daysDiff < 7) return `${daysDiff} days ago`;
      return format(parsed, "MMM d, yyyy");
    } catch { return d; }
  };

  const statCards = [
    { label: "Activity", value: computed.activity_status || "—" },
    { label: "VIP", value: computed.vip || "—" },
    { label: "Last Order", value: computed.last_order_effective ? formatDate(computed.last_order_effective) : "—" },
    { label: "Days Since", value: computed.days_since_last_order !== null ? String(computed.days_since_last_order) : "—" },
    { label: "Orders YTD", value: String(computed.orders_this_year) },
    { label: "Retail YTD", value: `$${computed.retail_this_year.toFixed(2)}` },
    { label: "Next Follow-Up", value: computed.next_follow_up ? formatDate(computed.next_follow_up) : "—" },
    { label: "FU Status", value: computed.follow_up_status || "—" },
  ];

  const fuStatusColor = computed.follow_up_status === "OVERDUE" ? "text-destructive" : computed.follow_up_status === "TODAY" ? "text-primary" : "text-muted-foreground";

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="space-y-2">
          {/* Row 1: Back + Avatar + Name + Status */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="-ml-2 shrink-0 h-9 w-9" onClick={() => navigate(backPath)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-12 h-12 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-base">
              {customer.full_name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase())
                .join("") || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-foreground truncate">{customer.full_name}</h2>
              {computed.activity_status && (
                <span className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium mt-0.5">
                  {computed.activity_status}
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setShowScanDialog(true)}>
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">Scan Photo</span>
            </Button>
          </div>

          {/* Row 2: Tag chips */}
          <div className="flex gap-1.5 flex-wrap items-center">
            <DncBadge tags={(customer as any).tags} />
            {(customer as any).new_customer_flag && <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">New</span>}
            {(customer as any).is_skincare_customer && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">Skincare</span>}
            {computed.vip && <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">VIP</span>}
            <CustomerTagChips
              customerId={customer.id}
              tags={(customer as any).tags || []}
              isCustomer={(customer.relationship_status || "Customer") === "Customer"}
            />
          </div>

          {/* Row 3: Compact action icon bar */}
          <div className="grid grid-cols-4 gap-1.5">
            <a
              href={customer.phone ? `tel:${phoneForLink(customer.phone)}` : undefined}
              aria-disabled={!customer.phone}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 h-14 rounded-md border border-input bg-background hover:bg-accent transition-colors",
                !customer.phone && "opacity-40 pointer-events-none"
              )}
            >
              <Phone className="w-4 h-4" />
              <span className="text-xs">Call</span>
            </a>
            <a
              href={customer.phone ? `sms:${phoneForLink(customer.phone)}` : undefined}
              aria-disabled={!customer.phone}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 h-14 rounded-md border border-input bg-background hover:bg-accent transition-colors",
                !customer.phone && "opacity-40 pointer-events-none"
              )}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-xs">Text</span>
            </a>
            <a
              href={customer.email ? `mailto:${customer.email}` : undefined}
              onClick={(e) => customer.email && openEmail(customer.email, e)}
              aria-disabled={!customer.email}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 h-14 rounded-md border border-input bg-background hover:bg-accent transition-colors",
                !customer.email && "opacity-40 pointer-events-none"
              )}
            >
              <Mail className="w-4 h-4" />
              <span className="text-xs">Email</span>
            </a>
            <button
              type="button"
              onClick={() => navigate(`/orders/new?customer=${id}${!customerHasOrders ? "&type=Facial" : ""}`, orderOriginState)}
              className="flex flex-col items-center justify-center gap-0.5 h-14 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs">Order</span>
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statCards.map((s) => (
            <Card key={s.label} className="border-border/50 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className={cn("text-lg font-bold leading-tight", s.label === "FU Status" ? fuStatusColor : "text-foreground")}>{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Profile Completion */}
        <ProfileCompletionCard
          customer={customer as any}
          onQuickEdit={(f) => setQuickEditField(f)}
          onEditField={() => {
            setEditing(true);
            // Scroll the customer info card into view on next tick
            setTimeout(() => {
              document.getElementById("customer-info-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 50);
          }}
        />
        <QuickEditFieldDialog
          customer={customer as any}
          field={quickEditField}
          onClose={() => setQuickEditField(null)}
        />
        <ScanPhotoDialog open={showScanDialog} onOpenChange={setShowScanDialog} customer={customer as any} />

        {/* Customer Info Card */}
        <Card id="customer-info-card" className="border-border/50 shadow-sm scroll-mt-20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Customer Info</CardTitle>
            {!editing ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-primary text-xs">Edit</Button>
            ) : (
              <div className="flex gap-1">
                <Button size="sm" onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>
                  <Save className="w-3 h-3 mr-1" />{updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-1">
                {/* Section: Contact Info */}
                <SectionHeader title="Contact Info" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Full Name *">
                    <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="h-9" />
                  </FormField>
                  <FormField label="Phone">
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-9" />
                  </FormField>
                  <FormField label="Email">
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9" />
                  </FormField>
                  <FormField label="Birthday (MM/DD or MM/DD/YYYY)">
                    <Input
                      value={form.birthday_input || ""}
                      onChange={(e) => setForm({ ...form, birthday_input: e.target.value })}
                      placeholder="MM/DD or MM/DD/YYYY"
                      className="h-9"
                    />
                  </FormField>
                  <FormField label="Address Line 1">
                    <AddressAutocomplete
                      value={form.address_line_1}
                      onChange={(v) => setForm({ ...form, address_line_1: v })}
                      onAddressSelect={(p) => setForm({ ...form, address_line_1: p.street_address, city: p.city, state_territory: normalizeStateAbbreviation(p.state), postal_code: p.zip_code })}
                      placeholder="Street address"
                      className="h-9"
                    />
                  </FormField>
                  <FormField label="Address Line 2">
                    <Input value={form.address_line_2} onChange={(e) => setForm({ ...form, address_line_2: e.target.value })} className="h-9" />
                  </FormField>
                  <FormField label="City">
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-9" />
                  </FormField>
                  <FormField label="State">
                    <Input
                      value={form.state_territory}
                      onChange={(e) => setForm({ ...form, state_territory: e.target.value })}
                      onBlur={(e) => setForm({ ...form, state_territory: normalizeStateAbbreviation(e.target.value) })}
                      placeholder="FL"
                      maxLength={20}
                      className="h-9"
                    />
                  </FormField>
                  <FormField label="Zip Code">
                    <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className="h-9" />
                  </FormField>
                </div>

                {/* Section: Customer Status */}
                <SectionHeader title="Customer Status" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Relationship">
                    <Select value={form.relationship_status} onValueChange={(v) => setForm({ ...form, relationship_status: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{RELATIONSHIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Assigned To">
                    <Select value={form.assigned_consultant_id || "__me__"} onValueChange={(v) => setForm({ ...form, assigned_consultant_id: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__me__">Me (director)</SelectItem>
                        {(allConsultants as any[]).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="First Order Date">
                    <Input type="date" value={form.profile_date_first_order_date} onChange={(e) => setForm({ ...form, profile_date_first_order_date: e.target.value })} className="h-9" />
                  </FormField>
                  <FormField label="Date Added">
                    <Input type="date" value={form.date_added} onChange={(e) => setForm({ ...form, date_added: e.target.value })} className="h-9" />
                  </FormField>
                  <FormField label="Became Customer Date">
                    <Input
                      type="date"
                      value={(form as any).became_customer_date || ""}
                      onChange={(e) => setForm({ ...form, became_customer_date: e.target.value } as any)}
                      className="h-9"
                      placeholder="Not yet"
                    />
                  </FormField>
                  <FormField label="New Customer">
                    <div className="flex items-center gap-2 h-9">
                      <Checkbox
                        checked={(form as any).new_customer_flag === "true"}
                        onCheckedChange={(checked) => setForm({ ...form, new_customer_flag: checked ? "true" : "false" } as any)}
                      />
                      <span className="text-sm text-muted-foreground">Mark as new customer</span>
                    </div>
                  </FormField>
                  <FormField label="Skincare Customer">
                    <div className="flex items-center gap-2 h-9">
                      <Checkbox
                        checked={(form as any).is_skincare_customer === "true"}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const wasSkincare = !!(customer as any)?.is_skincare_customer;
                            if (!wasSkincare) {
                              // First-time check on this record — ask about conversion intent
                              setSkincarePromptOpen(true);
                              return;
                            }
                            setForm({ ...form, is_skincare_customer: "true" } as any);
                          } else {
                            setSkincareIsNewConversion(null);
                            setForm({ ...form, is_skincare_customer: "false" } as any);
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground">On skincare regimen</span>
                    </div>
                  </FormField>
                </div>

                {/* Section: Follow-Up & Activity */}
                <SectionHeader title="Follow-Up & Activity" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Last Contacted">
                    <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                      {formatDateRelative(customer.last_contacted) || "No contact logged"}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Auto-updated when notes are logged</p>
                  </FormField>
                  <FormField label="Next Follow-Up Date">
                    <Input type="date" value={form.next_follow_up_date} min={toLocalDateKey()} onChange={(e) => setForm({ ...form, next_follow_up_date: e.target.value })} className="h-9" />
                  </FormField>
                  <FormField label="Follow-Up Reason">
                    <Input value={form.follow_up_reason} onChange={(e) => setForm({ ...form, follow_up_reason: e.target.value })} className="h-9" placeholder="e.g. VIP Check-In" />
                  </FormField>
                  <FormField label="Stage (optional)">
                    <Select value={form.new_follow_up_stage || "none"} onValueChange={(v) => setForm({ ...form, new_follow_up_stage: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Stage</SelectItem>
                        {FOLLOW_UP_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>

                {/* Section: Notes */}
                <SectionHeader title="Notes" />
                <FormField label="General Notes" className="sm:col-span-2">
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-[80px]" placeholder="General customer notes..." />
                </FormField>
              </div>
            ) : (
              <div className="space-y-1">
                <SectionHeader title="Contact Info" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <InfoRow label="Phone" value={customer.phone} />
                  <InfoRow label="Email" value={customer.email} />
                  <InfoRow label="Birthday" value={(customer as any).birthday ? formatDate((customer as any).birthday) : customer.birthday_mmdd} />
                  {(() => {
                    const fullAddress = [customer.address_line_1, customer.address_line_2, [customer.city, customer.state_territory, customer.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
                    const mapsUrl = fullAddress ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}` : null;
                    return (
                      <div className="flex flex-col gap-0.5 py-1.5 sm:col-span-1">
                        <span className="text-muted-foreground text-xs">Address</span>
                        <span className="text-foreground">{fullAddress || "—"}</span>
                        {fullAddress && (
                          <div className="flex items-center gap-3 mt-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline w-fit">
                                  <MapPin className="w-3.5 h-3.5" />
                                  Open in Maps
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>Open in Google Maps</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline w-fit"
                                  onClick={() => { navigator.clipboard.writeText(fullAddress); toast.success("Address copied"); }}
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  Copy
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Copy address to clipboard</TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <SectionHeader title="Customer Status" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <InfoRow label="Relationship" value={customer.relationship_status} />
                  <InfoRow label="Assigned To" value={
                    (customer as any).assigned_consultant_id
                      ? (allConsultants as any[]).find((c) => c.id === (customer as any).assigned_consultant_id)?.name || "—"
                      : "Me (director)"
                  } />
                  <InfoRow label="First Order Date" value={formatDate(customer.profile_date_first_order_date)} />
                  <InfoRow label="Became Customer" value={formatDate((customer as any).became_customer_date) || "—"} />
                  <div className="flex flex-col gap-0.5 py-1.5">
                    <span className="text-muted-foreground text-xs">Deliveries</span>
                    <span className="text-foreground flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                      {deliveryCount}
                    </span>
                  </div>
                </div>

                <SectionHeader title="Follow-Up & Activity" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <InfoRow label="Last Contacted" value={formatDateRelative(customer.last_contacted) || "—"} />
                  <InfoRow label="Next Follow-Up" value={formatDate(customer.next_follow_up_date)} />
                  <InfoRow label="Follow-Up Reason" value={customer.follow_up_reason} />
                  <InfoRow label="Stage" value={customer.new_follow_up_stage} />
                  <InfoRow
                    label="Last Catalog Sent"
                    value={catalogInfo.lastDate ? formatDateOnly(catalogInfo.lastDate, "MMM d, yyyy") : "—"}
                  />
                  <InfoRow
                    label="Catalog Cycle"
                    value={
                      catalogInfo.lastDate
                        ? `${catalogInfo.campaignType || "—"}${catalogInfo.cycle ? ` · ${catalogInfo.cycle}` : ""}`
                        : "—"
                    }
                  />
                </div>

                {customer.notes && (
                  <>
                    <SectionHeader title="Notes" />
                    <p className="text-sm text-foreground whitespace-pre-wrap">{customer.notes}</p>
                  </>
                )}

                {(() => {
                  const fcd = (customer as any).former_consultant_data as Record<string, any> | null;
                  if (!fcd || typeof fcd !== "object") return null;
                  return (
                    <>
                      <SectionHeader title="Former Consultant Record" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <InfoRow label="Former Consultant ID" value={fcd.former_consultant_id || "—"} />
                        <InfoRow label="Join Date" value={formatDate(fcd.join_date) || "—"} />
                        <InfoRow label="Last Status" value={fcd.status || "—"} />
                        <InfoRow label="First Order Date" value={formatDate(fcd.first_order_date) || "—"} />
                        <InfoRow label="First Party Date" value={formatDate(fcd.first_party_date) || "—"} />
                        <InfoRow label="Archived On" value={fcd.archived_at ? formatDate(String(fcd.archived_at).slice(0, 10)) : "—"} />
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Beauty Notes */}
        <BeautyNotesCard customerId={id!} value={(customer as any)?.beauty_notes} />

        <ThoughtfulTouchesCard customerId={id!} customerName={customer?.full_name} />

        {/* Order History */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Order History ({orders.length})</CardTitle>
            <Button size="sm" variant="ghost" className="text-primary text-xs" onClick={() => navigate(`/orders/new?customer=${id}${!customerHasOrders ? "&type=Facial" : ""}`, orderOriginState)}>
              <Plus className="w-3 h-3 mr-1" />New
            </Button>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No orders yet</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatDateOnly(o.order_date)}</p>
                      <div className="flex gap-2 mt-0.5">
                        {o.order_type && <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{o.order_type}</span>}
                        {o.payment_type && <span className="text-xs text-muted-foreground">{o.payment_type}</span>}
                        {o.event_id && <span className="text-[10px] font-mono text-muted-foreground">{o.event_id}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground">${Number(o.retail_amount).toFixed(2)}</p>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteOrderMut.mutate(o.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {/* Activity — uses same Universal Action Panel as Today */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 flex-wrap">
            <CardTitle className="text-base">Notes & Activity ({recentUnifiedNotes.length})</CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => {
                setSampleDate(todayKey());
                setSampleName("");
                setSampleDialogOpen(true);
              }}>
                <Sparkles className="w-3 h-3" />Sample Given
              </Button>
              <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => {
                setActionPanelInitialNote("[Event Invite] ");
                setActionPanelOpen(true);
              }}>
                <Plus className="w-3 h-3" />Invited to Event
              </Button>
              <Button size="sm" className="text-xs gap-1" onClick={() => {
                setActionPanelInitialNote("");
                setActionPanelOpen(true);
              }}>
                <Plus className="w-3 h-3" />Log Activity
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentUnifiedNotes.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No activity yet — tap Log Activity to get started</p>
            ) : (
              <div className="space-y-2">
                {recentUnifiedNotes.map((note: any, idx: number) => {
                  const isLegacy = Array.isArray(note.tags) && note.tags.includes("legacy");
                  const isLatest = idx === 0;
                  return (
                    <div key={note.id} className={cn(
                      "p-3 rounded-lg border",
                      isLatest ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10" : "bg-muted/40 border-border/50"
                    )}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{note.note_type}</span>
                          {isLatest && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold uppercase tracking-wide">Latest</span>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            {note.created_at ? format(new Date(note.created_at), "MMM d, yyyy") : ""}
                          </span>
                          {note.next_follow_up_date && (
                            <span className="text-[11px] text-primary font-medium">
                              → Follow-up: {formatDateOnly(note.next_follow_up_date, "MMM d")}
                            </span>
                          )}
                          {isLegacy && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase tracking-wide">Legacy</span>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1 shrink-0">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setEditNote({ id: note.id, isLegacy, body: note.note_body || "" });
                              setEditNoteBody(note.note_body || "");
                            }}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteNoteTarget({ id: note.id, isLegacy })}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.note_body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Universal Action Panel */}
        <UniversalActionPanel
          item={actionPanelItem}
          open={actionPanelOpen}
          onClose={() => { setActionPanelOpen(false); setActionPanelInitialNote(""); }}
          onLogAction={handleLogAction}
          onSkip={handleSkip}
          isPending={actionMutation.isPending || skipMutation.isPending}
          initialNote={actionPanelInitialNote}
        />

        <SkipFollowUpDialog
          open={skipDialogOpen}
          onOpenChange={setSkipDialogOpen}
          personName={customer?.full_name}
          allowPcp
          onChoose={applySkipChoice}
        />

        <SkincareConversionDialog
          open={skincarePromptOpen}
          onOpenChange={setSkincarePromptOpen}
          onChoose={(isNew) => {
            setSkincareIsNewConversion(isNew);
            setForm((f) => ({ ...f, is_skincare_customer: "true" } as any));
          }}
          onCancel={() => {
            setSkincareIsNewConversion(null);
            setForm((f) => ({ ...f, is_skincare_customer: "false" } as any));
          }}
        />

        {/* Edit Note Dialog */}
        <Dialog open={!!editNote} onOpenChange={(o) => { if (!o) setEditNote(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Note</DialogTitle>
              <DialogDescription>Update the text of this activity entry.</DialogDescription>
            </DialogHeader>
            <Textarea
              value={editNoteBody}
              onChange={(e) => setEditNoteBody(e.target.value)}
              rows={5}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditNote(null)}>Cancel</Button>
              <Button
                disabled={updateNoteMutation.isPending || !editNoteBody.trim()}
                onClick={() => editNote && updateNoteMutation.mutate({ id: editNote.id, isLegacy: editNote.isLegacy, body: editNoteBody.trim() })}
              >
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Note Confirmation */}
        <AlertDialog open={!!deleteNoteTarget} onOpenChange={(o) => { if (!o) setDeleteNoteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this note?</AlertDialogTitle>
              <AlertDialogDescription>
                This activity entry will be permanently removed from the customer's history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteNoteTarget && deleteNoteMutation.mutate(deleteNoteTarget)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sent Catalog Dialog (retained for skip→PCP flow) */}
        <Dialog open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />Sent Catalog</DialogTitle>
              <DialogDescription>
                Logs a "Catalog Sent" activity and schedules a follow-up 6 days out.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Catalog Cycle *</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATALOG_CYCLES.map((c) => (
                    <Button
                      key={c}
                      type="button"
                      size="sm"
                      variant={catalogCycle === c ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setCatalogCycle(c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Mailing Date *</label>
                <Input type="date" value={catalogDate} onChange={(e) => setCatalogDate(e.target.value)} className="h-9" />
              </div>
              <Button
                className="w-full"
                onClick={() => catalogSentMutation.mutate()}
                disabled={catalogSentMutation.isPending || !catalogDate}
              >
                {catalogSentMutation.isPending ? "Logging…" : "Log Catalog Sent"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Sample Given Dialog */}
        <Dialog open={sampleDialogOpen} onOpenChange={setSampleDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Sample Given</DialogTitle>
              <DialogDescription>
                Logs a "Sample Given" activity and schedules a 7-day reorder check-in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">What sample was given? *</label>
                <Input
                  value={sampleName}
                  onChange={(e) => setSampleName(e.target.value)}
                  placeholder='e.g. "Timewise Miracle Set", "Satin Hands"'
                  className="h-9"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
                <Input type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} className="h-9" />
              </div>
              <Button
                className="w-full"
                onClick={() => sampleGivenMutation.mutate()}
                disabled={sampleGivenMutation.isPending || !sampleName.trim() || !sampleDate}
              >
                {sampleGivenMutation.isPending ? "Logging…" : "Log Sample Given"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>


        {/* Convert to Consultant */}
        {!isConsultant && customer.relationship_status !== "Former Consultant" && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Convert to Consultant</p>
                <p className="text-xs text-muted-foreground">Move this person to the Leadership module. All history will be preserved.</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowConvertConfirm(true)}>
                <ArrowRightLeft className="w-3.5 h-3.5" />Convert
              </Button>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={showConvertConfirm} onOpenChange={setShowConvertConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Convert to Consultant?</AlertDialogTitle>
              <AlertDialogDescription>
                {customer.full_name} will be moved to the Consultants list under Leadership. Their order history and notes will be preserved, but they will be removed from customer follow-ups.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => convertToConsultantMut.mutate()} disabled={convertToConsultantMut.isPending}>
                {convertToConsultantMut.isPending ? "Converting..." : "Convert"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Archive / Delete Actions */}
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Manage Customer</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowArchiveConfirm(true)}
              >
                {customer.is_active !== false ? (
                  <><Archive className="w-3.5 h-3.5" />Archive</>
                ) : (
                  <><ArchiveRestore className="w-3.5 h-3.5" />Restore</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowMergePicker(true)}
              >
                <GitMerge className="w-3.5 h-3.5" />Merge duplicate
              </Button>
            </div>
          </CardContent>
        </Card>

        <MergePickerDialog
          open={showMergePicker}
          onOpenChange={setShowMergePicker}
          currentId={customer.id}
          currentName={customer.full_name}
          kind="customer"
          onMerged={(keepId) => { if (keepId !== customer.id) navigate(`/customers/${keepId}`); }}
        />

        {/* Archive Confirmation */}
        <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{customer.is_active !== false ? "Archive" : "Restore"} {customer.full_name}?</AlertDialogTitle>
              <AlertDialogDescription>
                {customer.is_active !== false
                  ? "This customer will be moved to the archived list. You can restore them at any time."
                  : "This customer will be restored to the active list."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>
                {archiveMutation.isPending ? "Processing..." : customer.is_active !== false ? "Archive" : "Restore"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently Delete {customer.full_name}?</AlertDialogTitle>
              <AlertDialogDescription>
                {customerHasOrders
                  ? "This customer cannot be deleted because they have order history. Use Archive instead to hide them from the active list."
                  : "This will permanently delete this customer and all their data. This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {!customerHasOrders && (
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}
