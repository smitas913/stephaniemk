import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchEventGuests, createEventGuest, deleteEventGuest, updateEventGuest, createBookingLead, fetchOrders } from "@/lib/queries";
import type { EventGuest } from "@/lib/types";
import { formatPhone } from "@/lib/phoneUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";


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
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [linkedConsultantId, setLinkedConsultantId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);

  // Inline sub-forms for outcomes that need a little extra info
  const [joinForm, setJoinForm] = useState<{ guestId: string; name: string; phone: string } | null>(null);
  const [noShowFollowUp, setNoShowFollowUp] = useState<string | null>(null); // guest id
  const [bookForm, setBookForm] = useState<{ guestId: string; name: string; phone: string; search: string; selectedEventId: string | null } | null>(null);

  // Upcoming events for the "Booked Next Event" linking panel
  const { data: upcomingEvents = [] } = useQuery({
    queryKey: ["upcoming-events-for-booking"],
    enabled: !!bookForm,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("events")
        .select("id, event_id, event_date, hostess_name")
        .gte("event_date", today)
        .neq("event_id", eventId)
        .order("event_date", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as Array<{ id: string; event_id: string; event_date: string | null; hostess_name: string | null }>;
    },
  });



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
      rsvp: "Yes",
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

  const toggleOutcome = async (g: EventGuest, outcome: OutcomeKey) => {
    const active = getActiveOutcomes(g);
    const willBeOn = !active.has(outcome);
    const updates: any = {};

    switch (outcome) {
      case "tried":
        // tried & noshow share `attending` — they're mutex
        updates.attending = willBeOn ? true : null;
        break;
      case "noshow":
        updates.attending = willBeOn ? false : null;
        if (willBeOn) setNoShowFollowUp(g.id);
        else setNoShowFollowUp((prev) => (prev === g.id ? null : prev));
        break;
      case "ordered":
        updates.ordered = willBeOn;
        break;
      case "booked":
        updates.booked = willBeOn;
        if (willBeOn) {
          setBookForm({ guestId: g.id, name: g.name, phone: g.phone || "", search: "", selectedEventId: null });
        } else {
          setBookForm((prev) => (prev && prev.guestId === g.id ? null : prev));
        }
        break;
      case "career":
        updates.interested = willBeOn;
        if (willBeOn) {
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
        break;
      case "joined":
        if (willBeOn) {
          setJoinForm({ guestId: g.id, name: g.name, phone: g.phone || "" });
          return; // persistence happens in finalizeJoin
        } else {
          updates.converted_consultant_id = null;
        }
        break;
    }

    await updateMutation.mutateAsync({ id: g.id, updates });

    if (willBeOn) {
      if (outcome === "ordered") toast.success(`${g.name} marked Ordered`);
      if (outcome === "booked")  toast.success(`${g.name} marked Booked Next`);
      if (outcome === "career")  toast.success(`${g.name} added to booking leads`);
      if (outcome === "tried")   toast.success(`${g.name} marked Tried Product`);
    }
  };

  const finalizeJoin = async () => {
    if (!joinForm) return;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const trimmedName = joinForm.name.trim();
    if (!trimmedName) { toast.error("Name required"); return; }
    const { data: inserted, error } = await supabase.from("team_consultants").insert({
      name: trimmedName,
      phone: joinForm.phone.trim() || null,
      status: "Active",
      join_date: new Date().toISOString().slice(0, 10),
      relationship_type: "Personal Recruit",
      owner_user_id: userId,
    } as any).select("id").single();
    if (error) { toast.error(error.message); return; }
    if (inserted?.id) {
      await updateMutation.mutateAsync({ id: joinForm.guestId, updates: { converted_consultant_id: inserted.id } as any });
    }
    toast.success(`${trimmedName} added to your team!`);
    setJoinForm(null);
    queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
  };

  const linkBookingToEvent = async () => {
    if (!bookForm || !bookForm.selectedEventId) return;
    const { error } = await supabase
      .from("events")
      .update({ hostess_name: bookForm.name, hostess_phone: bookForm.phone || null } as any)
      .eq("id", bookForm.selectedEventId);
    if (error) { toast.error(error.message); return; }
    toast.success(`${bookForm.name} linked as hostess`);
    queryClient.invalidateQueries({ queryKey: ["events"] });
    setBookForm(null);
  };

  const createEventForBooking = () => {
    if (!bookForm) return;
    const params = new URLSearchParams({ type: "Party", hostess: bookForm.name });
    if (bookForm.phone) params.set("phone", bookForm.phone);
    setBookForm(null);
    navigate(`/events/new?${params.toString()}`);
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

  const partyRescheduled = guests.some((g: any) => g.party_rescheduled);
  const togglePartyRescheduled = async () => {
    const newVal = !partyRescheduled;
    try {
      await Promise.all(
        guests.map((g) => updateMutation.mutateAsync({ id: g.id, updates: { party_rescheduled: newVal } as any }))
      );
      toast.success(newVal ? "Party marked rescheduled/cancelled for all guests" : "Cleared party rescheduled status");
    } catch (e: any) {
      toast.error(e.message || "Could not update");
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
              const active = getActiveOutcomes(g);
              const isNoShow = active.has("noshow");
              const isRescheduled = !!(g as any).party_rescheduled;
              const hasPositive = active.size > 0 && !(active.size === 1 && isNoShow);
              return (
                <div key={g.id} className={cn(
                  "rounded-lg border transition-colors p-2.5",
                  isRescheduled ? "border-amber-300 bg-amber-50/60" :
                  isNoShow && !hasPositive ? "border-border bg-muted/30" :
                  hasPositive ? "border-green-200 bg-green-50/40" :
                  "border-border"
                )}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{g.name}</p>
                        {isRescheduled && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            Party Rescheduled/Cancelled
                          </span>
                        )}
                      </div>
                      {g.phone && <p className="text-[11px] text-muted-foreground">{formatPhone(g.phone)}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => updateMutation.mutate({ id: g.id, updates: { thank_you_sent: !g.thank_you_sent } as any })}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0",
                        g.thank_you_sent
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-muted text-muted-foreground border-border hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                      )}
                    >
                      {g.thank_you_sent ? "TY ✓" : "TY Note"}
                    </button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                      onClick={() => deleteMutation.mutate(g.id)} aria-label="Remove">
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>

                  {/* Outcome multi-select */}
                  {!isRescheduled && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {OUTCOME_OPTIONS.map((opt) => {
                        const isActive = active.has(opt.key);
                        return (
                          <Button
                            key={opt.key}
                            type="button"
                            size="sm"
                            variant={isActive ? "default" : "outline"}
                            className={cn("h-7 text-[11px] px-2", isActive && "ring-2 ring-primary/30")}
                            onClick={() => toggleOutcome(g, opt.key)}
                          >
                            {isActive ? `${opt.label} ✓` : opt.label}
                          </Button>
                        );
                      })}
                    </div>
                  )}


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
                  {noShowFollowUp === g.id && isNoShow && (
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

            {/* Event-level: Party Rescheduled/Cancelled (applies to all guests) */}
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full h-9 text-xs mt-2 border-amber-300",
                partyRescheduled
                  ? "bg-amber-100 text-amber-900 hover:bg-amber-100 ring-2 ring-amber-300"
                  : "text-amber-800 hover:bg-amber-50"
              )}
              onClick={togglePartyRescheduled}
            >
              {partyRescheduled ? "Party Rescheduled/Cancelled ✓ (click to clear)" : "Mark Party Rescheduled/Cancelled (all guests)"}
            </Button>
          </div>
        ) : (
          // ── PRE-EVENT: simple list with Confirmed badge ──
          <div className="space-y-1.5">
            {guests.map((g) => (
              <div key={g.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                  {g.phone && <p className="text-[11px] text-muted-foreground">{formatPhone(g.phone)}</p>}
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                  Confirmed
                </span>
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ id: g.id, updates: { thank_you_sent: !g.thank_you_sent } as any })}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0",
                    g.thank_you_sent
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-muted text-muted-foreground border-border hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                  )}
                >
                  {g.thank_you_sent ? "TY ✓" : "TY Note"}
                </button>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMutation.mutate(g.id)} aria-label="Remove">
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
