import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvents, fetchOrders, deleteEvent, upsertEvent, createNote, fetchAllLatestNotes, fetchEventTasks, type EventTask } from "@/lib/queries";
import Layout from "@/components/Layout";
import UniversalActionPanel from "@/components/UniversalActionPanel";
import type { UniversalActionItem } from "@/components/UniversalActionPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, Users, DollarSign, Plus, Trash2, MessageSquare, ShoppingBag, CheckCircle2, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateOnly } from "@/lib/dateOnly";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EventRecord } from "@/lib/types";

const statusColor = (s: string) => {
  switch (s) {
    case "Held": return "bg-green-100 text-green-700 border-green-200";
    case "Cancelled": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-blue-100 text-blue-700 border-blue-200";
  }
};

const rescheduleColor = (s: string | null) => {
  switch (s) {
    case "Rescheduled": return "bg-amber-100 text-amber-700 border-amber-200";
    case "In Process of Rescheduling": return "bg-orange-100 text-orange-700 border-orange-200";
    default: return "";
  }
};

export default function Events() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rescheduleFilter, setRescheduleFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<EventRecord | null>(null);

  const { data: events = [], isLoading } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: unifiedNotes = [] } = useQuery({ queryKey: ["unified-notes"], queryFn: fetchAllLatestNotes });
  const { data: allTasks = [] } = useQuery({ queryKey: ["event-tasks"], queryFn: fetchEventTasks });
  const [expandedTasksFor, setExpandedTasksFor] = useState<string | null>(null);

  // Next pending task per event_id (overdue/due-today first, then soonest)
  const nextTaskByEvent = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const grouped = new Map<string, EventTask[]>();
    for (const t of allTasks) {
      if (t.is_completed) continue;
      if (!grouped.has(t.event_id)) grouped.set(t.event_id, []);
      grouped.get(t.event_id)!.push(t);
    }
    const map = new Map<string, { next: EventTask; remaining: number; all: EventTask[] }>();
    for (const [eid, tasks] of grouped.entries()) {
      const sorted = [...tasks].sort((a, b) => {
        const ad = a.due_date || "9999-12-31";
        const bd = b.due_date || "9999-12-31";
        return ad.localeCompare(bd);
      });
      map.set(eid, { next: sorted[0], remaining: sorted.length - 1, all: sorted });
    }
    return { map, today };
  }, [allTasks]);

  // ─── Universal Action Panel for Hostess ───
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
  const [actionPanelItem, setActionPanelItem] = useState<UniversalActionItem | null>(null);

  const openHostessPanel = useCallback((e: EventRecord) => {
    if (!e.hostess_name) return;
    const recentNotes = unifiedNotes
      .filter((n: any) => n.entity_type === "Hostess" && n.note_body?.includes(e.hostess_name!))
      .slice(0, 5)
      .map((n: any) => ({
        date: n.note_date ? formatDateOnly(n.note_date, "MMM d") : "",
        actionType: n.note_type || "Note",
        preview: (n.note_body || "").slice(0, 80),
      }));

    setActionPanelItem({
      id: e.id,
      personType: "hostess",
      name: e.hostess_name,
      phone: e.hostess_phone || null,
      email: e.hostess_email || null,
      statusLabel: `${e.event_type || "Event"} — ${e.event_status || "Booked"}`,
      followUpReason: (e as any).hostess_next_action || "Hostess Coaching",
      nextFollowUpDate: (e as any).hostess_next_action_date || null,
      recentNotes,
    });
    setActionPanelOpen(true);
  }, [unifiedNotes]);

  const hostessActionMutation = useMutation({
    mutationFn: async ({ item: uItem, actionType, note, isBookingAttempt, isFollowUp, nextFollowUpDate }: {
      item: UniversalActionItem;
      actionType: string;
      note: string;
      isBookingAttempt: boolean;
      isFollowUp: boolean;
      nextFollowUpDate?: string | null;
    }) => {
      // Find the event to update
      const ev = events.find((e) => e.id === uItem.id);
      if (ev && nextFollowUpDate) {
        await upsertEvent({ event_id: ev.event_id, hostess_next_action_date: nextFollowUpDate } as any);
      }
      // Create centralized activity log entry
      await createNote({
        entity_type: "Hostess",
        note_body: note.trim() || `${actionType} hostess contact`,
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
      setActionPanelOpen(false);
      toast.success("Hostess activity logged");
    },
  });

  const handleHostessAction = useCallback((params: {
    item: UniversalActionItem;
    actionType: string;
    note: string;
    isBookingAttempt: boolean;
    isFollowUp: boolean;
    nextFollowUpDate?: string | null;
  }) => {
    hostessActionMutation.mutate(params);
  }, [hostessActionMutation]);

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["event-guests"] });
      setDeleteTarget(null);
      toast.success("Event deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const markHeldMutation = useMutation({
    mutationFn: (e: EventRecord) => upsertEvent({ event_id: e.event_id, event_status: "Held" } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event marked complete");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const eventSales = useMemo(() => {
    const map = new Map<string, { total: number; orderCount: number }>();
    for (const o of orders) {
      const eid = o.event_id || o.parent_event_id;
      if (!eid) continue;
      const existing = map.get(eid) || { total: 0, orderCount: 0 };
      existing.total += Number(o.retail_amount || 0);
      existing.orderCount += 1;
      map.set(eid, existing);
    }
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
      if (formatFilter !== "all" && (e.event_format || "In-Person") !== formatFilter) return false;
      if (statusFilter !== "all" && e.event_status !== statusFilter) return false;
      if (rescheduleFilter !== "all" && (e.reschedule_status || "None") !== rescheduleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(e.hostess_name || "").toLowerCase().includes(q) &&
          !(e.event_id || "").toLowerCase().includes(q) &&
          !(e.event_type || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [events, search, typeFilter, formatFilter, statusFilter, rescheduleFilter]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => (b.event_date || "").localeCompare(a.event_date || "")),
    [filtered]
  );

  const totalEvents = sorted.length;
  const totalSales = sorted.reduce((s, e) => s + (eventSales.get(e.event_id)?.total || 0), 0);
  const totalGuests = sorted.reduce((s, e) => s + (e.guest_count || 0), 0);

  const deleteTargetLinkedCount = deleteTarget ? (eventSales.get(deleteTarget.event_id)?.orderCount || 0) : 0;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Events</h2>
            <p className="text-sm text-muted-foreground">{totalEvents} events</p>
          </div>
          <Button
            onClick={() => navigate("/events/new")}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> New Event
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Events</span>
              </div>
              <p className="text-lg font-bold text-blue-600">{totalEvents}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Sales</span>
              </div>
              <p className="text-lg font-bold text-green-600">${totalSales.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Guests</span>
              </div>
              <p className="text-lg font-bold text-purple-600">{totalGuests}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search hostess, event ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[130px] text-sm">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Party">Party</SelectItem>
              <SelectItem value="Facial">Facial</SelectItem>
            </SelectContent>
          </Select>
          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="h-9 w-[140px] text-sm">
              <SelectValue placeholder="All Formats" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Formats</SelectItem>
              <SelectItem value="In-Person">In-Person</SelectItem>
              <SelectItem value="Zoom">Zoom</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] text-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Booked">Booked</SelectItem>
              <SelectItem value="Held">Held</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rescheduleFilter} onValueChange={setRescheduleFilter}>
            <SelectTrigger className="h-9 w-[180px] text-sm">
              <SelectValue placeholder="Reschedule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reschedule</SelectItem>
              <SelectItem value="None">None</SelectItem>
              <SelectItem value="In Process of Rescheduling">In Process</SelectItem>
              <SelectItem value="Rescheduled">Rescheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No events found.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Hostess</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-center">Guests</TableHead>
                  <TableHead className="text-xs text-center">Ordering</TableHead>
                  <TableHead className="text-xs text-right">Total Sales</TableHead>
                  <TableHead className="text-xs text-center">Bookings</TableHead>
                  <TableHead className="text-xs text-center">Conv %</TableHead>
                  <TableHead className="text-xs w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((e) => {
                  const sales = eventSales.get(e.event_id);
                  const orderCount = sales?.orderCount || 0;
                  const evTotalSales = sales?.total || 0;
                  const guestCount = e.guest_count || 0;
                  const convRate = guestCount > 0 ? ((orderCount / guestCount) * 100).toFixed(0) : "—";
                  const rStatus = e.reschedule_status || "None";

                  return (
                    <TableRow
                      key={e.id}
                      className="hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/events/${e.event_id}`)}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateOnly(e.event_date)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{e.hostess_name || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {e.event_type || "—"}
                        {(e.event_format && e.event_format !== "In-Person") && (
                          <span className="ml-1 text-muted-foreground">• {e.event_format}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColor(e.event_status))}>
                            {e.event_status}
                          </Badge>
                          {rStatus !== "None" && (
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", rescheduleColor(rStatus))}>
                              {rStatus === "In Process of Rescheduling" ? "Rescheduling" : rStatus}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">{guestCount || "—"}</TableCell>
                      <TableCell className="text-center text-sm">{e.ordering_guest_count || orderCount || "—"}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {evTotalSales > 0 ? `$${evTotalSales.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">{e.future_bookings_count || "—"}</TableCell>
                      <TableCell className="text-center">
                        {convRate !== "—" ? (
                          <span className={cn("text-xs font-semibold",
                            Number(convRate) >= 50 ? "text-green-600" : "text-amber-600"
                          )}>{convRate}%</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-0.5">
                          {e.hostess_name && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title="Log hostess activity"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openHostessPanel(e);
                              }}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setDeleteTarget(e);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Hostess Universal Action Panel */}
      <UniversalActionPanel
        item={actionPanelItem}
        open={actionPanelOpen}
        onClose={() => setActionPanelOpen(false)}
        onLogAction={handleHostessAction}
        onNavigateToProfile={(item) => {
          const ev = events.find((e) => e.id === item.id);
          if (ev) navigate(`/events/${ev.event_id}`);
        }}
        isPending={hostessActionMutation.isPending}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Are you sure you want to delete <strong>{deleteTarget?.hostess_name || deleteTarget?.event_id}</strong>?</span>
              {deleteTargetLinkedCount > 0 && (
                <span className="block text-amber-600 font-medium">
                  ⚠ This event has {deleteTargetLinkedCount} linked order{deleteTargetLinkedCount > 1 ? "s" : ""}. Orders will be unlinked (not deleted).
                </span>
              )}
              <span className="block">Guest records for this event will be removed. Orders and customers will not be deleted.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.event_id)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Event"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
