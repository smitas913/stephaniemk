import { useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEvents, fetchOrders } from "@/lib/queries";
import { formatDateOnly, toLocalDateKey } from "@/lib/dateOnly";
import { toast } from "sonner";

type GuestPending = {
  id: string;
  name: string;
  event_id: string;
  event_date: string | null;
  hostess_name: string | null;
};

export default function ThankYouRemindersCard() {
  const queryClient = useQueryClient();
  const today = toLocalDateKey();

  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });

  // Held + past events where hostess TY note not sent
  const pendingHostess = useMemo(
    () =>
      (events as any[]).filter(
        (e) =>
          e.event_status === "Held" &&
          e.event_date &&
          e.event_date <= today &&
          !e.thank_you_sent &&
          e.hostess_name,
      ),
    [events, today],
  );

  // Guests on held events with TY not sent
  const heldEventIds = useMemo(
    () => (events as any[]).filter((e) => e.event_status === "Held").map((e) => e.event_id),
    [events],
  );

  const { data: pendingGuests = [] } = useQuery({
    queryKey: ["pending-ty-guests", heldEventIds],
    enabled: heldEventIds.length > 0,
    queryFn: async (): Promise<GuestPending[]> => {
      const { data, error } = await supabase
        .from("event_guests")
        .select("id, name, event_id, thank_you_sent, attending")
        .in("event_id", heldEventIds)
        .eq("thank_you_sent", false)
        .eq("attending", true);
      if (error) throw error;
      const evtById = new Map((events as any[]).map((e) => [e.event_id, e]));
      return (data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        event_id: g.event_id,
        event_date: evtById.get(g.event_id)?.event_date || null,
        hostess_name: evtById.get(g.event_id)?.hostess_name || null,
      }));
    },
  });

  const pendingOrders = useMemo(
    () => (orders as any[]).filter((o) => !o.thank_you_sent).slice(0, 25),
    [orders],
  );

  const markEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("events")
        .update({ thank_you_sent: true } as any)
        .eq("event_id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Marked thank you sent");
    },
  });

  const markGuest = useMutation({
    mutationFn: async (guestId: string) => {
      const { error } = await supabase
        .from("event_guests")
        .update({ thank_you_sent: true } as any)
        .eq("id", guestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-ty-guests"] });
      toast.success("Guest thank you marked");
    },
  });

  const markOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ thank_you_sent: true } as any)
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order thank you marked");
    },
  });

  const totalPending = pendingHostess.length + pendingGuests.length + pendingOrders.length;
  if (totalPending === 0) return null;

  return (
    <Card className="border-pink-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Heart className="w-4 h-4 text-pink-500" />
          Thank You Notes to Send
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">{totalPending} pending</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {pendingHostess.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hostesses</p>
            {pendingHostess.map((e: any) => (
              <div key={e.event_id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <Link to={`/events/${e.event_id}`} className="flex-1 min-w-0 text-sm hover:underline">
                  <span className="font-medium">{e.hostess_name}</span>
                  <span className="text-muted-foreground"> — {e.event_date ? formatDateOnly(e.event_date) : ""} {e.event_type || "party"}</span>
                </Link>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => markEvent.mutate(e.event_id)} disabled={markEvent.isPending}>
                  <Check className="w-3 h-3" /> Sent
                </Button>
              </div>
            ))}
          </div>
        )}

        {pendingGuests.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Guests</p>
            {pendingGuests.slice(0, 10).map((g) => (
              <div key={g.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <Link to={`/events/${g.event_id}`} className="flex-1 min-w-0 text-sm hover:underline">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-muted-foreground"> — {g.hostess_name || "party"} {g.event_date ? `· ${formatDateOnly(g.event_date)}` : ""}</span>
                </Link>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => markGuest.mutate(g.id)} disabled={markGuest.isPending}>
                  <Check className="w-3 h-3" /> Sent
                </Button>
              </div>
            ))}
            {pendingGuests.length > 10 && (
              <p className="text-[11px] text-muted-foreground italic">+{pendingGuests.length - 10} more guests pending</p>
            )}
          </div>
        )}

        {pendingOrders.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Orders</p>
            {pendingOrders.slice(0, 10).map((o: any) => (
              <div key={o.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <div className="flex-1 min-w-0 text-sm">
                  <span className="font-medium">{o.customer_name || o.customers?.full_name || "Order"}</span>
                  <span className="text-muted-foreground"> — ${Number(o.retail_amount || 0).toFixed(2)} · {formatDateOnly(o.order_date)}</span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => markOrder.mutate(o.id)} disabled={markOrder.isPending}>
                  <Check className="w-3 h-3" /> Sent
                </Button>
              </div>
            ))}
            {pendingOrders.length > 10 && (
              <p className="text-[11px] text-muted-foreground italic">+{pendingOrders.length - 10} more orders pending</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
