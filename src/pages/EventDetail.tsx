import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fetchEvents, fetchOrders, upsertEvent } from "@/lib/queries";
import { formatDateOnly, parseLocalDate, toLocalDateKey } from "@/lib/dateOnly";
import type { EventRecord, OrderWithCustomer } from "@/lib/types";
import EventGuestPanel from "@/components/EventGuestPanel";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, DollarSign, Users, ShoppingBag, TrendingUp, CalendarDays, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EVENT_TYPES = ["Party", "Facial", "Other"] as const;

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

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

  if (!eventId) return null;

  const handleDateSelect = (date: Date | undefined) => {
    if (!date || !event) return;
    const dateStr = toLocalDateKey(date);
    if (dateStr !== event.event_date) {
      eventMutation.mutate({ event_id: event.event_id, event_date: dateStr });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/events")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {event?.hostess_name ? `${event.hostess_name}'s Event` : "Event Detail"}
            </h2>
            <p className="text-sm text-muted-foreground font-mono">{eventId}</p>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-blue-600" />
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
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Sales</span>
              </div>
              <p className="text-lg font-bold text-green-600">${totalSales.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Orders</span>
              </div>
              <p className="text-lg font-bold text-purple-600">{orderCount}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Conversion</span>
              </div>
              <p className="text-lg font-bold text-amber-600">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  <label className="text-xs text-muted-foreground">Hostess</label>
                  <Input
                    className="h-8 text-sm"
                    defaultValue={event.hostess_name || ""}
                    key={event.hostess_name}
                    onBlur={(e) => {
                      if (e.target.value !== (event.hostess_name || "")) {
                        eventMutation.mutate({ event_id: event.event_id, hostess_name: e.target.value });
                      }
                    }}
                  />
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
                            o.order_type === "Reorder" ? "bg-purple-100 text-purple-700" :
                            o.order_type === "Party" ? "bg-pink-100 text-pink-700" :
                            "bg-amber-100 text-amber-700"
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

        {/* Guest List */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Guest List</h3>
          <EventGuestPanel eventId={eventId} />
        </div>
      </div>
    </Layout>
  );
}
