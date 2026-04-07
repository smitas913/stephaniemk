import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvents, upsertEvent, generateEventWorkflowTasks } from "@/lib/queries";
import { generateEventId } from "@/lib/eventId";
import { toLocalDateKey } from "@/lib/dateOnly";
import { EVENT_FORMATS } from "@/lib/types";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Users, Store, Monitor, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "Networking Event", label: "Networking", icon: Users },
  { value: "Vendor Event", label: "Vendor", icon: Store },
] as const;

const FORMAT_OPTIONS = [
  { value: "In-Person", label: "In-Person", icon: MapPin },
  { value: "Zoom", label: "Zoom", icon: Monitor },
] as const;

export default function NewEvent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });

  const [eventType, setEventType] = useState<string>("Networking Event");
  const [eventFormat, setEventFormat] = useState<string>("In-Person");
  const [eventDate, setEventDate] = useState(toLocalDateKey());
  const [hostessName, setHostessName] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [bookings, setBookings] = useState("");
  const [sharings, setSharings] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const eventId = generateEventId(eventType, eventDate, hostessName || "Event", events.map(e => e.event_id));
      await upsertEvent({
        event_id: eventId,
        event_type: eventType,
        event_format: eventFormat,
        event_date: eventDate || null,
        hostess_name: hostessName || undefined,
        guest_count: parseInt(guestCount) || 0,
        future_bookings_count: parseInt(bookings) || 0,
        sharing_appointments_count: parseInt(sharings) || 0,
        notes: notes.trim() || null,
      });
      return eventId;
    },
    onSuccess: async (eventId) => {
      try {
        await generateEventWorkflowTasks(eventId, eventDate || null);
      } catch (e) {
        console.error("Failed to generate workflow tasks", e);
      }
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      toast.success("Event created");
      navigate(`/events/${eventId}`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create event");
    },
  });

  const canSubmit = eventType && eventDate && !mutation.isPending;

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/events")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">New Event</h2>
            <p className="text-sm text-muted-foreground">Create a new networking or vendor event</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6 space-y-5">
            {/* Event Type */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Event Type *</label>
              <div className="flex gap-3">
                {EVENT_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setEventType(t.value)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 h-12 rounded-lg border-2 text-sm font-medium transition-colors",
                        eventType === t.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Event Format */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Event Format *</label>
              <div className="flex gap-3">
                {FORMAT_OPTIONS.map((f) => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setEventFormat(f.value)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 h-12 rounded-lg border-2 text-sm font-medium transition-colors",
                        eventFormat === f.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Event Date *</label>
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-10 max-w-xs" />
            </div>

            {/* Hostess */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Hostess Name</label>
              <Input placeholder="Optional — can add later" value={hostessName} onChange={(e) => setHostessName(e.target.value)} className="h-10 max-w-sm" />
            </div>

            {/* Guest Count */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Guest Count (Faces)</label>
              <Input type="number" min={0} placeholder="0" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} className="h-10 max-w-[120px]" />
            </div>

            {/* Bookings & Sharings */}
            <div className="grid grid-cols-2 gap-4 max-w-xs">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Bookings</label>
                <Input type="number" min={0} placeholder="0" value={bookings} onChange={(e) => setBookings(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Sharings</label>
                <Input type="number" min={0} placeholder="0" value={sharings} onChange={(e) => setSharings(e.target.value)} className="h-10" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Notes</label>
              <Textarea placeholder="Optional notes about the event..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px]" />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button className="h-11 px-8" disabled={!canSubmit} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Creating..." : "Create Event"}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => navigate("/events")}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
