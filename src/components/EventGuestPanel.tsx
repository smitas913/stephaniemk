import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEventGuests, createEventGuest, deleteEventGuest, convertGuestToCustomer, updateEventGuest, createBookingLead } from "@/lib/queries";
import { RSVP_OPTIONS } from "@/lib/types";
import type { EventGuest } from "@/lib/types";
import { formatPhone } from "@/lib/phoneUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, ArrowRightLeft, Plus, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toLocalDateKey } from "@/lib/dateOnly";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  eventId: string;
  eventType?: string;
  isHeld?: boolean;
}

const GUEST_OUTCOMES = [
  { value: "became_customer", label: "Became a customer" },
  { value: "booked_appointment", label: "Booked a party/facial" },
  { value: "booked_career_chat", label: "Booked a career chat" },
];

const NO_SHOW_OPTIONS = [
  { value: "add_to_leads", label: "Add to booking leads" },
  { value: "schedule_followup", label: "Schedule a follow-up" },
  { value: "no_action", label: "No action needed" },
];

export default function EventGuestPanel({ eventId, eventType, isHeld }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [outcomeGuest, setOutcomeGuest] = useState<EventGuest | null>(null);
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>([]);
  const [noShowGuest, setNoShowGuest] = useState<EventGuest | null>(null);
  const [noShowAction, setNoShowAction] = useState("");

  const isGuestEvent = eventType === "Guest Event";

  const { data: guests = [] } = useQuery({
    queryKey: ["event-guests", eventId],
    queryFn: () => fetchEventGuests(eventId),
  });

  // Auto-complete MIT thank you task when all guests checked off
  useEffect(() => {
    if (!isHeld || guests.length === 0) return;
    const allSent = guests.every(g => g.thank_you_sent);
    if (!allSent) return;
    // Find and complete the thank you MIT todo
    const completeThankyouTodo = async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) return;
      const { data: todos } = await supabase
        .from("todos" as any)
        .select("id, text, done")
        .eq("user_id", userId)
        .eq("done", false)
        .ilike("text", "Thank you notes%");
      if (todos && todos.length > 0) {
        await supabase.from("todos" as any).update({ done: true } as any).eq("id", (todos[0] as any).id);
        toast.success("All thank you notes sent! MIT task completed ✅");
      }
    };
    completeThankyouTodo();
  }, [guests, isHeld]);

  const addMutation = useMutation({
    mutationFn: createEventGuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
      setName(""); setPhone(""); setShowForm(false);
      toast.success("Guest added");
    },
    onError: (err: any) => toast.error(err.message || "Failed to add guest"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<EventGuest> }) => updateEventGuest(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEventGuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
      toast.success("Guest removed");
    },
  });

  const convertMutation = useMutation({
    mutationFn: convertGuestToCustomer,
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`${customer.full_name} added as customer`);
      navigate(`/orders/new?customer=${customer.id}`);
    },
    onError: (err: any) => toast.error(err.message || "Failed to convert"),
  });

  const handleAdd = () => {
    if (!name.trim()) return;
    addMutation.mutate({ event_id: eventId, name: name.trim(), phone: phone.trim() || null });
  };

  const handleOutcomeConfirm = async () => {
    if (!outcomeGuest) return;
    // Mark attended
    await updateEventGuest(outcomeGuest.id, { attending: true });
    queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });

    // Handle each outcome
    for (const outcome of selectedOutcomes) {
      if (outcome === "became_customer") {
        convertMutation.mutate(outcomeGuest);
      } else if (outcome === "booked_appointment") {
        navigate(`/events/new?hostess=${encodeURIComponent(outcomeGuest.name)}&phone=${encodeURIComponent(outcomeGuest.phone || "")}&from=/events/${eventId}`);
      } else if (outcome === "booked_career_chat") {
        navigate(`/prospects?prefill=${encodeURIComponent(outcomeGuest.name)}`);
      }
    }
    toast.success(`Outcomes logged for ${outcomeGuest.name}!`);
    setOutcomeGuest(null);
    setSelectedOutcomes([]);
  };

  const handleNoShowConfirm = async () => {
    if (!outcomeGuest) return;
    await updateEventGuest(outcomeGuest.id, { attending: false });
    if (noShowAction === "add_to_leads") {
      await createBookingLead({
        name: outcomeGuest.name,
        phone: outcomeGuest.phone || undefined,
        lead_source: "Party Guest",
        next_follow_up_date: format(addDays(new Date(), 3), "yyyy-MM-dd"),
        status: "New",
      } as any);
      toast.success(`${outcomeGuest.name} added to booking leads`);
    } else if (noShowAction === "schedule_followup") {
      await createBookingLead({
        name: outcomeGuest.name,
        phone: outcomeGuest.phone || undefined,
        lead_source: "Party Guest",
        next_follow_up_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        status: "New",
        notes: "Did not attend event — follow up to reschedule",
      } as any);
      toast.success(`Follow-up scheduled for ${outcomeGuest.name}`);
    } else {
      toast.success(`${outcomeGuest.name} marked as did not attend`);
    }
    queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
    queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
    setNoShowGuest(null);
    setNoShowAction("");
    setOutcomeGuest(null);
  };

  const rsvpYes = guests.filter((g) => g.rsvp === "Yes").length;
  const attendingCount = guests.filter((g) => g.attending).length;
  const orderedCount = guests.filter((g) => g.ordered).length;
  const contactedCount = guests.filter((g: any) => g.task_invite_sent && g.task_day_before_sent).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Guests ({guests.length})
          </p>
          {guests.length > 0 && (
            <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground items-center">
              <span>RSVP: {rsvpYes}</span>
              <span>·</span>
              <span>Attended: {attendingCount}</span>
              <span>·</span>
              <span>Ordered: {orderedCount}</span>
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                Tasks: {contactedCount}/{guests.length} contacted
              </span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3 mr-1" />Add Guest
        </Button>
      </div>

      {showForm && (
        <div className="flex gap-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)}
            className="h-7 text-xs flex-1" autoFocus onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="h-7 text-xs w-32" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={addMutation.isPending}>Add</Button>
        </div>
      )}

      {guests.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground py-2">No guests tracked yet</p>
      ) : guests.length > 0 && (
        isGuestEvent && isHeld ? (
          // Guest Event post-event view — smart outcome per guest
          <div className="space-y-2">
            {guests.map((g) => (
              <div key={g.id} className={cn(
                "flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
                g.attending === true ? "border-green-200 bg-green-50/50" :
                g.attending === false ? "border-border bg-muted/30" :
                "border-border"
              )}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{g.name}</p>
                  {g.phone && <p className="text-[11px] text-muted-foreground">{formatPhone(g.phone)}</p>}
                  {g.converted_customer_id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Customer ✓</span>
                  )}
                </div>
                {g.attending === null || g.attending === undefined ? (
                  // Not yet marked
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => { setOutcomeGuest(g); setSelectedOutcomes([]); }}>
                      ✅ Attended
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => { setOutcomeGuest(g); setNoShowGuest(g); }}>
                      ❌ No Show
                    </Button>
                  </div>
                ) : g.attending ? (
                  <>
                    <span className="text-xs text-green-600 font-medium">Attended ✅</span>
                    <label className="flex items-center gap-1 cursor-pointer ml-1">
                      <Checkbox
                        checked={g.thank_you_sent || false}
                        onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { thank_you_sent: !!v } as any })}
                      />
                      <span className="text-[11px] text-muted-foreground">✉️ TY sent</span>
                    </label>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Did not attend</span>
                )}
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => deleteMutation.mutate(g.id)}>
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          // Standard table view for non-Guest Events or non-held events
          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[10px]">Name</TableHead>
                  <TableHead className="text-[10px]">Phone</TableHead>
                  <TableHead className="text-[10px] w-20">RSVP</TableHead>
                  <TableHead className="text-[10px] text-center w-16">Attended</TableHead>
                  <TableHead className="text-[10px] text-center w-16">Ordered</TableHead>
                  <TableHead className="text-[10px] text-center w-16">Booked</TableHead>
                  <TableHead className="text-[10px] text-center w-16">Interested</TableHead>
                  {isHeld && <TableHead className="text-[10px] text-center w-16">✉️ TY</TableHead>}
                  <TableHead className="text-[10px] text-center w-24" title="Invite sent / Day-before text sent">Tasks</TableHead>
                  <TableHead className="text-[10px] w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((g) => (
                  <TableRow key={g.id} className="group">
                    <TableCell className="text-xs font-medium py-1.5">
                      <div className="flex items-center gap-1.5">
                        {g.name}
                        {g.converted_customer_id && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-accent text-accent-foreground font-medium">Customer</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground py-1.5">{formatPhone(g.phone)}</TableCell>
                    <TableCell className="py-1.5">
                      <Select value={g.rsvp || "Maybe"} onValueChange={(v) => updateMutation.mutate({ id: g.id, updates: { rsvp: v } })}>
                        <SelectTrigger className="h-6 text-[10px] w-16"><SelectValue /></SelectTrigger>
                        <SelectContent>{RSVP_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <Checkbox checked={g.attending} onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { attending: !!v } })} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <Checkbox checked={g.ordered} onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { ordered: !!v } })} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <Checkbox checked={(g as any).booked || false} onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { booked: !!v } as any })} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <Checkbox checked={g.interested} onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { interested: !!v } })} />
                    </TableCell>
                    {isHeld && (
                      <TableCell className="text-center py-1.5">
                        <Checkbox
                          checked={g.thank_you_sent || false}
                          onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { thank_you_sent: !!v } as any })}
                          className={g.thank_you_sent ? "text-green-600" : ""}
                        />
                      </TableCell>
                    )}
                    <TableCell className="py-1.5">
                      <div className="flex items-center justify-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer" title="Invite sent">
                          <Checkbox
                            checked={(g as any).task_invite_sent || false}
                            onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { task_invite_sent: !!v } as any })}
                          />
                          <span className="text-[10px]">📨</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer" title="Day-before text sent">
                          <Checkbox
                            checked={(g as any).task_day_before_sent || false}
                            onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { task_day_before_sent: !!v } as any })}
                          />
                          <span className="text-[10px]">🎉</span>
                        </label>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!g.converted_customer_id && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Convert to customer"
                            onClick={() => convertMutation.mutate(g)} disabled={convertMutation.isPending}>
                            <ArrowRightLeft className="w-3 h-3 text-primary" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Remove"
                          onClick={() => deleteMutation.mutate(g.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* Attended — Outcome Dialog */}
      <Dialog open={!!outcomeGuest && !noShowGuest} onOpenChange={(o) => { if (!o) { setOutcomeGuest(null); setSelectedOutcomes([]); }}}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">What happened with {outcomeGuest?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Select all that apply</p>
          <div className="space-y-2">
            {GUEST_OUTCOMES.map(o => (
              <label key={o.value} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                <Checkbox
                  checked={selectedOutcomes.includes(o.value)}
                  onCheckedChange={(v) => {
                    setSelectedOutcomes(prev => v ? [...prev, o.value] : prev.filter(x => x !== o.value));
                  }}
                />
                <span className="text-sm font-medium text-foreground">{o.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => { setOutcomeGuest(null); setSelectedOutcomes([]); }}>Cancel</Button>
            <Button className="flex-1" onClick={handleOutcomeConfirm}>
              {selectedOutcomes.length === 0 ? "Mark Attended Only" : "Save & Continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Did Not Attend Dialog */}
      <Dialog open={!!noShowGuest} onOpenChange={(o) => { if (!o) { setNoShowGuest(null); setNoShowAction(""); setOutcomeGuest(null); }}}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">What's next for {noShowGuest?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">They didn't make it — what should happen next?</p>
          <div className="space-y-2">
            {NO_SHOW_OPTIONS.map(o => (
              <button key={o.value} type="button"
                onClick={() => setNoShowAction(o.value)}
                className={cn("w-full text-left p-2.5 rounded-lg border text-sm font-medium transition-colors",
                  noShowAction === o.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50"
                )}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => { setNoShowGuest(null); setNoShowAction(""); setOutcomeGuest(null); }}>Cancel</Button>
            <Button className="flex-1" disabled={!noShowAction} onClick={handleNoShowConfirm}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
