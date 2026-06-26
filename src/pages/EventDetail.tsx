import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchEvents, fetchOrders, upsertEvent, createNote, fetchAllLatestNotes, convertHostessToCustomer, fetchCustomers, fetchZoomDefaults } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";

import { formatDateOnly, parseLocalDate, toLocalDateKey } from "@/lib/dateOnly";
import { addDays, format } from "date-fns";
import { EVENT_STATUSES, RESCHEDULE_STATUSES } from "@/lib/types";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import type { EventRecord, OrderWithCustomer } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EventGuestPanel from "@/components/EventGuestPanel";
import EventReferralsCard from "@/components/EventReferralsCard";
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
import { ArrowLeft, Users, TrendingUp, CalendarIcon, Phone, Mail, ExternalLink, MessageSquare, Plus, UserPlus, CheckCircle2, RefreshCw } from "lucide-react";
import { openEmail } from "@/lib/emailPreference";
import { cn } from "@/lib/utils";
import TextActionButton from "@/components/TextActionButton";
import { toast } from "sonner";

const EVENT_TYPES = ["Party", "Facial", "Guest Event", "Sharing Appointment", "Pearl Appointment", "Career Chat", "Networking Event", "Vendor Event"] as const;
const EVENT_SCOPES = ["Personal", "Unit"] as const;
const EVENT_FORMATS = ["In-Person", "Virtual"] as const;
const HOSTESS_SOURCE_OPTIONS = ["Party/Event", "David's Bridal", "Warm Chatter", "Networking Event", "Vendor Event", "Facial Box", "Referral", "Current Customer", "Other"] as const;

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Include eventId in the key + force fresh fetch on mount so navigating to a
  // newly-created event never flashes stale data from a previously viewed event.
  const { data: events = [] } = useQuery({
    queryKey: ["events", eventId],
    queryFn: fetchEvents,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: zoomDefaults } = useQuery({ queryKey: ["zoom-defaults"], queryFn: fetchZoomDefaults });
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

  const handleStatusChange = async (val: string) => {
    if (!event || val === (event.event_status || "Booked")) return;
    if (val === "Held") {
      eventMutation.mutate({ event_id: event.event_id, event_status: "Held" } as any);
      toast.success("Event marked as Held");
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


  // Post-event prompt — only for past events that are still "Upcoming" (Booked),
  // not already in rescheduling, and with no results entered yet.
  const [showPostEventPrompt, setShowPostEventPrompt] = useState(false);
  const needsPostEventPrompt = !!(
    event?.event_date &&
    event.event_date < toLocalDateKey() &&
    (event.event_status || "Booked") === "Booked" &&
    (!event.reschedule_status || event.reschedule_status === "None") &&
    !(event.guest_count && event.guest_count > 0) &&
    !(event.ordering_guest_count && event.ordering_guest_count > 0) &&
    !(event.future_bookings_count && event.future_bookings_count > 0)
  );
  useEffect(() => {
    if (needsPostEventPrompt) setShowPostEventPrompt(true);
  }, [needsPostEventPrompt]);

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


  // ── Rebook sequence ──
  const [showReactivate, setShowReactivate] = useState(false);
  const [reactivateDate, setReactivateDate] = useState("");
  const [resolveAction, setResolveAction] = useState<null | "booked" | "no_longer" | "still_working">(null);
  const [stillWorkingOpen, setStillWorkingOpen] = useState(false);

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
              {(event as any).reschedule_status === "In Process of Rescheduling" ? (
                <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">
                  Rescheduling
                </Badge>
              ) : (
                <Badge variant={event.event_status === "Held" ? "default" : event.event_status === "Cancelled" ? "destructive" : "secondary"} className="text-xs">
                  {event.event_status || "Booked"}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* KPI Strip — compact */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Date</p>
            <p className="text-xs font-bold text-foreground">{event?.event_date ? formatDateOnly(event.event_date, "MMM d") : "—"}</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Sales</p>
            <p className="text-xs font-bold text-green-600">${totalSales.toFixed(0)}</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Guests</p>
            <p className="text-xs font-bold text-purple-600">{guestCount || "—"}</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Bookings</p>
            <p className="text-xs font-bold text-primary">{(event as any)?.future_bookings_count ?? "—"}</p>
          </div>
        </div>


        {/* Tabs */}
        <Tabs defaultValue="details">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="details" className="flex-1 sm:flex-none">Details & Hostess</TabsTrigger>
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
                {(event as any).reschedule_status === "In Process of Rescheduling" && !rebookNotInterested && (
                  <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-orange-800 dark:text-orange-300">
                        <RefreshCw className="w-4 h-4" />
                        Resolve Rescheduling
                      </CardTitle>
                      <p className="text-xs text-orange-700 dark:text-orange-400">
                        This event is sitting in rescheduling. Pick an outcome to clear it from your Today list.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button size="sm"
                        className={`w-full gap-1.5 ${resolveAction === "booked"
                          ? "bg-green-600 hover:bg-green-700 text-white ring-2 ring-green-300"
                          : "bg-green-600 hover:bg-green-700 text-white"}`}
                        onClick={() => { setResolveAction("booked"); setShowReactivate(true); }}>
                        ✅ She Booked — set new date
                      </Button>
                      <Button size="sm"
                        variant={resolveAction === "no_longer" ? "default" : "outline"}
                        className={`w-full gap-1.5 ${resolveAction === "no_longer"
                          ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground ring-2 ring-destructive/40"
                          : "border-destructive/30 text-destructive hover:bg-destructive/10"}`}
                        onClick={() => { setResolveAction("no_longer"); markRebookNotInterestedMut.mutate(); }}
                        disabled={markRebookNotInterestedMut.isPending}>
                        ❌ No Longer Pursuing
                      </Button>
                      <Popover open={stillWorkingOpen} onOpenChange={(o) => {
                        setStillWorkingOpen(o);
                        if (o) setResolveAction("still_working");
                      }}>
                        <PopoverTrigger asChild>
                          <Button size="sm"
                            variant={resolveAction === "still_working" ? "default" : "outline"}
                            className={`w-full gap-1.5 ${resolveAction === "still_working"
                              ? "bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-300 border-blue-600"
                              : ""}`}>
                            🔄 Still Working — pick next follow-up
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={rebookNextDate ? parseLocalDate(rebookNextDate) : undefined}
                            onSelect={(d) => {
                              if (!d) return;
                              const key = toLocalDateKey(d);
                              if (key <= toLocalDateKey()) {
                                toast.error("Pick a future date");
                                return;
                              }
                              setResolveAction("still_working");
                              eventMutation.mutate({
                                event_id: event.event_id,
                                reschedule_next_follow_up_date: key,
                              } as any, {
                                onSuccess: () => {
                                  toast.success(`Next follow-up: ${format(d, "MMM d")}`);
                                  setStillWorkingOpen(false);
                                },
                              });
                            }}
                            disabled={(d) => toLocalDateKey(d) <= toLocalDateKey()}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      {rebookNextDate && (
                        <p className="text-[11px] text-orange-700 dark:text-orange-400 text-center">
                          Current follow-up: {formatDateOnly(rebookNextDate, "MMM d, yyyy")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Event Details</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Date */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Event Date</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full h-8 text-xs justify-start font-normal", !event.event_date && "text-muted-foreground")}>
                              <CalendarIcon className="w-3 h-3 mr-1.5" />
                              {event.event_date ? formatDateOnly(event.event_date, "MMM d, yyyy") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={event.event_date ? parseLocalDate(event.event_date) : undefined} onSelect={handleDateSelect} initialFocus className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      {/* Time */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Event Time</label>
                        <Input type="time" className="h-8 text-xs" defaultValue={(event as any).event_time || ""} key={`et-${(event as any).event_time}`}
                          onBlur={(e) => { if (e.target.value !== ((event as any).event_time || "")) updateField("event_time", e.target.value || null); }} />
                      </div>
                      {/* Event Type */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Event Type</label>
                        <Select value={event.event_type || ""} onValueChange={(val) => { if (val !== (event.event_type || "")) eventMutation.mutate({ event_id: event.event_id, event_type: val }); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {/* Format */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Format</label>
                        <Select value={event.event_format || "In-Person"} onValueChange={(val) => {
                          if (val !== (event.event_format || "In-Person")) {
                            eventMutation.mutate({ event_id: event.event_id, event_format: val } as any);
                            if (val === "Virtual" && zoomDefaults?.zoom_link) {
                              setLocalLocation(zoomDefaults.zoom_link);
                              updateField("event_location", zoomDefaults.zoom_link);
                            }
                          }
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{EVENT_FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {/* Scope: Personal vs Unit */}
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">This event is</label>
                        <div className="flex gap-2">
                          {EVENT_SCOPES.map((scope) => {
                            const current = (event as any).event_scope || "Personal";
                            const active = current === scope;
                            return (
                              <button
                                key={scope}
                                type="button"
                                onClick={() => { if (!active) updateField("event_scope", scope); }}
                                className={cn(
                                  "flex-1 h-8 rounded-md border-2 text-xs font-medium transition-colors",
                                  active
                                    ? scope === "Unit"
                                      ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300"
                                      : "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                                )}
                              >
                                {scope}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {/* Unified Status */}
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status</label>
                        <Select
                          value={
                            (event as any).reschedule_status === "In Process of Rescheduling"
                              ? "In Process of Rescheduling"
                              : event.event_status || "Booked"
                          }
                          onValueChange={(val) => {
                            if (val === "In Process of Rescheduling") {
                              eventMutation.mutate({
                                event_id: event.event_id,
                                reschedule_status: "In Process of Rescheduling",
                                reschedule_attempt_number: (event as any).reschedule_attempt_number || 0,
                                reschedule_next_follow_up_date: (event as any).reschedule_next_follow_up_date || toLocalDateKey(addDays(new Date(), 2)),
                              } as any);
                            } else {
                              handleStatusChange(val);
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Booked">Booked</SelectItem>
                            <SelectItem value="In Process of Rescheduling">In Process of Rescheduling</SelectItem>
                            <SelectItem value="Held">Held</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Results — Guests, Bookings */}
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Event Results</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Guests / Faces</label>
                            <Input type="number" min={0} className="h-8 text-xs"
                              defaultValue={(event as any).guest_count || ""}
                              key={`gc-${(event as any).guest_count}`}
                              placeholder="0"
                              onBlur={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (val !== ((event as any).guest_count || 0)) updateField("guest_count", val);
                              }} />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Bookings</label>
                            <Input type="number" min={0} className="h-8 text-xs"
                              defaultValue={(event as any).future_bookings_count || ""}
                              key={`bc-${(event as any).future_bookings_count}`}
                              placeholder="0"
                              onBlur={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (val !== ((event as any).future_bookings_count || 0)) updateField("future_bookings_count", val);
                              }} />
                          </div>
                        </div>
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

                {/* Hostess Info — hide for Guest Events */}
                {event?.event_type !== "Guest Event" && (
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
                      <div className="space-y-1.5 sm:col-span-3">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Where did you meet the hostess?</label>
                        <Select
                          value={(event as any).hostess_source || ""}
                          onValueChange={(val) => updateField("hostess_source", val || null)}
                        >
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select source" /></SelectTrigger>
                          <SelectContent>
                            {HOSTESS_SOURCE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
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
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-8 text-xs gap-1.5",
                          (event as any).thank_you_sent && "bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                        )}
                        onClick={() => updateField("thank_you_sent", !(event as any).thank_you_sent)}
                      >
                        {(event as any).thank_you_sent ? <>✓ Thank You Sent</> : <>Mark Thank You Note Sent</>}
                      </Button>
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
                )} {/* end non-Guest Event hostess */}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading event...</p>
            )}
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
                <EventGuestPanel 
                  eventId={eventId} 
                  eventType={event?.event_type}
                  isHeld={event?.event_status === "Held"}
                  eventDate={event?.event_date}
                  hostessName={event?.hostess_name}
                />
              </CardContent>
            </Card>

            {/* Referrals from this event */}
            <EventReferralsCard eventId={eventId} hostessName={event?.hostess_name} />

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
              ✅ Mark as Held
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

    </Layout>
  );
}
