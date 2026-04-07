import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvents, upsertEvent, generateEventWorkflowTasks } from "@/lib/queries";
import { generateEventId } from "@/lib/eventId";
import { toLocalDateKey } from "@/lib/dateOnly";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, PartyPopper, Sparkles, Share2, Megaphone, Monitor, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "Party", label: "Party", icon: PartyPopper },
  { value: "Facial", label: "Facial", icon: Sparkles },
  { value: "Sharing Appointment", label: "Sharing Appt", icon: Share2 },
  { value: "Lead Generating Event", label: "Lead Gen", icon: Megaphone },
] as const;

const LEAD_GEN_SUBTYPES = ["Networking Event", "Vendor Event"] as const;

const FORMAT_OPTIONS = [
  { value: "In-Person", label: "In-Person", icon: MapPin },
  { value: "Zoom", label: "Zoom", icon: Monitor },
] as const;



export default function NewEvent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });

  const [eventType, setEventType] = useState<string>("Party");
  const [leadGenSubtype, setLeadGenSubtype] = useState<string>("Networking Event");
  const [eventFormat, setEventFormat] = useState<string>("In-Person");
  const [eventDate, setEventDate] = useState(toLocalDateKey());
  const [hostessName, setHostessName] = useState("");
  const [notes, setNotes] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventTime, setEventTime] = useState("");

  const isPartyOrFacial = eventType === "Party" || eventType === "Facial";
  const isSharing = eventType === "Sharing Appointment";
  const isLeadGen = eventType === "Lead Generating Event";
  const showFormat = isPartyOrFacial || isSharing;

  const mutation = useMutation({
    mutationFn: async () => {
      const displayType = isLeadGen ? leadGenSubtype : eventType;
      const eventId = generateEventId(eventType, eventDate, hostessName || "Event", events.map(e => e.event_id));
      await upsertEvent({
        event_id: eventId,
        event_type: displayType,
        event_format: showFormat ? eventFormat : "In-Person",
        event_date: eventDate || null,
        event_time: eventTime || null,
        event_location: eventLocation || null,
        hostess_name: hostessName || undefined,
        guest_count: 0,
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

  const canSubmit = eventType && eventDate && (!isLeadGen || leadGenSubtype) && !mutation.isPending;

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/events")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">New Event</h2>
            <p className="text-sm text-muted-foreground">Create a new event</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6 space-y-5">
            {/* Event Type */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Event Type *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {EVENT_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setEventType(t.value)}
                      className={cn(
                        "flex items-center justify-center gap-2 h-11 rounded-lg border-2 text-sm font-medium transition-colors",
                        eventType === t.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lead Gen Subtype */}
            {isLeadGen && (
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Event Subtype *</label>
                <div className="flex gap-3">
                  {LEAD_GEN_SUBTYPES.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setLeadGenSubtype(sub)}
                      className={cn(
                        "flex-1 h-10 rounded-lg border-2 text-sm font-medium transition-colors",
                        leadGenSubtype === sub
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Event Format */}
            {showFormat && (
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Format *</label>
                <div className="flex gap-3">
                  {FORMAT_OPTIONS.map((f) => {
                    const Icon = f.icon;
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setEventFormat(f.value)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border-2 text-sm font-medium transition-colors",
                          eventFormat === f.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Date *</label>
                <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Time</label>
                <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="h-10" />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Location</label>
              <Input placeholder="Address or Zoom link" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} className="h-10 max-w-sm" />
            </div>

            {/* Hostess — for Party/Facial */}
            {isPartyOrFacial && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Hostess Name</label>
                <Input placeholder="Optional — can add later" value={hostessName} onChange={(e) => setHostessName(e.target.value)} className="h-10 max-w-sm" />
              </div>
            )}

            {/* Contact Name — for Sharing */}
            {isSharing && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Contact Name</label>
                <Input placeholder="Person you're meeting with" value={hostessName} onChange={(e) => setHostessName(e.target.value)} className="h-10 max-w-sm" />
              </div>
            )}

            {/* Post-event fields removed — captured when marking event as Held */}

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
