import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers } from "@/lib/queries";
import { formatPhone } from "@/lib/phoneUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, Plus, Trash2, MapPin, Navigation, Truck, PartyPopper, Clock, CalendarIcon, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, addDays, parseISO } from "date-fns";

type PlanItem = {
  id: string;
  plan_date: string;
  item_type: "delivery" | "event";
  customer_name: string;
  customer_id: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  event_time: string | null;
  event_location: string | null;
  sort_order: number;
  owner_user_id: string | null;
};

const todayStr = () => format(new Date(), "yyyy-MM-dd");

async function fetchPlanItems(dateStr: string): Promise<PlanItem[]> {
  const { data, error } = await supabase
    .from("daily_plan_items" as any)
    .select("*")
    .eq("plan_date", dateStr)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as any) || [];
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

// Customer search autocomplete
function CustomerSearch({ onSelect }: { onSelect: (c: { id: string; full_name: string; address: string; phone: string | null }) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const filtered = query.length >= 2
    ? customers.filter((c) => c.full_name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search customer..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="h-8 text-sm pl-7"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-9 left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((c) => {
            const addr = [c.address_line_1, c.address_line_2, [c.city, c.state_territory, c.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
            return (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent/50 text-sm transition-colors"
                onClick={() => {
                  onSelect({ id: c.id, full_name: c.full_name, address: addr, phone: c.phone || null });
                  setQuery("");
                  setOpen(false);
                }}
              >
                <p className="font-medium text-foreground">{c.full_name}</p>
                {addr && <p className="text-xs text-muted-foreground truncate">{addr}</p>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TodaysPlan() {
  const qc = useQueryClient();
  const [viewDate, setViewDate] = useState(todayStr());
  const isToday = viewDate === todayStr();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["daily-plan", viewDate],
    queryFn: () => fetchPlanItems(viewDate),
  });

  const deliveries = items.filter((i) => i.item_type === "delivery");
  const events = items.filter((i) => i.item_type === "event");

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [addingDelivery, setAddingDelivery] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState<Date>(addDays(new Date(), 1));
  const [addingEvent, setAddingEvent] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["daily-plan"] });

  const addDeliveryFromCustomer = useMutation({
    mutationFn: async (c: { id: string; full_name: string; address: string; phone: string | null }) => {
      const uid = await getCurrentUserId();
      const dateStr = format(deliveryDate, "yyyy-MM-dd");
      const maxOrder = items.filter((i) => i.item_type === "delivery").reduce((m, i) => Math.max(m, i.sort_order), -1);
      const { error } = await supabase.from("daily_plan_items" as any).insert({
        plan_date: dateStr,
        item_type: "delivery",
        customer_name: c.full_name,
        customer_id: c.id,
        address: c.address || null,
        phone: c.phone,
        sort_order: maxOrder + 1,
        owner_user_id: uid,
      } as any);
      if (error) throw error;
      if (dateStr !== viewDate) setViewDate(dateStr);
    },
    onSuccess: () => { invalidate(); setAddingDelivery(false); toast.success("Delivery added"); },
  });

  const addEventItem = useMutation({
    mutationFn: async () => {
      const uid = await getCurrentUserId();
      const maxOrder = items.filter((i) => i.item_type === "event").reduce((m, i) => Math.max(m, i.sort_order), -1);
      const { error } = await supabase.from("daily_plan_items" as any).insert({
        plan_date: viewDate,
        item_type: "event",
        customer_name: "",
        sort_order: maxOrder + 1,
        owner_user_id: uid,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setAddingEvent(false); },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PlanItem> & { id: string }) => {
      const { error } = await supabase.from("daily_plan_items" as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_plan_items" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reorder = useCallback(
    async (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx) return;
      const reordered = [...deliveries];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].sort_order !== i) {
          await supabase.from("daily_plan_items" as any).update({ sort_order: i } as any).eq("id", reordered[i].id);
        }
      }
      invalidate();
    },
    [deliveries, qc]
  );

  const mapsRouteUrl = () => {
    const addresses = deliveries
      .filter((d) => d.address?.trim())
      .map((d) => encodeURIComponent(d.address!.trim()));
    if (addresses.length === 0) return null;
    return `https://www.google.com/maps/dir/${addresses.join("/")}`;
  };

  const routeUrl = mapsRouteUrl();

  return (
    <Card className="border-primary/20 shadow-md bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">
              {isToday ? "Deliveries & Events" : `Plan for ${format(parseISO(viewDate), "MMM d, yyyy")}`}
            </CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" />{deliveries.length}</span>
              <span className="flex items-center gap-1"><PartyPopper className="w-3.5 h-3.5" />{events.length}</span>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {isToday ? "Today" : format(parseISO(viewDate), "MMM d")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={parseISO(viewDate)}
                  onSelect={(d) => { if (d) setViewDate(format(d, "yyyy-MM-dd")); }}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Deliveries */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-primary" /> Deliveries
            </h3>
            <div className="flex items-center gap-2">
              {routeUrl && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={routeUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <MapPin className="w-3.5 h-3.5" /> Open Route
                      </Button>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Open route in Google Maps in delivery order</TooltipContent>
                </Tooltip>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setAddingDelivery(!addingDelivery); setDeliveryDate(addDays(new Date(), 1)); }}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
          </div>

          {/* Add delivery form */}
          {addingDelivery && (
            <div className="p-3 rounded-lg border border-primary/30 bg-background space-y-2">
              <p className="text-xs font-medium text-foreground">Select a customer for delivery:</p>
              <CustomerSearch
                onSelect={(c) => addDeliveryFromCustomer.mutate(c)}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Delivery date:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {format(deliveryDate, "MMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={deliveryDate}
                      onSelect={(d) => { if (d) setDeliveryDate(d); }}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingDelivery(false)}>Cancel</Button>
            </div>
          )}

          {deliveries.length === 0 && !addingDelivery ? (
            <p className="text-xs text-muted-foreground py-2">No deliveries planned for {isToday ? "today" : "this date"}</p>
          ) : (
            <div className="space-y-1.5">
              {deliveries.map((d, idx) => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIdx !== null) { reorder(dragIdx, idx); setDragIdx(null); } }}
                  onDragEnd={() => setDragIdx(null)}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-lg border border-border/50 bg-background/80 transition-all",
                    dragIdx === idx && "opacity-50"
                  )}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground mt-2 cursor-grab shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground truncate">{d.customer_name || "Unnamed"}</span>
                      {d.phone && <span className="text-xs text-muted-foreground">{d.phone}</span>}
                      {!d.address && (
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          </TooltipTrigger>
                          <TooltipContent>No address on file</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <Input
                        placeholder="Address"
                        defaultValue={d.address || ""}
                        className="h-7 text-xs"
                        onBlur={(e) => { if (e.target.value !== (d.address || "")) updateItem.mutate({ id: d.id, address: e.target.value }); }}
                      />
                      <Input
                        placeholder="Notes"
                        defaultValue={d.notes || ""}
                        className="h-7 text-xs"
                        onBlur={(e) => { if (e.target.value !== (d.notes || "")) updateItem.mutate({ id: d.id, notes: e.target.value }); }}
                      />
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteItem.mutate(d.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Events */}
        <div className="space-y-2 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <PartyPopper className="w-4 h-4 text-primary" /> Events
            </h3>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => addEventItem.mutate()}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No events planned for {isToday ? "today" : "this date"}</p>
          ) : (
            <div className="space-y-1.5">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 p-2 rounded-lg border border-border/50 bg-background/80">
                  <Clock className="w-4 h-4 text-muted-foreground mt-2 shrink-0" />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-1.5">
                    <Input
                      placeholder="Event name"
                      defaultValue={ev.customer_name}
                      className="h-7 text-xs"
                      onBlur={(e) => { if (e.target.value !== ev.customer_name) updateItem.mutate({ id: ev.id, customer_name: e.target.value }); }}
                    />
                    <Input
                      placeholder="Time"
                      defaultValue={ev.event_time || ""}
                      className="h-7 text-xs"
                      onBlur={(e) => { if (e.target.value !== (ev.event_time || "")) updateItem.mutate({ id: ev.id, event_time: e.target.value }); }}
                    />
                    <Input
                      placeholder="Location"
                      defaultValue={ev.event_location || ""}
                      className="h-7 text-xs"
                      onBlur={(e) => { if (e.target.value !== (ev.event_location || "")) updateItem.mutate({ id: ev.id, event_location: e.target.value }); }}
                    />
                    <Input
                      placeholder="Notes"
                      defaultValue={ev.notes || ""}
                      className="h-7 text-xs"
                      onBlur={(e) => { if (e.target.value !== (ev.notes || "")) updateItem.mutate({ id: ev.id, notes: e.target.value }); }}
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteItem.mutate(ev.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
