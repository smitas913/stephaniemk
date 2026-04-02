import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upsertEvent } from "@/lib/queries";
import { generateEventId } from "@/lib/eventId";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PartyPopper, Sparkles } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "Party", label: "Party", icon: PartyPopper },
  { value: "Facial", label: "Facial", icon: Sparkles },
] as const;

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingEventIds: string[];
  onCreated?: (eventId: string) => void;
}

export default function AddEventDialog({ open, onOpenChange, existingEventIds, onCreated }: AddEventDialogProps) {
  const queryClient = useQueryClient();
  const [eventType, setEventType] = useState<string>("Party");
  const [eventDate, setEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [hostessName, setHostessName] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const eventId = generateEventId(eventType, eventDate, hostessName || "Event", existingEventIds);
      await upsertEvent({
        event_id: eventId,
        event_type: eventType,
        event_date: eventDate,
        hostess_name: hostessName || undefined,
        guest_count: 0,
      });
      return eventId;
    },
    onSuccess: (eventId) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
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
    setEventDate(new Date().toISOString().split("T")[0]);
    setHostessName("");
  };

  const canSubmit = eventType && eventDate && !mutation.isPending;

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
            <div className="flex gap-2 mt-1.5">
              {EVENT_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setEventType(t.value)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border-2 text-sm font-medium transition-colors",
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

          {/* Date */}
          <div>
            <label className="text-sm font-medium text-foreground">Date *</label>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-9 mt-1" />
          </div>

          {/* Hostess */}
          <div>
            <label className="text-sm font-medium text-foreground">Hostess Name</label>
            <Input
              placeholder="Optional — can add later"
              value={hostessName}
              onChange={(e) => setHostessName(e.target.value)}
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
