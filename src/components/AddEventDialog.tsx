import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { upsertEvent, generateEventWorkflowTasks, fetchZoomDefaults } from "@/lib/queries";
import { generateEventId } from "@/lib/eventId";
import { toLocalDateKey } from "@/lib/dateOnly";
import { seedHostessCoaching } from "@/lib/hostessCoaching";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PartyPopper, Sparkles, Share2, Megaphone, MapPin, Monitor } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "Party", label: "Party", icon: PartyPopper },
  { value: "Facial", label: "Facial", icon: Sparkles },
  { value: "Sharing Appointment", label: "Sharing", icon: Share2 },
  { value: "Lead Generating Event", label: "Lead Gen", icon: Megaphone },
] as const;

const LEAD_GEN_SUBTYPES = ["Networking Event", "Vendor Event"] as const;

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingEventIds: string[];
  onCreated?: (eventId: string) => void;
}

export default function AddEventDialog({ open, onOpenChange, existingEventIds, onCreated }: AddEventDialogProps) {
  const queryClient = useQueryClient();
  const { data: zoomDefaults } = useQuery({ queryKey: ["zoom-defaults"], queryFn: fetchZoomDefaults });

  const [eventType, setEventType] = useState<string>("Party");
  const [leadGenSubtype, setLeadGenSubtype] = useState<string>("Networking Event");
  const [eventFormat, setEventFormat] = useState<string>("In-Person");
  const [eventDate, setEventDate] = useState(toLocalDateKey());
  const [hostessName, setHostessName] = useState("");
  const [hostessPhone, setHostessPhone] = useState("");

  const isLeadGen = eventType === "Lead Generating Event";
  const isVirtual = eventFormat === "Virtual";

  const mutation = useMutation({
    mutationFn: async () => {
      const displayType = isLeadGen ? leadGenSubtype : eventType;
      const eventId = generateEventId(eventType, eventDate, hostessName || "Event", existingEventIds);
      const payload: Record<string, any> = {
        event_id: eventId,
        event_type: displayType,
        event_format: eventFormat,
        event_date: eventDate,
        hostess_name: hostessName.trim() || null,
        hostess_phone: hostessPhone.trim() || null,
        guest_count: 0,
      };
      if (isVirtual && zoomDefaults) {
        payload.virtual_platform = "Zoom";
        payload.zoom_id = zoomDefaults.zoom_id || null;
        payload.zoom_password = zoomDefaults.zoom_password || null;
        payload.zoom_link = zoomDefaults.zoom_link || null;
      }
      await upsertEvent(payload as any);
      return eventId;
    },
    onSuccess: async (eventId) => {
      try {
        await generateEventWorkflowTasks(eventId, eventDate || null);
      } catch (e) {
        console.error("Failed to generate workflow tasks", e);
      }
      try {
        await seedHostessCoaching(eventId, hostessName.trim() || null);
      } catch (e) {
        console.error("Failed to seed hostess coaching tasks", e);
      }
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["hostess-coaching-tasks"] });
      toast.success("Event created");
      resetForm();
      onOpenChange(false);
      onCreated?.(eventId);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create event");
    },
  });

  const resetForm = () => {
    setEventType("Party");
    setLeadGenSubtype("Networking Event");
    setEventFormat("In-Person");
    setEventDate(toLocalDateKey());
    setHostessName("");
    setHostessPhone("");
  };

  const canSubmit = eventType && eventDate && (!isLeadGen || leadGenSubtype) && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Event</DialogTitle>
          <DialogDescription>Create a quick event — details can be added later.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Event Type */}
          <div>
            <label className="text-sm font-medium text-foreground">Type *</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {EVENT_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setEventType(t.value)}
                    className={cn(
                      "flex items-center justify-center gap-2 h-10 rounded-lg border-2 text-sm font-medium transition-colors",
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
              <label className="text-sm font-medium text-foreground">Subtype *</label>
              <div className="flex gap-2 mt-1.5">
                {LEAD_GEN_SUBTYPES.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setLeadGenSubtype(sub)}
                    className={cn(
                      "flex-1 h-9 rounded-lg border-2 text-sm font-medium transition-colors",
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

          {/* Format */}
          <div>
            <label className="text-sm font-medium text-foreground">Format</label>
            <div className="flex gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setEventFormat("In-Person")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border-2 text-sm font-medium transition-colors",
                  eventFormat === "In-Person"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <MapPin className="w-4 h-4" />In Person
              </button>
              <button
                type="button"
                onClick={() => setEventFormat("Virtual")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border-2 text-sm font-medium transition-colors",
                  eventFormat === "Virtual"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <Monitor className="w-4 h-4" />Virtual
              </button>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-sm font-medium text-foreground">Date *</label>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-9 mt-1" />
          </div>

          {/* Hostess / Contact */}
          <div>
            <label className="text-sm font-medium text-foreground">
              {eventType === "Sharing Appointment" ? "Contact Name" : "Hostess Name"}
            </label>
            <Input
              placeholder="Optional — can add later"
              value={hostessName}
              onChange={(e) => setHostessName(e.target.value)}
              className="h-9 mt-1"
            />
          </div>

          {/* Hostess Phone */}
          <div>
            <label className="text-sm font-medium text-foreground">
              {eventType === "Sharing Appointment" ? "Contact Phone" : "Hostess Phone"}
            </label>
            <Input
              type="tel"
              placeholder="Optional"
              value={hostessPhone}
              onChange={(e) => setHostessPhone(e.target.value)}
              className="h-9 mt-1"
            />
          </div>

          <Button
            className="w-full h-10"
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creating..." : "Create Event"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
