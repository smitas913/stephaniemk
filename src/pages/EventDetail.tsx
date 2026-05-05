import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchEvents, fetchOrders, upsertEvent, generateGuestInviteTask, fetchEventTasksByEventId, completeEventTask, createNote, fetchAllLatestNotes, convertHostessToCustomer, fetchCustomers, fetchZoomDefaults } from "@/lib/queries";
import type { EventTask } from "@/lib/queries";
import { formatDateOnly, parseLocalDate, toLocalDateKey } from "@/lib/dateOnly";
import { addDays, format } from "date-fns";
import { COACHING_STATUSES, EVENT_STATUSES, RESCHEDULE_STATUSES } from "@/lib/types";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import type { EventRecord, OrderWithCustomer } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EventGuestPanel from "@/components/EventGuestPanel";
import Layout from "@/components/Layout";
import UniversalActionPanel from "@/components/UniversalActionPanel";
import type { UniversalActionItem } from "@/components/UniversalActionPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, DollarSign, Users, ShoppingBag, TrendingUp, CalendarDays, CalendarIcon, Phone, Mail, ClipboardCheck, ExternalLink, MessageSquare, Plus, UserPlus, CheckCircle2, RefreshCw } from "lucide-react";
import { openEmail } from "@/lib/emailPreference";
import { cn } from "@/lib/utils";
import TextActionButton from "@/components/TextActionButton";
import { toast } from "sonner";

const EVENT_TYPES = ["Party", "Facial", "Sharing Appointment", "Networking Event", "Vendor Event"] as const;
const EVENT_FORMATS = ["In-Person", "Virtual"] as const;

// Coaching prep steps in order — each one drives booking rate
const PREP_STEPS = [
  { field: "checklist_google_form_completed",  label: "Hostess pre-profile form sent & completed",      hint: "Send the Google form right after booking so you can personalize her event" },
  { field: "checklist_guest_list_received",    label: "Guest list received from hostess",               hint: "Follow up if you haven't heard back — this unlocks the next steps" },
  { field: "checklist_invitations_sent",       label: "Invitation made & sent to guests",               hint: "Send your Canva invite + guest form so you can prep goody bags" },
  { field: "checklist_samples_sent",           label: "Goody bags prepped & pictures sent to guests",   hint: "Sending personalized goody bag pics gets guests excited and more likely to show" },
  { field: "checklist_reminders_sent",         label: "Soft reach out + guest reminders sent (2-3 days out)", hint: "Biggest driver of attendance — don't skip this one" },
  { field: "checklist_day_before_sent",        label: "Day-before reminder sent to guests",             hint: "A quick excited message the day before keeps energy high and reduces no-shows" },
];

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: zoomDefaults } = useQuery({ queryKey: ["zoom-defaults"], queryFn: fetchZoomDefaults });
  const { data: eventTasks = [] } = useQuery({
    queryKey: ["event-tasks", eventId],
    queryFn: () => fetchEventTasksByEventId(eventId!),
    enabled: !!eventId,
  });
  const { data: unifiedNotes = [] } = useQuery({ queryKey: ["unified-notes"], queryFn: fetchAllLatestNotes });

  const event = useMemo(() => events.find((e) => e.event_id === eventId), [events, eventId]);

  const linkedOrders = useMemo(() =>
    allOrders.filter((o) => o.event_id === eventId || o.parent_event_id === eventId)
      .sort((a, b) => a.order_date.localeCompare(b.order_date)),
    [allOrders, eventId]
  );

  const totalSales = linkedOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
  const totalDiscounts = linkedOrders.reduce((s, o: any) => s + Number(o.discount_amount || 0), 0);
  const totalNetProfit = linkedOrders.reduce((s, o: any) => s + Number(o.net_profit || 0), 0);
  const guestCount = event?.guest_count || 0;
  const orderCount = linkedOrders.length;
  const avgOrder = orderCount > 0 ? totalSales / orderCount : 0;
  const convRate = guestCount > 0 ? ((orderCount / guestCount) * 100).toFixed(0) : null;

  // ─── Hostess Action Panel ───
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
  const [actionPanelItem, setActionPanelItem] = useState<UniversalActionItem | null>(null);

  const openHostessActionPanel = useCallback(() => {
    if (!event?.hostess_name) return;
    const recentNotes = unifiedNotes
      .filter((n: any) => n.entity_type === "Hostess" && n.note_body?.includes(event.hostess_name!))
      .slice(0, 5)
      .map((n: any) => ({
        date: n.note_date ? formatDateOnly(n.note_date, "MMM d") : "",
        actionType: n.note_type || "Note",
        preview: (n.note_body || "").slice(0, 80),
      }));
    setActionPanelItem({
      id: event.id,
      personType: "hostess",
      name: event.hostess_name,
      phone: event.hostess_phone || null,
      email: event.hostess_email || null,
      statusLabel: `${event.event_type || "Event"} — ${event.event_status || "Booked"}`,
      followUpReason: (event as any).hostess_next_action || "Hostess Coaching",
      nextFollowUpDate: (event as any).hostess_next_action_date || null,
      recentNotes,
    });
    setActionPanelOpen(true);
  }, [event, unifiedNotes]);

  const hostessActionMutation = useMutation({
    mutationFn: async ({ item: uItem, actionType, note, isBookingAttempt, isFollowUp, nextFollowUpDate }: {
      item: UniversalActionItem; actionType: string; note: string;
      isBookingAttempt: boolean; isFollowUp: boolean; nextFollowUpDate?: string | null;
    }) => {
      const updates: Record<string, string | null> = {};
      if (nextFollowUpDate) updates.hostess_next_action_date = nextFollowUpDate;
      if (Object.keys(updates).length > 0) {
        await upsertEvent({ event_id: event!.event_id, ...updates } as any);
      }
      const hostessName = event!.hostess_name || "Hostess";
      const hostessNoteBody = note.trim()
        ? `[${hostessName}] ${note.trim()}`
        : `[${hostessName}] ${actionType} hostess contact`;
      await createNote({
        entity_type: "Hostess",
        note_body: hostessNoteBody,
        note_type: actionType,
        next_step: null,
        next_follow_up_date: nextFollowUpDate ?? null,
        is_booking_attempt: isBookingAttempt,
        is_follow_up: isFollowUp,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["focus-daily-progress"] });
      toast.success("Hostess activity logged");
    },
  });

  const handleHostessAction = useCallback((params: any) => {
    hostessActionMutation.mutate(params);
  }, [hostessActionMutation]);

  const convertHostessMutation = useMutation({
    mutationFn: () => convertHostessToCustomer(event!),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`${customer.full_name} added to your client list!`);
    },
    onError: (err: any) => toast.error(err.message || "Failed to convert hostess"),
  });

  const eventMutation = useMutation({
    mutationFn: (params: Partial<EventRecord> & { event_id: string }) => upsertEvent(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });

  // Post-event completion dialog
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [completionData, setCompletionData] = useState({ guest_count: "", bookings: "", sharings: "" });
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const handleStatusChange = (val: string) => {
    if (!event || val === (event.event_status || "Booked")) return;
    if (val === "Held") {
      setPendingStatus(val);
      setCompletionData({ guest_count: "", bookings: "", sharings: "" });
      setShowCompletionDialog(true);
    } else if (val === "Cancelled") {
      // Clear rescheduling status when cancelling — they're mutually exclusive
      eventMutation.mutate({
        event_id: event.event_id,
        event_status: "Cancelled",
        reschedule_status: "None",
        reschedule_next_follow_up_date: null,
      } as any);
    } else {
      eventMutation.mutate({ event_id: event.event_id, event_status: val } as any);
    }
  };

  const submitCompletion = () => {
    if (!event || !pendingStatus) return;
    eventMutation.mutate({
      event_id: event.event_id,
      event_status: pendingStatus,
      guest_count: parseInt(completionData.guest_count) || 0,
      future_bookings_count: parseInt(completionData.bookings) || 0,
      sharing_appointments_count: parseInt(completionData.sharings) || 0,
    } as any);
    setShowCompletionDialog(false);
    setPendingStatus(null);
  };

  // Post-event prompt for past booked events
  const [showPostEventPrompt, setShowPostEventPrompt] = useState(false);
  const isPastEvent = event?.event_date && event.event_date < toLocalDateKey() && (event.event_status || "Booked") === "Booked";
  useEffect(() => {
    if (isPastEvent) setShowPostEventPrompt(true);
  }, [isPastEvent]);

  if (!eventId) return null;

  const handleDateSelect = (date: Date | undefined) => {
    if (!date || !event) return;
    const dateStr = toLocalDateKey(date);
    if (dateStr !== event.event_date) {
      eventMutation.mutate({ event_id: event.event_id, event_date: dateStr });
    }
  };

  const updateField = (field: string, value: any) => {
    if (!event) return;
    eventMutation.mutate({ event_id: event.event_id, [field]: value } as any);
  };

  const toggleChecklist = async (field: string) => {
    if (!event) return;
    const newValue = !(event as any)[field];
    eventMutation.mutate({ event_id: event.event_id, [field]: newValue } as any);
    if (field === "checklist_google_form_completed" && newValue) {
      try {
        await generateGuestInviteTask(event.event_id);
        queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
        toast.success("Task created: Send Guest Invite + Guest Form");
      } catch (e) {
        console.error("Failed to create guest invite task", e);
      }
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await completeEventTask(taskId);
      queryClient.invalidateQueries({ queryKey: ["event-tasks", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      toast.success("Task completed");
    } catch (e: any) {
      toast.error(e.message || "Failed to complete task");
    }
  };

  // Check if hostess is already a customer — by phone OR by name (case-insensitive)
  const existingCustomer = useMemo(() => {
    if (!event?.hostess_name && !event?.hostess_phone) return null;
    return customers.find((c: any) => {
      const phoneMatch = event?.hostess_phone && c.phone &&
        c.phone.replace(/\D/g, "") === event.hostess_phone.replace(/\D/g, "");
      const nameMatch = event?.hostess_name &&
        c.full_name?.toLowerCase().trim() === event.hostess_name.toLowerCase().trim();
      return phoneMatch || nameMatch;
    }) || null;
  }, [customers, event?.hostess_name, event?.hostess_phone]);

  // Controlled local state for location field so it stays in sync when venue type changes
  const [localLocation, setLocalLocation] = useState((event as any)?.event_location || "");
  // Keep in sync when event loads or changes
  useMemo(() => {
    setLocalLocation((event as any)?.event_location || "");
  }, [(event as any)?.event_location]);

  // Prep progress
  const prepDone = event ? PREP_STEPS.filter(s => (event as any)[s.field]).length : 0;
  const prepTotal = PREP_STEPS.length;

  // ── Rebook sequence ──
  const [showReactivate, setShowReactivate] = useState(false);
  const [reactivateDate, setReactivateDate] = useState("");

  const isReschedulingOrCancelled = event &&
    (event.event_status === "Cancelled" || (event as any).reschedule_status === "In Process of Rescheduling");

  // Calculate next follow-up date based on attempt number
  const getNextRebookDate = (attemptNumber: number): string => {
    const delays = [2, 7, 7, 30]; // days for attempts 0-3
    const days = attemptNumber < delays.length ? delays[attemptNumber] : 90;
    return format(addDays(new Date(), days), "yyyy-MM-dd");
  };

  const rebookAttemptNumber = (event as any)?.reschedule_attempt_number ?? 0;
  const rebookNextDate = (event as any)?.reschedule_next_follow_up_date;
  const rebookNotInterested = (event as any)?.rebook_not_interested;

  const rebookStepLabel = (attempt: number) => {
    if (attempt === 0) return "First reach out (2 days after cancel)";
    if (attempt === 1) return "Second reach out (1 week later)";
    if (attempt === 2) return "Third reach out (1 week later)";
    if (attempt === 3) return "Fourth reach out (1 month later)";
    return `Quarterly check-in (every 90 days)`;
  };

  const logRebookAttemptMut = useMutation({
    mutationFn: async () => {
      const nextAttempt = rebookAttemptNumber + 1;
      const nextDate = getNextRebookDate(nextAttempt);
      await upsertEvent({
        event_id: event!.event_id,
        reschedule_attempt_number: nextAttempt,
        reschedule_next_follow_up_date: nextDate,
      } as any);
      await createNote({
        entity_type: "Hostess",
        person_type: "hostess",
        person_id: event!.id,
        note_body: `Rebook attempt #${nextAttempt} — ${rebookStepLabel(rebookAttemptNumber)}`,
        note_type: "Call",
        is_booking_attempt: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Rebook attempt logged — next follow-up scheduled");
    },
  });

  const markRebookNotInterestedMut = useMutation({
    mutationFn: async () => {
      await upsertEvent({
        event_id: event!.event_id,
        rebook_not_interested: true,
        reschedule_next_follow_up_date: null,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Marked not interested — event stays in your hold rate stats");
    },
  });

  const reactivateEventMut = useMutation({
    mutationFn: async (newDate: string) => {
      await upsertEvent({
        event_id: event!.event_id,
        event_date: newDate,
        event_status: "Booked",
        reschedule_status: "None",
        reschedule_attempt_number: 0,
        reschedule_next_follow_up_date: null,
        rebook_not_interested: false,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setShowReactivate(false);
      toast.success("Event reactivated with new date!");
    },
  });

  // Pending workflow tasks
  const pendingTasks = eventTasks.filter((t: EventTask) => !t.is_completed);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Layout>
      <div className="space-y-5 pb-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
            const from = (location.state as any)?.from;
            if (from) navigate(from); else navigate(-1);
          }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {event?.hostess_name ? `${event.hostess_name}'s Event` : "Event Detail"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {event?.event_date ? formatDateOnly(event.event_date) : "No date set"}
              {event?.event_type ? ` · ${event.event_type}` : ""}
            </p>
          </div>
          {event && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant={event.event_status === "Held" ? "default" : event.event_status === "Cancelled" ? "destructive" : "secondary"} className="text-xs">
                {event.event_status || "Booked"}
              </Badge>
              {event.reschedule_status && event.reschedule_status !== "None" && (
                <Badge variant="outline" className="text-xs">{event.reschedule_status}</Badge>
              )}
            </div>
          )}
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Date</span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {event?.event_date ? formatDateOnly(event.event_date) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sales</span>
              </div>
              <p className="text-lg font-bold text-green-600">${totalSales.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Guests</span>
              </div>
              <p className="text-lg font-bold text-purple-600">{guestCount || "—"}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Conversion</span>
              </div>
              <p className="text-lg font-bold text-blue-600">{convRate ? `${convRate}%` : "—"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="details">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="details" className="flex-1 sm:flex-none">Details & Hostess</TabsTrigger>
            <TabsTrigger value="prep" className="flex-1 sm:flex-none">
              Event Coaching
              {event && prepDone < prepTotal && (
                <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 font-bold rounded-full px-1.5">
                  {prepTotal - prepDone}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="guests" className="flex-1 sm:flex-none">
              Guests & Orders
              {orderCount > 0 && (
                <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground font-bold rounded-full px-1.5">
                  {orderCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Details & Hostess ── */}
          <TabsContent value="details" className="mt-4">
            {event ? (
              <div className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Event Details</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Date */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Date</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full h-9 text-sm justify-start font-normal", !event.event_date && "text-muted-foreground")}>
                              <CalendarIcon className="w-3.5 h-3.5 mr-2" />
                              {event.event_date ? formatDateOnly(event.event_date, "MMM d, yyyy") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={event.event_date ? parseLocalDate(event.event_date) : undefined} onSelect={handleDateSelect} initialFocus className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      {/* Time */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Time</label>
                        <Input type="time" className="h-9 text-sm" defaultValue={(event as any).event_time || ""} key={`et-${(event as any).event_time}`}
                          onBlur={(e) => { if (e.target.value !== ((event as any).event_time || "")) updateField("event_time", e.target.value || null); }} />
                      </div>
                      {/* Event Type */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Type</label>
                        <Select value={event.event_type || ""} onValueChange={(val) => { if (val !== (event.event_type || "")) eventMutation.mutate({ event_id: event.event_id, event_type: val }); }}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {/* Format */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Format</label>
                        <Select value={event.event_format || "In-Person"} onValueChange={(val) => {
                          if (val !== (event.event_format || "In-Person")) {
                            eventMutation.mutate({ event_id: event.event_id, event_format: val } as any);
                            // Auto-fill zoom link when switching to Virtual
                            if (val === "Virtual" && zoomDefaults?.zoom_link) {
                              setLocalLocation(zoomDefaults.zoom_link);
                              updateField("event_location", zoomDefaults.zoom_link);
                            }
                          }
                        }}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{EVENT_FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {/* Status */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
                        <Select value={event.event_status || "Booked"} onValueChange={handleStatusChange}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{EVENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {/* Reschedule Status */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reschedule Status</label>
                        <Select value={(event as any).reschedule_status || "None"} onValueChange={(val) => { if (val !== ((event as any).reschedule_status || "None")) eventMutation.mutate({ event_id: event.event_id, reschedule_status: val } as any); }}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{RESCHEDULE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {/* Location — smart based on format */}
                      {(event.event_format || "In-Person") === "Virtual" ? (
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Meeting Link</label>
                          <Input className="h-9 text-sm"
                            placeholder="Zoom link or meeting URL"
                            value={localLocation}
                            onChange={(e) => setLocalLocation(e.target.value)}
                            onBlur={(e) => { if (e.target.value !== ((event as any).event_location || "")) updateField("event_location", e.target.value || null); }} />
                          {/* Always show zoom defaults as a quick-fill */}
                          {(zoomDefaults?.zoom_link || zoomDefaults?.zoom_id) && (
                            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">Your saved Zoom info:</p>
                              {zoomDefaults?.zoom_id && (
                                <p className="text-xs text-foreground">Meeting ID: <span className="font-medium">{zoomDefaults.zoom_id}</span></p>
                              )}
                              {zoomDefaults?.zoom_password && (
                                <p className="text-xs text-foreground">Password: <span className="font-medium">{zoomDefaults.zoom_password}</span></p>
                              )}
                              {zoomDefaults?.zoom_link && (
                                <Button size="sm" variant="outline" className="h-7 text-xs mt-1"
                                  onClick={() => {
                                    setLocalLocation(zoomDefaults.zoom_link!);
                                    updateField("event_location", zoomDefaults.zoom_link);
                                  }}>
                                  Use my Zoom link
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Venue Type</label>
                            <Select
                              value={(event as any).event_venue_type || ""}
                              onValueChange={(val) => {
                                updateField("event_venue_type", val);
                                if (val === "My Home Office" && zoomDefaults?.home_office_address) {
                                  setLocalLocation(zoomDefaults.home_office_address);
                                  updateField("event_location", zoomDefaults.home_office_address);
                                } else if (val === "Hostess's Home" || val === "Other Venue") {
                                  // Clear the address so they can enter the correct one
                                  setLocalLocation("");
                                  updateField("event_location", null);
                                }
                              }}
                            >
                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select venue type" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Hostess's Home">Hostess's Home</SelectItem>
                                <SelectItem value="My Home Office">My Home Office</SelectItem>
                                <SelectItem value="Other Venue">Other Venue</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              {(event as any).event_venue_type === "Hostess's Home" ? "Hostess's Address" :
                               (event as any).event_venue_type === "My Home Office" ? "My Address" :
                               "Venue Address"}
                            </label>
                            <Input className="h-9 text-sm"
                              placeholder={
                                (event as any).event_venue_type === "Hostess's Home" ? "Hostess's street address" :
                                (event as any).event_venue_type === "My Home Office" ? "Your home office address" :
                                "Venue name or address"
                              }
                              value={localLocation}
                              onChange={(e) => setLocalLocation(e.target.value)}
                              onBlur={(e) => { if (e.target.value !== ((event as any).event_location || "")) updateField("event_location", e.target.value || null); }} />
                            {/* Only show button if field is empty or has a different value */}
                            {(event as any).event_venue_type === "My Home Office" &&
                             zoomDefaults?.home_office_address &&
                             localLocation !== zoomDefaults.home_office_address && (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => {
                                  setLocalLocation(zoomDefaults.home_office_address!);
                                  updateField("event_location", zoomDefaults.home_office_address);
                                }}>
                                Use my home office address
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Hostess Info */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Hostess</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</label>
                        <Input className="h-9 text-sm" defaultValue={event.hostess_name || ""} key={`hn-${event.hostess_name}`}
                          onBlur={(e) => { if (e.target.value !== (event.hostess_name || "")) updateField("hostess_name", e.target.value || null); }} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</label>
                        <Input className="h-9 text-sm" defaultValue={event.hostess_phone || ""} key={`hp-${event.hostess_phone}`}
                          onBlur={(e) => { if (e.target.value !== (event.hostess_phone || "")) updateField("hostess_phone", e.target.value || null); }} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
                        <Input className="h-9 text-sm" defaultValue={event.hostess_email || ""} key={`he-${event.hostess_email}`}
                          onBlur={(e) => { if (e.target.value !== (event.hostess_email || "")) updateField("hostess_email", e.target.value || null); }} />
                      </div>
                    </div>
                    {/* Contact + Log + Convert buttons */}
                    <div className="flex gap-2 flex-wrap">
                      {event.hostess_phone && (
                        <>
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild>
                            <a href={`tel:${phoneForLink(event.hostess_phone)}`}><Phone className="w-3 h-3" />Call</a>
                          </Button>
                          <TextActionButton phone={event.hostess_phone} trigger="labeled" className="h-8 text-xs" />
                        </>
                      )}
                      {event.hostess_email && (
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild>
                          <a href={`mailto:${event.hostess_email}`} onClick={(e) => openEmail(event.hostess_email!, e)}><Mail className="w-3 h-3" />Email</a>
                        </Button>
                      )}
                      {event.hostess_name && (
                        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openHostessActionPanel}>
                          <MessageSquare className="w-3 h-3" /> Log Activity
                        </Button>
                      )}
                      {event.hostess_name && (
                        (existingCustomer || (event as any).hostess_converted_customer_id) ? (
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-green-600 border-green-200 cursor-default" disabled>
                            <CheckCircle2 className="w-3 h-3" /> Already a client
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="outline"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => convertHostessMutation.mutate()}
                            disabled={convertHostessMutation.isPending}
                          >
                            <UserPlus className="w-3 h-3" />
                            {convertHostessMutation.isPending ? "Converting..." : "Convert to client"}
                          </Button>
                        )
                      )}
                    </div>
                    {/* Recent activity */}
                    {(() => {
                      const hostessNotes = unifiedNotes
                        .filter((n: any) => n.entity_type === "Hostess" && event.hostess_name && n.note_body?.includes(event.hostess_name))
                        .slice(0, 3);
                      if (hostessNotes.length === 0) return null;
                      return (
                        <div className="space-y-1 pt-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Activity</p>
                          <div className="divide-y divide-border rounded-lg border border-border">
                            {hostessNotes.map((note: any, i: number) => (
                              <div key={i} className="flex items-start gap-3 px-3 py-2">
                                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                                  {note.note_date ? formatDateOnly(note.note_date, "MMM d") : ""}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-foreground">{note.note_type || "Note"}</span>
                                    {i === 0 && <span className="text-[9px] px-1.5 py-0 rounded-full bg-primary text-primary-foreground font-semibold uppercase tracking-wide">Latest</span>}
                                  </div>
                                  {note.note_body && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      {(note.note_body || "").replace(/^\[.*?\]\s*/, "").slice(0, 100)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading event...</p>
            )}
          </TabsContent>

          {/* ── Tab 2: Event Coaching ── */}
          <TabsContent value="prep" className="mt-4 space-y-4">
            {event ? (
              <>
                {/* ── REBOOK SEQUENCE — shown when Cancelled or Rescheduling ── */}
                {isReschedulingOrCancelled && !rebookNotInterested ? (
                  <div className="space-y-4">
                    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-300">
                          <RefreshCw className="w-4 h-4" />
                          Rebook Outreach Sequence
                        </CardTitle>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          {event.event_status === "Cancelled" ? "Event was cancelled" : "Event is rescheduling"} — work through these follow-up steps to rebook her.
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Current step */}
                        <div className="bg-white dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-700 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-foreground">
                              Step {rebookAttemptNumber + 1} — {rebookStepLabel(rebookAttemptNumber)}
                            </p>
                            {rebookNextDate && (
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                                rebookNextDate < toLocalDateKey() ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                              )}>
                                {rebookNextDate < toLocalDateKey() ? "Overdue" : `Due ${formatDateOnly(rebookNextDate, "MMM d")}`}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {rebookAttemptNumber < 4
                              ? "After this, next follow-up will be scheduled automatically."
                              : "Quarterly check-ins continue until she rebooks or says not interested."}
                          </p>
                          <Button size="sm" className="w-full gap-1.5" onClick={() => logRebookAttemptMut.mutate()}
                            disabled={logRebookAttemptMut.isPending}>
                            <Phone className="w-3.5 h-3.5" />
                            Log Rebook Attempt — Schedule Next Follow-Up
                          </Button>
                        </div>

                        {/* Rebook success */}
                        <Button size="sm" variant="outline" className="w-full gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => setShowReactivate(true)}>
                          ✅ She said yes — Reactivate with new date
                        </Button>

                        {/* Not interested */}
                        <Button size="sm" variant="ghost" className="w-full text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => markRebookNotInterestedMut.mutate()}
                          disabled={markRebookNotInterestedMut.isPending}>
                          Not Interested — Stop outreach (stays in hold rate stats)
                        </Button>

                        {/* Attempt history */}
                        {rebookAttemptNumber > 0 && (
                          <p className="text-[10px] text-muted-foreground text-center">
                            {rebookAttemptNumber} attempt{rebookAttemptNumber !== 1 ? "s" : ""} made so far
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : rebookNotInterested ? (
                  <Card className="border-border/50">
                    <CardContent className="p-4 text-center space-y-2">
                      <p className="text-sm font-medium text-foreground">Not Interested</p>
                      <p className="text-xs text-muted-foreground">Outreach stopped. This event is counted in your hold rate stats as a booking that didn't hold.</p>
                      <Button size="sm" variant="outline" onClick={() => markRebookNotInterestedMut.mutate()}>
                        Resume outreach
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                {/* ── NORMAL COACHING CHECKLIST ── */}
                {/* Progress bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${(prepDone / prepTotal) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{prepDone} of {prepTotal} done</span>
                </div>

                <Card className="border-border/50">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-primary" />
                      Coaching Checklist
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {PREP_STEPS.map(({ field, label, hint }) => {
                        const done = !!(event as any)[field];
                        return (
                          <label key={field} className={cn("flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/30", done && "opacity-60")}>
                            <Checkbox checked={done} onCheckedChange={() => toggleChecklist(field)} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <span className={cn("text-sm", done && "line-through text-muted-foreground")}>{label}</span>
                              {!done && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Google Form Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hostess Pre-Profile Form Link</label>
                  <div className="flex gap-2">
                    <Input
                      className="h-9 text-sm flex-1"
                      placeholder="https://forms.google.com/..."
                      defaultValue={event.google_form_link || ""}
                      key={`gfl-${event.google_form_link}`}
                      onBlur={(e) => { if (e.target.value !== (event.google_form_link || "")) updateField("google_form_link", e.target.value || null); }}
                    />
                    {event.google_form_link && (
                      <Button size="sm" variant="outline" className="h-9 shrink-0" asChild>
                        <a href={event.google_form_link} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Open
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                </>
                )}
              </>
            ) : null}
          </TabsContent>

          {/* ── Tab 4: Guests & Orders ── */}
          <TabsContent value="guests" className="mt-4 space-y-4">

            {/* Guest Panel */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Guests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EventGuestPanel eventId={eventId} />
              </CardContent>
            </Card>

            {/* Performance numbers */}
            {orderCount > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Sales</div>
                      <div className="text-base font-bold text-green-600">${totalSales.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Orders</div>
                      <div className="text-base font-bold text-foreground">{orderCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Avg Order</div>
                      <div className="text-base font-bold text-foreground">${avgOrder.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Discounts</div>
                      <div className="text-base font-bold text-amber-600">${totalDiscounts.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Est. Profit</div>
                      <div className="text-base font-bold text-primary">${totalNetProfit.toFixed(2)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Linked Orders */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Orders ({orderCount})</h3>
                {event && (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5"
                    onClick={() => navigate(`/orders/new?eventId=${event.event_id}&type=${event.event_type || "Party"}`)}>
                    <Plus className="w-3.5 h-3.5" /> Add Order
                  </Button>
                )}
              </div>
              {linkedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No orders yet. Add the first one above.</p>
              ) : (
                <div className="border border-border rounded-lg overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Payment</TableHead>
                        <TableHead className="text-xs">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkedOrders.map((o) => (
                        <TableRow key={o.id} className="hover:bg-muted/50">
                          <TableCell className="text-xs whitespace-nowrap">{formatDateOnly(o.order_date)}</TableCell>
                          <TableCell className="text-sm font-medium">{o.customer_name || o.customers?.full_name || "—"}</TableCell>
                          <TableCell className="text-sm font-semibold text-right">${Number(o.retail_amount).toFixed(2)}</TableCell>
                          <TableCell>
                            {o.order_type && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                                o.order_type === "Reorder" ? "bg-accent text-accent-foreground" :
                                o.order_type === "Party" ? "bg-primary/10 text-primary" :
                                "bg-muted text-muted-foreground"
                              )}>{o.order_type}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{o.payment_type || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">{o.notes || ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Hostess Action Panel */}
      <UniversalActionPanel
        item={actionPanelItem}
        open={actionPanelOpen}
        onClose={() => setActionPanelOpen(false)}
        onLogAction={handleHostessAction}
        isPending={hostessActionMutation.isPending}
      />

      {/* Reactivate Event Dialog */}
      <Dialog open={showReactivate} onOpenChange={setShowReactivate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Reactivate Event</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Pick the new date for {event?.hostess_name}'s event. All her history stays intact.</p>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">New Event Date</label>
              <Input type="date" value={reactivateDate} onChange={e => setReactivateDate(e.target.value)} className="h-9" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!reactivateDate || reactivateEventMut.isPending}
                onClick={() => reactivateEventMut.mutate(reactivateDate)}>
                {reactivateEventMut.isPending ? "Reactivating..." : "Reactivate Event"}
              </Button>
              <Button variant="outline" onClick={() => setShowReactivate(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-Event Status Prompt */}
      <Dialog open={showPostEventPrompt} onOpenChange={setShowPostEventPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">What happened with this event?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This event's date has passed — please update the status.</p>
          <div className="flex flex-col gap-2 pt-2">
            <Button className="w-full" onClick={() => { setShowPostEventPrompt(false); handleStatusChange("Held"); }}>
              ✅ Held — Enter Results
            </Button>
            <Button variant="outline" className="w-full" onClick={() => {
              eventMutation.mutate({
                event_id: event!.event_id,
                reschedule_status: "In Process of Rescheduling",
                reschedule_attempt_number: 0,
                reschedule_next_follow_up_date: toLocalDateKey(addDays(new Date(), 1)),
              } as any);
              setShowPostEventPrompt(false);
              toast.success("Event moved to rescheduling workflow");
            }}>
              🔄 Rescheduling in Progress
            </Button>
            <Button variant="destructive" className="w-full" onClick={() => {
              eventMutation.mutate({
                event_id: event!.event_id,
                event_status: "Cancelled",
                reschedule_status: "None",
                reschedule_next_follow_up_date: null,
              } as any);
              setShowPostEventPrompt(false);
            }}>
              ❌ Cancelled
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Completion Dialog */}
      <Dialog open={showCompletionDialog} onOpenChange={setShowCompletionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Event Results</DialogTitle>
            <p className="text-sm text-muted-foreground">How did it go? Enter the results below.</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Guest Count (Faces)</label>
              <Input type="number" min={0} placeholder="0" value={completionData.guest_count}
                onChange={(e) => setCompletionData(p => ({ ...p, guest_count: e.target.value }))} className="h-10 mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Bookings</label>
                <Input type="number" min={0} placeholder="0" value={completionData.bookings}
                  onChange={(e) => setCompletionData(p => ({ ...p, bookings: e.target.value }))} className="h-10 mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Sharings</label>
                <Input type="number" min={0} placeholder="0" value={completionData.sharings}
                  onChange={(e) => setCompletionData(p => ({ ...p, sharings: e.target.value }))} className="h-10 mt-1" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1 h-10" onClick={submitCompletion}>Save Results</Button>
              <Button variant="outline" className="h-10" onClick={() => { setShowCompletionDialog(false); setPendingStatus(null); }}>Skip</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
