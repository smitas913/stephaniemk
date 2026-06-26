import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchCustomers, fetchBookingLeads, fetchProspects, upsertEvent, fetchZoomDefaults } from "@/lib/queries";
import { generateEventId } from "@/lib/eventId";
import { useQuery as useRQ } from "@tanstack/react-query";
import { fetchEvents } from "@/lib/queries";
import { toLocalDateKey } from "@/lib/dateOnly";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Calendar, Clock, MapPin, Monitor } from "lucide-react";

const TIME_SLOTS = [
  "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM",
  "4:00 PM", "5:00 PM", "6:00 PM",
  "6:30 PM", "7:00 PM", "7:30 PM",
];

const EVENT_TYPES = ["Party", "Facial", "Guest Event", "Career Chat", "Sharing Appointment", "Pearl Appointment"] as const;

export default function QuickBookingDialog({
  open,
  onOpenChange,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onBooked: () => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [selectedPhone, setSelectedPhone] = useState("");
  const [eventType, setEventType] = useState<string>("Party");
  const [eventDate, setEventDate] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));
  const [eventTime, setEventTime] = useState("6:30 PM");
  const [format_, setFormat_] = useState<"In-Person" | "Virtual">("In-Person");
  const [step, setStep] = useState<"who" | "when">("who");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers, enabled: open });
  const { data: leads = [] } = useQuery({ queryKey: ["booking-leads"], queryFn: fetchBookingLeads, enabled: open });
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects, enabled: open });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents, enabled: open });
  const { data: zoomDefaults } = useQuery({ queryKey: ["zoom-defaults"], queryFn: fetchZoomDefaults, enabled: open });

  const allPeople = useMemo(() => {
    const list: { name: string; phone: string; kind: string }[] = [];
    customers.forEach((c: any) => list.push({ name: c.full_name, phone: c.phone || "", kind: "customer" }));
    leads.forEach((l: any) => list.push({ name: l.name, phone: l.phone || "", kind: "lead" }));
    prospects.forEach((p: any) => list.push({ name: p.name, phone: p.phone || "", kind: "prospect" }));
    return list;
  }, [customers, leads, prospects]);

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return allPeople.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 6);
  }, [allPeople, query]);

  const bookMut = useMutation({
    mutationFn: async () => {
      const timeStr = eventTime.replace(" AM", "").replace(" PM", "");
      const [h, m] = timeStr.split(":").map(Number);
      const hour24 = eventTime.includes("PM") && h !== 12 ? h + 12 : eventTime.includes("AM") && h === 12 ? 0 : h;
      const time24 = `${String(hour24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

      const eventId = generateEventId(eventType, eventDate, selectedName || "Event", events.map((e: any) => e.event_id));
      const payload: any = {
        event_id: eventId,
        event_type: eventType,
        event_format: format_,
        event_date: eventDate,
        event_time: time24,
        hostess_name: selectedName.trim() || null,
        hostess_phone: selectedPhone.trim() || null,
        guest_count: 0,
        event_status: "Booked",
      };
      if (format_ === "Virtual" && zoomDefaults) {
        payload.virtual_platform = "Zoom";
        payload.zoom_id = zoomDefaults.zoom_id || null;
        payload.zoom_password = zoomDefaults.zoom_password || null;
        payload.zoom_link = zoomDefaults.zoom_link || null;
      }
      await upsertEvent(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event-tasks"] });
      toast.success(`${eventType} booked for ${selectedName} on ${format(new Date(eventDate + "T12:00"), "MMM d")} at ${eventTime}! 🎉`);
      onBooked();
      onOpenChange(false);
      reset();
    },
    onError: () => toast.error("Failed to create booking"),
  });

  const reset = () => {
    setQuery(""); setSelectedName(""); setSelectedPhone("");
    setEventType("Party"); setEventDate(format(addDays(new Date(), 7), "yyyy-MM-dd"));
    setEventTime("6:30 PM"); setFormat_("In-Person"); setStep("who");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Quick Booking
          </DialogTitle>
        </DialogHeader>

        {step === "who" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Hostess name</label>
              <Input
                autoFocus
                placeholder="Search or type a name..."
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedName(e.target.value); }}
                className="h-9"
              />
              {matches.length > 0 && (
                <div className="border border-border rounded-lg mt-1 divide-y divide-border/40 max-h-40 overflow-y-auto">
                  {matches.map((p, i) => (
                    <button key={i} className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                      onClick={() => { setSelectedName(p.name); setSelectedPhone(p.phone); setQuery(p.name); }}>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.kind}{p.phone ? ` · ${p.phone}` : ""}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Event type</label>
              <div className="grid grid-cols-2 gap-1.5">
                {EVENT_TYPES.map(t => (
                  <button key={t} type="button"
                    onClick={() => setEventType(t)}
                    className={cn("h-9 rounded-lg border text-xs font-medium transition-colors",
                      eventType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                    )}>{t}</button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setFormat_("In-Person")}
                className={cn("flex-1 h-9 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  format_ === "In-Person" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                <MapPin className="w-3.5 h-3.5" /> In Person
              </button>
              <button type="button" onClick={() => setFormat_("Virtual")}
                className={cn("flex-1 h-9 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  format_ === "Virtual" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                <Monitor className="w-3.5 h-3.5" /> Virtual
              </button>
            </div>

            <Button className="w-full" disabled={!selectedName.trim()} onClick={() => setStep("when")}>
              Next — Pick Date & Time
            </Button>
          </div>
        )}

        {step === "when" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{selectedName}</p>
                <p className="text-xs text-muted-foreground">{eventType} · {format_}</p>
              </div>
              <button className="text-xs text-primary" onClick={() => setStep("who")}>Change</button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Date
              </label>
              <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="h-9" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Time
              </label>
              <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                {TIME_SLOTS.map(t => (
                  <button key={t} type="button"
                    onClick={() => setEventTime(t)}
                    className={cn("h-8 rounded-lg border text-xs font-medium transition-colors",
                      eventTime === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                    )}>{t}</button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("who")} className="flex-1">Back</Button>
              <Button className="flex-1" disabled={bookMut.isPending} onClick={() => bookMut.mutate()}>
                {bookMut.isPending ? "Booking..." : "Book It! 🎉"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
