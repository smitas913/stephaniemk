import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEventGuests, createEventGuest, deleteEventGuest, updateEventGuest, createBookingLead, fetchOrders } from "@/lib/queries";
import { RSVP_OPTIONS } from "@/lib/types";
import type { EventGuest } from "@/lib/types";
import { formatPhone } from "@/lib/phoneUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  eventId: string;
  eventType?: string;
  isHeld?: boolean;
  eventDate?: string | null;
  hostessName?: string | null;
}

type GuestSuggestion = {
  kind: "customer" | "consultant";
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

// Outcomes are multi-select per guest. Each maps to its own DB field so multiple can be true.
type OutcomeKey = "tried" | "ordered" | "booked" | "career" | "joined" | "noshow";

function getActiveOutcomes(g: EventGuest): Set<OutcomeKey> {
  const set = new Set<OutcomeKey>();
  if (g.attending === true) set.add("tried");
  if (g.attending === false) set.add("noshow");
  if (g.ordered) set.add("ordered");
  if ((g as any).booked) set.add("booked");
  if (g.interested) set.add("career");
  if ((g as any).converted_consultant_id) set.add("joined");
  return set;
}

const OUTCOME_OPTIONS: { key: OutcomeKey; label: string }[] = [
  { key: "tried",   label: "Tried Product" },
  { key: "ordered", label: "Ordered" },
  { key: "booked",  label: "Booked Next Event" },
  { key: "career",  label: "Career Interest" },
  { key: "joined",  label: "She Joined" },
  { key: "noshow",  label: "No Show" },
];

export default function EventGuestPanel({ eventId, isHeld, hostessName }: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [linkedConsultantId, setLinkedConsultantId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);

  // Inline sub-forms for outcomes that need a little extra info
  const [joinForm, setJoinForm] = useState<{ guestId: string; name: string; phone: string } | null>(null);
  const [noShowFollowUp, setNoShowFollowUp] = useState<string | null>(null); // guest id

  // Autocomplete: search customers + consultants by name
  useEffect(() => {
    const q = name.trim();
    if (!showForm || q.length < 2) { setSuggestions([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const [{ data: cust }, { data: cons }] = await Promise.all([
        supabase.from("customers").select("id, full_name, phone, email").ilike("full_name", `%${q}%`).limit(6),
        supabase.from("team_consultants").select("id, name, phone, email").ilike("name", `%${q}%`).limit(4),
      ]);
      if (cancelled) return;
      const items: GuestSuggestion[] = [
        ...(cust || []).map((c: any) => ({ kind: "customer" as const, id: c.id, name: c.full_name, phone: c.phone, email: c.email })),
        ...(cons || []).map((c: any) => ({ kind: "consultant" as const, id: c.id, name: c.name, phone: c.phone, email: c.email })),
      ];
      setSuggestions(items);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [name, showForm]);

  const { data: guestsRaw = [] } = useQuery({
    queryKey: ["event-guests", eventId],
    queryFn: () => fetchEventGuests(eventId),
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: () => fetchOrders(),
  });

  const RSVP_SORT_ORDER: Record<string, number> = { Yes: 0, Maybe: 1, Invited: 2, No: 3 };
  const guests = useMemo(() => {
    return [...guestsRaw]
      .map((g, i) => ({ g, i }))
      .sort((a, b) => {
        const ra = RSVP_SORT_ORDER[a.g.rsvp ?? "Invited"] ?? 99;
        const rb = RSVP_SORT_ORDER[b.g.rsvp ?? "Invited"] ?? 99;
        if (ra !== rb) return ra - rb;
        return a.i - b.i;
      })
      .map((x) => x.g);
  }, [guestsRaw]);

  const addMutation = useMutation({
    mutationFn: createEventGuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
      setName(""); setPhone(""); setLinkedCustomerId(null); setLinkedConsultantId(null); setSuggestions([]); setShowForm(false);
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

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const duplicate = guests.find((g) => {
      if (linkedCustomerId && g.converted_customer_id === linkedCustomerId) return true;
      if (linkedConsultantId && (g as any).consultant_id === linkedConsultantId) return true;
      if (!linkedCustomerId && !linkedConsultantId && g.name?.trim().toLowerCase() === trimmedName.toLowerCase()) return true;
      return false;
    });
    if (duplicate) {
      toast.warning(`${duplicate.name} is already on the guest list.`);
      return;
    }
    addMutation.mutate({
      event_id: eventId,
      name: trimmedName,
      phone: phone.trim() || null,
      rsvp: "Invited",
      converted_customer_id: linkedCustomerId,
      consultant_id: linkedConsultantId,
    });
  };

  const handleSelectSuggestion = (s: GuestSuggestion) => {
    setName(s.name);
    if (s.phone) setPhone(s.phone);
    setLinkedCustomerId(s.kind === "customer" ? s.id : null);
    setLinkedConsultantId(s.kind === "consultant" ? s.id : null);
    setSuggestions([]);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setLinkedCustomerId(null);
    setLinkedConsultantId(null);
    const match = suggestions.find((s) => s.name.toLowerCase() === value.trim().toLowerCase());
    if (match) handleSelectSuggestion(match);
  };

  const applyOutcome = async (g: EventGuest, outcome: Exclude<OutcomeKey, null>) => {
    // Map outcome to the canonical boolean flags. One outcome per guest, so we reset the others.
    const base: any = {
      attending: outcome !== "noshow",
      ordered:   outcome === "ordered",
      booked:    outcome === "booked",
      interested: outcome === "career",
    };

    if (outcome === "career") {
      try {
        const noteHost = hostessName?.trim() || "the party";
        await createBookingLead({
          name: g.name,
          phone: g.phone || undefined,
          lead_source: "Other",
          source_detail: "Party Guest",
          status: "New Contact",
          notes: `Career interest from ${noteHost}'s party`,
        } as any);
      } catch (e: any) {
        toast.error(e.message || "Could not create prospect");
      }
    }

    if (outcome === "joined") {
      // Open inline form; finalize on submit
      setJoinForm({ guestId: g.id, name: g.name, phone: g.phone || "" });
    }

    if (outcome === "noshow") {
      setNoShowFollowUp(g.id);
    } else {
      setNoShowFollowUp((prev) => (prev === g.id ? null : prev));
    }

    await updateMutation.mutateAsync({ id: g.id, updates: base });

    if (outcome === "ordered") toast.success(`${g.name} marked Ordered`);
    if (outcome === "booked")  toast.success(`${g.name} marked Booked Next`);
    if (outcome === "career")  toast.success(`${g.name} added to booking leads`);
    if (outcome === "tried")   toast.success(`${g.name} marked Tried Product`);
  };

  const finalizeJoin = async () => {
    if (!joinForm) return;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const trimmedName = joinForm.name.trim();
    if (!trimmedName) { toast.error("Name required"); return; }
    const { error } = await supabase.from("team_consultants").insert({
      name: trimmedName,
      phone: joinForm.phone.trim() || null,
      status: "Active",
      join_date: new Date().toISOString().slice(0, 10),
      relationship_type: "Personal Recruit",
      owner_user_id: userId,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`${trimmedName} added to your team!`);
    setJoinForm(null);
    queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
  };

  const saveNoShowAsLead = async (g: EventGuest) => {
    try {
      const noteHost = hostessName?.trim() || "the party";
      await createBookingLead({
        name: g.name,
        phone: g.phone || undefined,
        lead_source: "Other",
        source_detail: "Party Guest",
        status: "New Contact",
        notes: `No-show from ${noteHost}'s party — follow up to reschedule`,
      } as any);
      toast.success(`${g.name} added to booking leads`);
      setNoShowFollowUp(null);
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    }
  };

  // ── Live stats: Faces / Sales / Bookings
  const facesCount = guests.filter((g) => g.attending === true).length;
  const bookingsCount = guests.filter((g: any) => g.booked).length;
  const salesTotal = useMemo(() => {
    const linked = (allOrders as any[]).filter((o) => o.event_id === eventId || o.parent_event_id === eventId);
    return linked.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
  }, [allOrders, eventId]);

  const rsvpYes = guests.filter((g) => g.rsvp === "Yes").length;

  return (
    <div className="space-y-3">
      {/* Stat chips — Faces / Sales / Bookings */}
      <div className="flex flex-wrap gap-2">
        <div className="px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-xs">
          <span className="font-semibold">{facesCount}</span> Faces
        </div>
        <div className="px-3 py-1.5 rounded-md bg-green-50 text-green-700 text-xs">
          <span className="font-semibold">${salesTotal.toFixed(0)}</span> Sales
        </div>
        <div className="px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 text-xs">
          <span className="font-semibold">{bookingsCount}</span> Bookings
        </div>
        {guests.length > 0 && (
          <div className="px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-xs ml-auto">
            {guests.length} guest{guests.length === 1 ? "" : "s"} · RSVP Yes: {rsvpYes}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {isHeld ? "Guest outcomes" : "Guest list"}
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3 mr-1" />Add Guest
        </Button>
      </div>

      {showForm && (
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              placeholder="Name (type to search)"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-50 mt-1 left-0 right-0 max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-md">
                {suggestions.map((s) => (
                  <li key={`${s.kind}-${s.id}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground ml-2">
                        {s.kind} · {s.phone ? formatPhone(s.phone) : s.email || "No contact"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="h-8 text-xs w-36" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={addMutation.isPending}>Add</Button>
        </div>
      )}

      {guests.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground py-2">No guests tracked yet</p>
      ) : guests.length > 0 && (
        isHeld ? (
          // ── POST-EVENT: simple list with inline outcome buttons ──
          <div className="space-y-2">
            {guests.map((g) => {
              const outcome = getOutcome(g);
              return (
                <div key={g.id} className={cn(
                  "rounded-lg border transition-colors p-2.5",
                  outcome === "noshow" ? "border-border bg-muted/30" :
                  outcome ? "border-green-200 bg-green-50/40" :
                  "border-border"
                )}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{g.name}</p>
                        {outcome && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", outcomeBadgeClass(outcome))}>
                            {outcomeLabel(outcome)}
                          </span>
                        )}
                      </div>
                      {g.phone && <p className="text-[11px] text-muted-foreground">{formatPhone(g.phone)}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                      onClick={() => deleteMutation.mutate(g.id)} aria-label="Remove">
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>

                  {/* Outcome selector */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {OUTCOME_OPTIONS.map((opt) => {
                      const active = outcome === opt.key;
                      return (
                        <Button
                          key={opt.key}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className={cn("h-7 text-[11px] px-2", active && "ring-2 ring-primary/30")}
                          onClick={() => applyOutcome(g, opt.key)}
                        >
                          {opt.label}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Inline join form */}
                  {joinForm && joinForm.guestId === g.id && (
                    <div className="mt-2 p-2 rounded-md border border-pink-200 bg-pink-50/50 space-y-2">
                      <p className="text-xs font-medium text-pink-700">Add to your team</p>
                      <div className="flex gap-2">
                        <Input
                          value={joinForm.name}
                          onChange={(e) => setJoinForm({ ...joinForm, name: e.target.value })}
                          placeholder="Name"
                          className="h-8 text-xs"
                        />
                        <Input
                          value={joinForm.phone}
                          onChange={(e) => setJoinForm({ ...joinForm, phone: e.target.value })}
                          placeholder="Phone"
                          className="h-8 text-xs w-36"
                        />
                        <Button size="sm" className="h-8 text-xs" onClick={finalizeJoin}>Add</Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setJoinForm(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {/* No-show follow-up CTA */}
                  {noShowFollowUp === g.id && outcome === "noshow" && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">Save her to booking leads for follow-up?</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveNoShowAsLead(g)}>
                        Save to Booking Leads
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNoShowFollowUp(null)}>
                        Skip
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // ── PRE-EVENT: minimal table (Name / Phone / RSVP only) ──
          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[10px]">Name</TableHead>
                  <TableHead className="text-[10px]">Phone</TableHead>
                  <TableHead className="text-[10px] w-24">RSVP</TableHead>
                  <TableHead className="text-[10px] w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((g) => (
                  <TableRow key={g.id} className="group">
                    <TableCell className="text-xs font-medium py-1.5">{g.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-1.5">{formatPhone(g.phone)}</TableCell>
                    <TableCell className="py-1.5">
                      <Select
                        value={g.rsvp || "Invited"}
                        onValueChange={(v) => updateMutation.mutate({ id: g.id, updates: { rsvp: v } })}
                      >
                        <SelectTrigger className={cn(
                          "h-7 text-[11px] w-24",
                          (g.rsvp || "Invited") === "Invited" && "bg-muted text-muted-foreground border-muted"
                        )}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RSVP_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteMutation.mutate(g.id)} aria-label="Remove">
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  );
}
