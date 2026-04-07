import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchEvents, fetchOrders, upsertEvent, generateGuestInviteTask, fetchEventTasksByEventId, completeEventTask, generateEventWorkflowTasks } from "@/lib/queries";
import type { EventTask } from "@/lib/queries";
import { formatDateOnly, parseLocalDate, toLocalDateKey } from "@/lib/dateOnly";
import { COACHING_STATUSES, EVENT_STATUSES, RESCHEDULE_STATUSES } from "@/lib/types";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import type { EventRecord, OrderWithCustomer } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EventGuestPanel from "@/components/EventGuestPanel";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, DollarSign, Users, ShoppingBag, TrendingUp, CalendarDays, CalendarIcon, Phone, Mail, ClipboardCheck, GraduationCap, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EVENT_TYPES = ["Party", "Facial", "Sharing Appointment", "Networking Event", "Vendor Event"] as const;
const EVENT_FORMATS = ["In-Person", "Zoom"] as const;

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: eventTasks = [] } = useQuery({
    queryKey: ["event-tasks", eventId],
    queryFn: () => fetchEventTasksByEventId(eventId!),
    enabled: !!eventId,
  });

  const event = useMemo(() => events.find((e) => e.event_id === eventId), [events, eventId]);

  const linkedOrders = useMemo(() =>
    allOrders.filter((o) => o.event_id === eventId || o.parent_event_id === eventId)
      .sort((a, b) => a.order_date.localeCompare(b.order_date)),
    [allOrders, eventId]
  );

  const totalSales = linkedOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
  const guestCount = event?.guest_count || 0;
  const orderCount = linkedOrders.length;
  const convRate = guestCount > 0 ? ((orderCount / guestCount) * 100).toFixed(0) : null;

  const eventMutation = useMutation({
    mutationFn: (params: Partial<EventRecord> & { event_id: string }) => upsertEvent(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event updated");
    },
  });

  // Post-event prompt state
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

    // Trigger guest invite task when hostess form (google form) is completed
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

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
            const from = (location.state as any)?.from;
            if (from) navigate(from);
            else navigate(-1);
          }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {event?.hostess_name ? `${event.hostess_name}'s Event` : "Event Detail"}
            </h2>
            <p className="text-sm text-muted-foreground font-mono">{eventId}</p>
          </div>
          {event && (
            <div className="flex items-center gap-1.5">
              <Badge variant={event.event_status === "Held" ? "default" : event.event_status === "Cancelled" ? "destructive" : "secondary"} className="text-xs">
                {event.event_status || "Booked"}
              </Badge>
              {event.reschedule_status && event.reschedule_status !== "None" && (
                <Badge variant="outline" className="text-xs">
                  {event.reschedule_status}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Date</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "h-auto p-0 text-sm font-bold text-foreground hover:text-primary hover:bg-transparent",
                      !event?.event_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="w-3 h-3 mr-1 opacity-50" />
                    {event?.event_date ? formatDateOnly(event.event_date) : "Set date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={event?.event_date ? parseLocalDate(event.event_date) : undefined}
                    onSelect={handleDateSelect}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Sales</span>
              </div>
              <p className="text-lg font-bold text-foreground">${totalSales.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Orders</span>
              </div>
              <p className="text-lg font-bold text-foreground">{orderCount}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Conversion</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {convRate ? `${convRate}%` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">{guestCount} guests</p>
            </CardContent>
          </Card>
        </div>

        {/* Event metadata editable */}
        {event && (
          <Card className="border-border/50">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Event Details</h3>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Event Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full h-8 text-sm justify-start text-left font-normal",
                          !event.event_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                        {event.event_date ? formatDateOnly(event.event_date, "MMM d, yyyy") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={event.event_date ? parseLocalDate(event.event_date) : undefined}
                        onSelect={handleDateSelect}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Event Type</label>
                  <Select
                    value={event.event_type || ""}
                    onValueChange={(val) => {
                      if (val !== (event.event_type || "")) {
                        eventMutation.mutate({ event_id: event.event_id, event_type: val });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Format</label>
                  <Select
                    value={event.event_format || "In-Person"}
                    onValueChange={(val) => {
                      if (val !== (event.event_format || "In-Person")) {
                        eventMutation.mutate({ event_id: event.event_id, event_format: val } as any);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_FORMATS.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Status</label>
                  <Select
                    value={event.event_status || "Booked"}
                    onValueChange={(val) => {
                      if (val !== (event.event_status || "Booked")) {
                        eventMutation.mutate({ event_id: event.event_id, event_status: val } as any);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reschedule</label>
                  <Select
                    value={(event as any).reschedule_status || "None"}
                    onValueChange={(val) => {
                      if (val !== ((event as any).reschedule_status || "None")) {
                        eventMutation.mutate({ event_id: event.event_id, reschedule_status: val } as any);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESCHEDULE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Guest Count</label>
                  <Input
                    type="number" min={0} className="h-8 text-sm"
                    defaultValue={event.guest_count || ""}
                    key={`gc-${event.guest_count}`}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      if (val !== (event.guest_count || 0)) {
                        eventMutation.mutate({ event_id: event.event_id, guest_count: val });
                      }
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Event Time</label>
                  <Input
                    type="time"
                    className="h-8 text-sm"
                    defaultValue={(event as any).event_time || ""}
                    key={`et-${(event as any).event_time}`}
                    onBlur={(e) => {
                      if (e.target.value !== ((event as any).event_time || "")) {
                        updateField("event_time", e.target.value || null);
                      }
                    }}
                  />
                </div>
                <div className={cn("col-span-1 sm:col-span-3")}>
                  <label className="text-xs text-muted-foreground">
                    {(event.event_format || "In-Person") === "Zoom" ? "Virtual Link" : "Location"}
                  </label>
                  <Input
                    className="h-8 text-sm"
                    placeholder={(event.event_format || "In-Person") === "Zoom" ? "https://zoom.us/..." : "Address or venue"}
                    defaultValue={(event as any).event_location || ""}
                    key={`el-${(event as any).event_location}`}
                    onBlur={(e) => {
                      if (e.target.value !== ((event as any).event_location || "")) {
                        updateField("event_location", e.target.value || null);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Bookings</label>
                  <Input
                    type="number" min={0} className="h-8 text-sm"
                    defaultValue={event.future_bookings_count || ""}
                    key={`fb-${event.future_bookings_count}`}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      eventMutation.mutate({ event_id: event.event_id, future_bookings_count: val } as any);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Sharings</label>
                  <Input
                    type="number" min={0} className="h-8 text-sm"
                    defaultValue={event.sharing_appointments_count || ""}
                    key={`sa-${event.sharing_appointments_count}`}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      eventMutation.mutate({ event_id: event.event_id, sharing_appointments_count: val } as any);
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <Input
                    className="h-8 text-sm"
                    defaultValue={event.notes || ""}
                    key={`notes-${event.notes}`}
                    onBlur={(e) => {
                      if (e.target.value !== (event.notes || "")) {
                        eventMutation.mutate({ event_id: event.event_id, notes: e.target.value || null });
                      }
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hostess Coaching */}
        {event && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                Hostess Coaching
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Hostess Name</label>
                  <Input
                    className="h-8 text-sm"
                    defaultValue={event.hostess_name || ""}
                    key={`hn-${event.hostess_name}`}
                    onBlur={(e) => {
                      if (e.target.value !== (event.hostess_name || "")) {
                        updateField("hostess_name", e.target.value || null);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Phone</label>
                  <Input
                    className="h-8 text-sm"
                    defaultValue={event.hostess_phone || ""}
                    key={`hp-${event.hostess_phone}`}
                    onBlur={(e) => {
                      if (e.target.value !== (event.hostess_phone || "")) {
                        updateField("hostess_phone", e.target.value || null);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Email</label>
                  <Input
                    className="h-8 text-sm"
                    defaultValue={event.hostess_email || ""}
                    key={`he-${event.hostess_email}`}
                    onBlur={(e) => {
                      if (e.target.value !== (event.hostess_email || "")) {
                        updateField("hostess_email", e.target.value || null);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Coaching Status</label>
                  <Select
                    value={event.coaching_status || "Booked"}
                    onValueChange={(v) => updateField("coaching_status", v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COACHING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="col-span-1 sm:col-span-3">
                  <label className="text-xs text-muted-foreground">Coaching Notes</label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="Notes about coaching..."
                    defaultValue={event.coaching_notes || ""}
                    key={`cn-${event.coaching_notes}`}
                    onBlur={(e) => {
                      if (e.target.value !== (event.coaching_notes || "")) {
                        updateField("coaching_notes", e.target.value || null);
                      }
                    }}
                  />
                </div>
              </div>
              {/* Quick contact buttons */}
              {(event.hostess_phone || event.hostess_email) && (
                <div className="flex gap-1.5">
                  {event.hostess_phone && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                        <a href={`tel:${phoneForLink(event.hostess_phone)}`}><Phone className="w-3 h-3 mr-1" />Call</a>
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                        <a href={`sms:${phoneForLink(event.hostess_phone)}`}>Text</a>
                      </Button>
                    </>
                  )}
                  {event.hostess_email && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                      <a href={`mailto:${event.hostess_email}`}><Mail className="w-3 h-3 mr-1" />Email</a>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pre-Party Checklist */}
        {event && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-primary" />
                Pre-Party Checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { field: "checklist_invitations_sent", label: "Invitations Sent" },
                  { field: "checklist_guest_list_received", label: "Guest List Received" },
                  { field: "checklist_google_form_completed", label: "Google Form Completed" },
                  { field: "checklist_samples_sent", label: "Samples Sent" },
                  { field: "checklist_reminders_sent", label: "Reminder Messages Sent" },
                ].map(({ field, label }) => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer py-1">
                    <Checkbox
                      checked={(event as any)[field] || false}
                      onCheckedChange={() => toggleChecklist(field)}
                    />
                    <span className={cn("text-sm", (event as any)[field] ? "text-foreground" : "text-muted-foreground")}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Google Form Link</label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="https://forms.google.com/..."
                    defaultValue={event.google_form_link || ""}
                    key={`gfl-${event.google_form_link}`}
                    onBlur={(e) => {
                      if (e.target.value !== (event.google_form_link || "")) {
                        updateField("google_form_link", e.target.value || null);
                      }
                    }}
                  />
                </div>
                {event.google_form_link && (
                  <Button size="sm" variant="outline" className="h-8" asChild>
                    <a href={event.google_form_link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 mr-1" />Open
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Event Workflow Tasks */}
        {event && eventTasks.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                Event Workflow Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {eventTasks.map((task: EventTask) => (
                <label key={task.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                  <Checkbox
                    checked={task.is_completed}
                    onCheckedChange={() => {
                      if (!task.is_completed) handleCompleteTask(task.id);
                    }}
                    disabled={task.is_completed}
                  />
                  <div className="flex-1 min-w-0">
                    <span className={cn("text-sm", task.is_completed ? "line-through text-muted-foreground" : "text-foreground font-medium")}>
                      {task.task_name}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-muted-foreground ml-2">
                        Due: {formatDateOnly(task.due_date)}
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Guest Tracking */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Guest Tracking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EventGuestPanel eventId={eventId} />
          </CardContent>
        </Card>

        {/* Linked Orders */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Linked Orders ({orderCount})</h3>
          {linkedOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No orders linked to this event.</p>
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

        {/* Post-Event Prompt */}
        <Dialog open={showPostEventPrompt} onOpenChange={setShowPostEventPrompt}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Was this event held?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This event's date has passed. Please confirm if it was held or cancelled.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1"
                onClick={() => {
                  eventMutation.mutate({ event_id: event!.event_id, event_status: "Held" } as any);
                  setShowPostEventPrompt(false);
                }}
              >
                ✅ Held
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  eventMutation.mutate({ event_id: event!.event_id, event_status: "Cancelled" } as any);
                  setShowPostEventPrompt(false);
                }}
              >
                ❌ Cancelled
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
