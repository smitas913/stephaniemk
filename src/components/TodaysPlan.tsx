import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, Plus, Trash2, MapPin, Navigation, Truck, PartyPopper, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type PlanItem = {
  id: string;
  plan_date: string;
  item_type: "delivery" | "event";
  customer_name: string;
  address: string | null;
  notes: string | null;
  event_time: string | null;
  event_location: string | null;
  sort_order: number;
  owner_user_id: string | null;
};

const today = () => format(new Date(), "yyyy-MM-dd");

async function fetchPlanItems(): Promise<PlanItem[]> {
  const { data, error } = await supabase
    .from("daily_plan_items" as any)
    .select("*")
    .eq("plan_date", today())
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as any) || [];
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export default function TodaysPlan() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["daily-plan", today()],
    queryFn: fetchPlanItems,
  });

  const deliveries = items.filter((i) => i.item_type === "delivery");
  const events = items.filter((i) => i.item_type === "event");

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addItem = useMutation({
    mutationFn: async (type: "delivery" | "event") => {
      const uid = await getCurrentUserId();
      const maxOrder = items.filter((i) => i.item_type === type).reduce((m, i) => Math.max(m, i.sort_order), -1);
      const { error } = await supabase.from("daily_plan_items" as any).insert({
        plan_date: today(),
        item_type: type,
        customer_name: "",
        sort_order: maxOrder + 1,
        owner_user_id: uid,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-plan"] }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PlanItem> & { id: string }) => {
      const { error } = await supabase.from("daily_plan_items" as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-plan"] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_plan_items" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-plan"] }),
  });

  const reorder = useCallback(
    async (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx) return;
      const reordered = [...deliveries];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      // Optimistic: update sort_order for each
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].sort_order !== i) {
          await supabase.from("daily_plan_items" as any).update({ sort_order: i } as any).eq("id", reordered[i].id);
        }
      }
      qc.invalidateQueries({ queryKey: ["daily-plan"] });
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">Today's Plan</CardTitle>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" />{deliveries.length} deliver{deliveries.length !== 1 ? "ies" : "y"}</span>
            <span className="flex items-center gap-1"><PartyPopper className="w-3.5 h-3.5" />{events.length} event{events.length !== 1 ? "s" : ""}</span>
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
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => addItem.mutate("delivery")}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
          </div>

          {deliveries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No deliveries planned for today</p>
          ) : (
            <div className="space-y-1.5">
              {deliveries.map((d, idx) => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={() => { if (dragIdx !== null) { reorder(dragIdx, idx); setDragIdx(null); } }}
                  onDragEnd={() => setDragIdx(null)}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-lg border border-border/50 bg-background/80 transition-all",
                    dragIdx === idx && "opacity-50"
                  )}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground mt-2 cursor-grab shrink-0" />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    <Input
                      placeholder="Customer name"
                      defaultValue={d.customer_name}
                      className="h-8 text-sm"
                      onBlur={(e) => { if (e.target.value !== d.customer_name) updateItem.mutate({ id: d.id, customer_name: e.target.value }); }}
                    />
                    <Input
                      placeholder="Address"
                      defaultValue={d.address || ""}
                      className="h-8 text-sm"
                      onBlur={(e) => { if (e.target.value !== (d.address || "")) updateItem.mutate({ id: d.id, address: e.target.value }); }}
                    />
                    <Input
                      placeholder="Notes"
                      defaultValue={d.notes || ""}
                      className="h-8 text-sm"
                      onBlur={(e) => { if (e.target.value !== (d.notes || "")) updateItem.mutate({ id: d.id, notes: e.target.value }); }}
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteItem.mutate(d.id)}>
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
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => addItem.mutate("event")}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No events planned for today</p>
          ) : (
            <div className="space-y-1.5">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 p-2 rounded-lg border border-border/50 bg-background/80">
                  <Clock className="w-4 h-4 text-muted-foreground mt-2 shrink-0" />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-1.5">
                    <Input
                      placeholder="Event name"
                      defaultValue={ev.customer_name}
                      className="h-8 text-sm"
                      onBlur={(e) => { if (e.target.value !== ev.customer_name) updateItem.mutate({ id: ev.id, customer_name: e.target.value }); }}
                    />
                    <Input
                      placeholder="Time"
                      defaultValue={ev.event_time || ""}
                      className="h-8 text-sm"
                      onBlur={(e) => { if (e.target.value !== (ev.event_time || "")) updateItem.mutate({ id: ev.id, event_time: e.target.value }); }}
                    />
                    <Input
                      placeholder="Location"
                      defaultValue={ev.event_location || ""}
                      className="h-8 text-sm"
                      onBlur={(e) => { if (e.target.value !== (ev.event_location || "")) updateItem.mutate({ id: ev.id, event_location: e.target.value }); }}
                    />
                    <Input
                      placeholder="Notes"
                      defaultValue={ev.notes || ""}
                      className="h-8 text-sm"
                      onBlur={(e) => { if (e.target.value !== (ev.notes || "")) updateItem.mutate({ id: ev.id, notes: e.target.value }); }}
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteItem.mutate(ev.id)}>
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
