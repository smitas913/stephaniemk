import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvents, fetchOrders, deleteEvent, upsertEvent, createNote, fetchAllLatestNotes } from "@/lib/queries";
import Layout from "@/components/Layout";
import UniversalActionPanel from "@/components/UniversalActionPanel";
import type { UniversalActionItem } from "@/components/UniversalActionPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Calendar, Users, DollarSign, Plus, Trash2, MessageSquare, ShoppingBag, CheckCircle2, SlidersHorizontal, MoreHorizontal, X, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateOnly, toLocalDateKey } from "@/lib/dateOnly";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EventRecord } from "@/lib/types";

const BUSINESS_EVENT_TYPES = new Set(["Career Chat", "Pearl Appointment"]);
const isBusinessType = (t: string | null | undefined) => !!t && BUSINESS_EVENT_TYPES.has(t);

const scopeChipClasses = (scope: string) =>
  scope === "Unit"
    ? "bg-teal-100 text-teal-700 border-teal-200"
    : "bg-muted text-muted-foreground border-border";

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
  const [scopeFilter, setScopeFilter] = useState("all");
  const [categoryTab, setCategoryTab] = useState<"product" | "business">("product");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EventRecord | null>(null);

  const { data: events = [], isLoading } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: unifiedNotes = [] } = useQuery({ queryKey: ["unified-notes"], queryFn: fetchAllLatestNotes });

  const activeFilterCount = [
    typeFilter !== "all",
    formatFilter !== "all",
    statusFilter !== "all",
    rescheduleFilter !== "all",
    scopeFilter !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setTypeFilter("all");
    setFormatFilter("all");
    setStatusFilter("all");
    setRescheduleFilter("all");
    setScopeFilter("all");
  };

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
      item: UniversalActionItem; actionType: string; note: string;
      isBookingAttempt: boolean; isFollowUp: boolean; nextFollowUpDate?: string | null;
    }) => {
      const ev = events.find((e) => e.id === uItem.id);
      if (ev && nextFollowUpDate) {
        await upsertEvent({ event_id: ev.event_id, hostess_next_action_date: nextFollowUpDate } as any);
      }
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
    item: UniversalActionItem; actionType: string; note: string;
    isBookingAttempt: boolean; isFollowUp: boolean; nextFollowUpDate?: string | null;
  }) => { hostessActionMutation.mutate(params); }, [hostessActionMutation]);

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
      if (scopeFilter !== "all" && ((e as any).event_scope || "Personal") !== scopeFilter) return false;
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
  }, [events, search, typeFilter, formatFilter, statusFilter, rescheduleFilter, scopeFilter]);

  // Split by category (Product vs Business)
  const { productEvents, businessEvents } = useMemo(() => {
    const productEvents: EventRecord[] = [];
    const businessEvents: EventRecord[] = [];
    for (const e of filtered) {
      if (isBusinessType(e.event_type)) businessEvents.push(e);
      else productEvents.push(e);
    }
    return { productEvents, businessEvents };
  }, [filtered]);

  const activeEvents = categoryTab === "business" ? businessEvents : productEvents;
  const isBusiness = categoryTab === "business";

  const todayStr = toLocalDateKey();
  const { upcoming, past } = useMemo(() => {
    const sortAsc = [...activeEvents].sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));
    const upcoming = sortAsc
      .filter((e) => (e.event_date || "") >= todayStr && e.event_status !== "Cancelled")
      .reverse();
    const past = sortAsc
      .filter((e) => (e.event_date || "") < todayStr || e.event_status === "Cancelled")
      .reverse();
    return { upcoming, past };
  }, [activeEvents, todayStr]);

  const totalSales = activeEvents.reduce((s, e) => s + (eventSales.get(e.event_id)?.total || 0), 0);
  const totalGuests = activeEvents.reduce((s, e) => s + (e.guest_count || 0), 0);
  const deleteTargetLinkedCount = deleteTarget ? (eventSales.get(deleteTarget.event_id)?.orderCount || 0) : 0;

  const EventRow = ({ e }: { e: EventRecord }) => {
    const sales = eventSales.get(e.event_id);
    const orderCount = sales?.orderCount || 0;
    const evTotalSales = sales?.total || 0;
    const guestCount = e.guest_count || 0;
    const rStatus = e.reschedule_status || "None";
    const isHeld = e.event_status === "Held";

    return (
      <TableRow
        className="hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => navigate(`/events/${e.event_id}`)}
      >
        <TableCell className="text-xs whitespace-nowrap font-medium">
          {formatDateOnly(e.event_date)}
        </TableCell>
        <TableCell className="text-sm font-medium">{e.hostess_name || "—"}</TableCell>
        <TableCell className="text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{e.event_type || "—"}</span>
            {(e.event_format && e.event_format !== "In-Person") && (
              <span className="text-muted-foreground">• {e.event_format}</span>
            )}
            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 font-medium", scopeChipClasses((e as any).event_scope || "Personal"))}>
              {(e as any).event_scope || "Personal"}
            </Badge>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {rStatus === "In Process of Rescheduling" ? (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", rescheduleColor(rStatus))}>
                Rescheduling
              </Badge>
            ) : (
              <>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColor(e.event_status))}>
                  {e.event_status}
                </Badge>
                {rStatus !== "None" && (
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", rescheduleColor(rStatus))}>
                    {rStatus}
                  </Badge>
                )}
              </>
            )}
          </div>
        </TableCell>
        {!isBusiness && (
          <>
            <TableCell className="text-center text-sm">{guestCount || "—"}</TableCell>
            <TableCell className="text-center text-sm">{orderCount || "—"}</TableCell>
            <TableCell className="text-right text-sm font-semibold">
              {evTotalSales > 0 ? `$${evTotalSales.toFixed(2)}` : "—"}
            </TableCell>
          </>
        )}
        {isBusiness && (
          <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
            {e.notes || (e as any).hostess_next_action || "—"}
          </TableCell>
        )}

        {/* ── Simplified Actions ── */}
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-primary gap-1"
              title="Guest list"
              onClick={(ev) => { ev.stopPropagation(); navigate(`/events/${e.event_id}?tab=guests`); }}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Guests</span>
              {guestCount > 0 && (
                <span className="ml-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full px-1.5 py-0">
                  {guestCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              title="Add order"
              onClick={(ev) => { ev.stopPropagation(); navigate(`/orders/new?eventId=${e.event_id}&type=${e.event_type || "Party"}`); }}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
            </Button>
            {e.hostess_name && (
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                title="Log hostess activity"
                onClick={(ev) => { ev.stopPropagation(); openHostessPanel(e); }}
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44" onClick={(ev) => ev.stopPropagation()}>
                <DropdownMenuItem onClick={() => navigate(`/events/${e.event_id}?addGuest=1`)}>
                  <Users className="w-3.5 h-3.5 mr-2" /> Add guest
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/events/${e.event_id}?reschedule=1`)}>
                  <Calendar className="w-3.5 h-3.5 mr-2" /> Reschedule
                </DropdownMenuItem>
                {!isHeld && (
                  <DropdownMenuItem
                    disabled={markHeldMutation.isPending}
                    onClick={() => markHeldMutation.mutate(e)}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Mark complete
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteTarget(e)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete event
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // ── Mobile Event Card ──
  const MobileEventCard = ({ e }: { e: EventRecord }) => {
    const sales = eventSales.get(e.event_id);
    const evTotalSales = sales?.total || 0;
    const orderCount = sales?.orderCount || 0;
    const isHeld = e.event_status === "Held";
    const rStatus = e.reschedule_status || "None";

    return (
      <div
        className="bg-card border border-border rounded-lg p-3 space-y-2 active:bg-muted/50 transition-colors"
        onClick={() => navigate(`/events/${e.event_id}`)}
      >
        {/* Row 1: Date + Status badges */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{formatDateOnly(e.event_date)}</span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {rStatus === "In Process of Rescheduling" ? (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", rescheduleColor(rStatus))}>
                Rescheduling
              </Badge>
            ) : (
              <>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColor(e.event_status))}>
                  {e.event_status}
                </Badge>
                {rStatus !== "None" && (
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", rescheduleColor(rStatus))}>
                    {rStatus}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>

        {/* Row 2: Contact/Hostess name + type + scope */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-base font-semibold text-foreground truncate">{e.hostess_name || "—"}</p>
            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 shrink-0", scopeChipClasses((e as any).event_scope || "Personal"))}>
              {(e as any).event_scope || "Personal"}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {e.event_type || "—"}{e.event_format && e.event_format !== "In-Person" ? ` · ${e.event_format}` : ""}
          </span>
        </div>

        {/* Row 3: Stats + next task */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {!isBusiness && (e.guest_count || 0) > 0 && <span><Users className="w-3 h-3 inline mr-0.5" />{e.guest_count}</span>}
            {!isBusiness && orderCount > 0 && <span><ShoppingBag className="w-3 h-3 inline mr-0.5" />{orderCount}</span>}
            {!isBusiness && evTotalSales > 0 && <span className="text-green-600 font-medium">${evTotalSales.toFixed(0)}</span>}
            {isBusiness && e.notes && <span className="truncate max-w-[200px]">{e.notes}</span>}
          </div>
          {e.event_status === "Held" ? (
            (e as any).thank_you_sent ? (
              <span className="text-[11px] text-green-700 truncate max-w-[140px]">Thank you sent ✓</span>
            ) : (
              <span className="text-[11px] text-amber-600 truncate max-w-[140px]">Send thank you note</span>
            )
          ) : e.reschedule_status === "In Process of Rescheduling" ? (
            <span className="text-[11px] text-amber-600 truncate max-w-[140px]">Reschedule follow-up</span>
          ) : e.event_status === "Cancelled" ? (
            <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">Cancelled</span>
          ) : null}
            </span>
          )}
        </div>

        {/* Row 4: Quick action buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/50" onClick={ev => ev.stopPropagation()}>
          <Button variant="outline" size="sm" className="h-8 flex-1 text-xs gap-1"
            onClick={() => navigate(`/events/${e.event_id}?tab=guests`)}>
            <Users className="w-3.5 h-3.5" /> Guests
            {(e.guest_count || 0) > 0 && (
              <span className="ml-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full px-1.5 py-0">
                {e.guest_count}
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-8 flex-1 text-xs gap-1"
            onClick={() => navigate(`/orders/new?eventId=${e.event_id}&type=${e.event_type || "Party"}`)}>
            <ShoppingBag className="w-3.5 h-3.5" /> Add Order
          </Button>
          {e.hostess_name && (
            <Button variant="outline" size="sm" className="h-8 flex-1 text-xs gap-1"
              onClick={() => openHostessPanel(e)}>
              <MessageSquare className="w-3.5 h-3.5" /> Log Activity
            </Button>
          )}
          {/* More actions drawer */}
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="px-2 pb-8">
              <div className="pt-3 pb-2 px-3">
                <p className="text-sm font-semibold text-foreground">{e.hostess_name || "Event"}</p>
                <p className="text-xs text-muted-foreground">{formatDateOnly(e.event_date)}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-foreground hover:bg-muted"
                  onClick={() => navigate(`/events/${e.event_id}`)}>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" /> View Event Detail
                </button>
                <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-foreground hover:bg-muted"
                  onClick={() => navigate(`/events/${e.event_id}?addGuest=1`)}>
                  <Users className="w-5 h-5 text-primary" /> Add Guest
                </button>
                <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-foreground hover:bg-muted"
                  onClick={() => navigate(`/events/${e.event_id}?reschedule=1`)}>
                  <Calendar className="w-5 h-5 text-amber-600" /> Reschedule
                </button>
                {!isHeld && (
                  <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-foreground hover:bg-muted"
                    onClick={() => markHeldMutation.mutate(e)}>
                    <CheckCircle2 className="w-5 h-5 text-green-600" /> Mark Complete
                  </button>
                )}
                <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-destructive hover:bg-muted"
                  onClick={() => setDeleteTarget(e)}>
                  <Trash2 className="w-5 h-5" /> Delete Event
                </button>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    );
  };

  const EventSection = ({ rows, label }: { rows: EventRecord[]; label: string }) => (
    rows.length === 0 ? null : (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className={cn("text-sm font-semibold", label === "Upcoming" ? "text-foreground" : "text-muted-foreground")}>{label}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{rows.length}</span>
        </div>
        {/* Desktop: table */}
        <div className="hidden sm:block">
          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">{isBusiness ? "Contact" : "Hostess"}</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  {!isBusiness && <TableHead className="text-xs text-center">Guests</TableHead>}
                  {!isBusiness && <TableHead className="text-xs text-center">Orders</TableHead>}
                  {!isBusiness && <TableHead className="text-xs text-right">Sales</TableHead>}
                  {isBusiness && <TableHead className="text-xs">Notes</TableHead>}
                  <TableHead className="text-xs">Next Task</TableHead>
                  <TableHead className="text-xs w-[110px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => <EventRow key={e.id} e={e} />)}
              </TableBody>
            </Table>
          </div>
        </div>
        {/* Mobile: cards */}
        <div className="sm:hidden space-y-2">
          {rows.map((e) => <MobileEventCard key={e.id} e={e} />)}
        </div>
      </div>
    )
  );

  return (
    <Layout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Events</h2>
            <p className="text-sm text-muted-foreground">{activeEvents.length} {isBusiness ? "business" : "product"} event{activeEvents.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => navigate("/events/new")} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Event
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Events</span>
              </div>
              <p className="text-lg font-bold text-blue-600">{activeEvents.length}</p>
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

        {/* Category Tabs */}
        <Tabs value={categoryTab} onValueChange={(v) => setCategoryTab(v as "product" | "business")}>
          <TabsList className="grid w-full sm:w-auto grid-cols-2">
            <TabsTrigger value="product">
              Product Events
              <span className="ml-2 text-[10px] bg-muted-foreground/15 rounded-full px-1.5 py-0.5">{productEvents.length}</span>
            </TabsTrigger>
            <TabsTrigger value="business">
              Business Events
              <span className="ml-2 text-[10px] bg-muted-foreground/15 rounded-full px-1.5 py-0.5">{businessEvents.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search + Filters bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search hostess, event ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Filters</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Party">Party</SelectItem>
                      <SelectItem value="Facial">Facial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Format</label>
                  <Select value={formatFilter} onValueChange={setFormatFilter}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Formats" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Formats</SelectItem>
                      <SelectItem value="In-Person">In-Person</SelectItem>
                      <SelectItem value="Zoom">Zoom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Booked">Booked</SelectItem>
                      <SelectItem value="Held">Held</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reschedule</label>
                  <Select value={rescheduleFilter} onValueChange={setRescheduleFilter}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="None">None</SelectItem>
                      <SelectItem value="In Process of Rescheduling">In Process</SelectItem>
                      <SelectItem value="Rescheduled">Rescheduled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scope</label>
                  <Select value={scopeFilter} onValueChange={setScopeFilter}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Personal">Personal</SelectItem>
                      <SelectItem value="Unit">Unit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Event Tables */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeEvents.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No {isBusiness ? "business" : "product"} events found.</p>
        ) : (
          <div className="space-y-6">
            <EventSection rows={upcoming} label="Upcoming" />
            <EventSection rows={past} label="Past & Cancelled" />
          </div>
        )}
      </div>

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
