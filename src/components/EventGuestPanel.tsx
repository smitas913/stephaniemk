import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchEventGuests, createEventGuest, deleteEventGuest, updateEventGuest, fetchOrders, createCustomer, fetchTeamConsultants } from "@/lib/queries";
import { SKIN_TYPES } from "@/lib/types";
import type { EventGuest } from "@/lib/types";
import { formatPhone } from "@/lib/phoneUtils";
import { useCameraCapture } from "@/lib/scanCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, UserPlus, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { checkForDuplicatePerson, type DuplicateMatch, fillEmptyFieldsFromNew } from "@/lib/duplicateCheck";
import DuplicateGuardDialog from "@/components/DuplicateGuardDialog";
import ScanCardDialog, { type ScanCardSeed } from "@/components/ScanCardDialog";


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
  { key: "booked",  label: "Booked New Appointment" },
  { key: "career",  label: "Booked Career Chat" },
  { key: "joined",  label: "She Joined" },
  { key: "noshow",  label: "No Show" },
];


function GuestSkinTypeSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger className="h-6 text-[11px] w-40 mt-1"><SelectValue placeholder="Skin type" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Skin type not set</SelectItem>
        {SKIN_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function GuestAllergiesButton({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const has = !!(value && value.trim());
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(value || ""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0 max-w-[120px] truncate",
            has
              ? "bg-amber-100 text-amber-800 border-amber-300"
              : "bg-muted text-muted-foreground border-border hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
          )}
          title={has ? (value as string) : "Add allergies note"}
        >
          {has ? "Allergies ⚠" : "Allergies"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2 space-y-2">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. nuts, fragrance"
          className="h-7 text-[11px]"
          onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft.trim() || null); setOpen(false); } }}
        />
        <div className="flex gap-1.5">
          <Button size="sm" className="h-6 px-2 text-[10px] flex-1"
            onClick={() => { onSave(draft.trim() || null); setOpen(false); }}>Save</Button>
          {has && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
              onClick={() => { onSave(null); setOpen(false); }}>Clear</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}




export default function EventGuestPanel({ eventId, isHeld, hostessName }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [skinType, setSkinType] = useState("");
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);
  const [linkedConsultantId, setLinkedConsultantId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);

  // Inline sub-forms for outcomes that need a little extra info
  const [joinForm, setJoinForm] = useState<{ guestId: string; name: string; phone: string; email: string } | null>(null);
  const [noShowFollowUp, setNoShowFollowUp] = useState<string | null>(null); // guest id
  const [bookForm, setBookForm] = useState<{ guestId: string; name: string; phone: string; search: string; selectedEventId: string | null } | null>(null);
  const [careerForm, setCareerForm] = useState<{ guestId: string; name: string; phone: string } | null>(null);

  // Duplicate guard for finalizeJoin (consultant insert)
  const [joinDupCheck, setJoinDupCheck] = useState<{ strong: DuplicateMatch | null; softName: DuplicateMatch | null } | null>(null);
  const [joinInsertPending, setJoinInsertPending] = useState(false);

  // Per-guest "Scan Card" flow (event is already known, so the picker is skipped)
  const [scanSeed, setScanSeed] = useState<ScanCardSeed | null>(null);

  // Guest → customer conversion prompt when marking Ordered
  const [convertGuestPrompt, setConvertGuestPrompt] = useState<{ guest: EventGuest; assign: string } | null>(null);
  const [convertGuestDup, setConvertGuestDup] = useState<{ strong: DuplicateMatch | null; softName: DuplicateMatch | null } | null>(null);

  const { data: allConsultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });



  // Upcoming events for the "Booked Next Event" linking panel
  const { data: upcomingEvents = [] } = useQuery({
    queryKey: ["upcoming-events-for-booking"],
    enabled: !!bookForm,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, event_id, event_date, hostess_name, event_type")
        .neq("event_id", eventId)
        .order("event_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Array<{ id: string; event_id: string; event_date: string | null; hostess_name: string | null; event_type: string | null }>;

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

  const guests = useMemo(() => {
    const firstToken = (n: string) => (n ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    return [...guestsRaw].sort((a, b) => {
      const fa = firstToken(a.name);
      const fb = firstToken(b.name);
      if (fa !== fb) return fa.localeCompare(fb);
      return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    });
  }, [guestsRaw]);

  const addMutation = useMutation({
    mutationFn: createEventGuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
      setName(""); setPhone(""); setEmail(""); setSkinType(""); setLinkedCustomerId(null); setLinkedConsultantId(null); setSuggestions([]); setShowForm(false);
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
    if (hostessName?.trim().toLowerCase() === trimmedName.toLowerCase()) {
      toast.error("That's the event name, not a guest — add the actual guest's name.");
      return;
    }
    addMutation.mutate({
      event_id: eventId,
      name: trimmedName,
      phone: phone.trim() || null,
      email: email.trim() || null,
      skin_type: skinType.trim() || null,
      rsvp: "Yes",
      converted_customer_id: linkedCustomerId,
      consultant_id: linkedConsultantId,
    });
  };

  const handleSelectSuggestion = (s: GuestSuggestion) => {
    setName(s.name);
    if (s.phone) setPhone(s.phone);
    if (s.email) setEmail(s.email);
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
        // On enable: if guest has no linked customer yet, prompt to convert to a customer
        if (willBeOn && !g.converted_customer_id) {
          setConvertGuestPrompt({ guest: g, assign: "__me__" });
        }
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
          setCareerForm({ guestId: g.id, name: g.name, phone: g.phone || "" });
        } else {
          setCareerForm((prev) => (prev && prev.guestId === g.id ? null : prev));
        }
        break;
      case "joined":
        if (willBeOn) {
          setJoinForm({ guestId: g.id, name: g.name, phone: g.phone || "", email: g.email || "" });
          return; // persistence happens in finalizeJoin
        } else {
          updates.converted_consultant_id = null;
        }
        break;
    }

    await updateMutation.mutateAsync({ id: g.id, updates });

    if (willBeOn) {
      if (outcome === "ordered") toast.success(`${g.name} marked Ordered`);
      if (outcome === "booked")  toast.success(`${g.name} marked Booked New Appointment`);
      if (outcome === "career")  toast.success(`${g.name} marked Booked Career Chat`);
      if (outcome === "tried")   toast.success(`${g.name} marked Tried Product`);
    }

  };

  const finalizeJoin = async () => {
    if (!joinForm) return;
    const trimmedName = joinForm.name.trim();
    if (!trimmedName) { toast.error("Name required"); return; }
    // Duplicate guard — check before insert
    const dup = await checkForDuplicatePerson({
      fullName: trimmedName,
      phone: joinForm.phone,
      kind: "consultant",
    });
    if (dup.strong || dup.softName) {
      setJoinDupCheck(dup);
      return; // wait for user's dialog choice
    }
    await performJoinInsert();
  };

  const performJoinInsert = async (linkExistingConsultantId?: string) => {
    if (!joinForm) return;
    setJoinInsertPending(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const trimmedName = joinForm.name.trim();
      let consultantId = linkExistingConsultantId;
      if (!consultantId) {
        const { data: inserted, error } = await supabase.from("team_consultants").insert({
          name: trimmedName,
          phone: joinForm.phone.trim() || null,
          email: joinForm.email.trim() || null,
          status: "Active",
          join_date: new Date().toISOString().slice(0, 10),
          relationship_type: "Personal Recruit",
          owner_user_id: userId,
        } as any).select("id").single();
        if (error) { toast.error(error.message); return; }
        consultantId = inserted?.id;
      }
      if (consultantId) {
        await updateMutation.mutateAsync({ id: joinForm.guestId, updates: { converted_consultant_id: consultantId } as any });
      }
      toast.success(linkExistingConsultantId ? `Linked to existing consultant` : `${trimmedName} added to your team!`);
      setJoinForm(null);
      setJoinDupCheck(null);
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
    } finally {
      setJoinInsertPending(false);
    }
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

  const addBookingToGuestList = async () => {
    if (!bookForm || !bookForm.selectedEventId) return;
    const selected = upcomingEvents.find((e) => e.id === bookForm.selectedEventId);
    if (!selected) return;
    try {
      await createEventGuest({
        event_id: selected.event_id,
        name: bookForm.name,
        phone: bookForm.phone || null,
        rsvp: "Yes",
      } as any);
      toast.success(`${bookForm.name} added to guest list`);
      queryClient.invalidateQueries({ queryKey: ["event-guests", selected.event_id] });
      setBookForm(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add guest");
    }
  };


  const createEventForBooking = () => {
    if (!bookForm) return;
    const params = new URLSearchParams({ type: "Party", hostess: bookForm.name, addGuest: "true", guestName: bookForm.name });
    if (bookForm.phone) {
      params.set("phone", bookForm.phone);
      params.set("guestPhone", bookForm.phone);
    }
    setBookForm(null);
    navigate(`/events/new?${params.toString()}`);
  };

  const createSharingAppointment = () => {
    if (!careerForm) return;
    const params = new URLSearchParams({ type: "Sharing Appointment", hostess: careerForm.name });
    if (careerForm.phone) params.set("phone", careerForm.phone);
    setCareerForm(null);
    navigate(`/events/new?${params.toString()}`);
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

  // ── Live stats: Faces / Sales / Bookings / Referrals
  const facesCount = guests.filter((g) => g.attending === true).length;
  const bookingsCount = guests.filter((g: any) => g.booked).length;
  const referralsTotal = guests.reduce((s, g: any) => s + (Number(g.referral_count) || 0), 0);
  const salesTotal = useMemo(() => {
    const linked = (allOrders as any[]).filter((o) => o.event_id === eventId || o.parent_event_id === eventId);
    return linked.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
  }, [allOrders, eventId]);

  const rsvpYes = guests.filter((g) => g.rsvp === "Yes").length;

  const bumpReferrals = (g: EventGuest, delta: number) => {
    const current = Number((g as any).referral_count) || 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    updateMutation.mutate({ id: g.id, updates: { referral_count: next } as any });
  };

  const setReferrals = (g: EventGuest, value: number) => {
    const current = Number((g as any).referral_count) || 0;
    const next = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    if (next === current) return;
    updateMutation.mutate({ id: g.id, updates: { referral_count: next } as any });
  };

  return (
    <div className="space-y-3">
      {/* Stat chips — Faces / Sales / Bookings / Referrals */}
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
        <div className="px-3 py-1.5 rounded-md bg-purple-50 text-purple-700 text-xs">
          <span className="font-semibold">{referralsTotal}</span> Referrals
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
          <Input placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-8 text-xs w-48" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <Select value={skinType || "__none__"} onValueChange={(v) => setSkinType(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Skin type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Skin type not set</SelectItem>
              {SKIN_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

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
                      {g.email && <p className="text-[11px] text-muted-foreground truncate">{g.email}</p>}
                      <GuestSkinTypeSelect value={(g as any).skin_type || null}
                        onChange={(v) => updateMutation.mutate({ id: g.id, updates: { skin_type: v } as any })} />

                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 rounded border border-border bg-muted/40 px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => bumpReferrals(g, -1)}
                        className="h-5 w-5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                        disabled={(Number((g as any).referral_count) || 0) === 0}
                        aria-label="Decrease referrals"
                      >−</button>
                      <input
                        type="number"
                        min={0}
                        value={Number((g as any).referral_count) || 0}
                        onChange={(e) => setReferrals(g, parseInt(e.target.value, 10))}
                        className="w-12 h-5 text-[10px] font-medium tabular-nums text-center bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-ring rounded"
                        aria-label="Referral count"
                      />
                      <button
                        type="button"
                        onClick={() => bumpReferrals(g, 1)}
                        className="h-5 w-5 text-xs text-muted-foreground hover:text-foreground"
                        aria-label="Increase referrals"
                      >+</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateMutation.mutate({ id: g.id, updates: { video_watched: !(g as any).video_watched } as any })}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0",
                        (g as any).video_watched
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-muted text-muted-foreground border-border hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                      )}
                    >
                      {(g as any).video_watched ? "Video ✓" : "Video"}
                    </button>
                    <GuestAllergiesButton
                      value={(g as any).allergies || null}
                      onSave={(v) => updateMutation.mutate({ id: g.id, updates: { allergies: v } as any })}
                    />
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-1.5 text-[10px] gap-1 shrink-0"
                      onClick={() => setScanSeed({ eventId, guestId: g.id, name: g.name, phone: g.phone || null })}
                    >
                      <ScanLine className="w-3 h-3" />Scan Card
                    </Button>
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

                  {/* Inline booking link panel */}
                  {bookForm && bookForm.guestId === g.id && (() => {
                    const q = bookForm.search.trim().toLowerCase();
                    const filtered = upcomingEvents.filter((e) => {
                      if (!q) return true;
                      const label = `${e.event_date || ""} ${e.hostess_name || ""}`.toLowerCase();
                      return label.includes(q);
                    });
                    return (
                      <div className="mt-2 p-2 rounded-md border border-amber-200 bg-amber-50/60 space-y-2">
                        <p className="text-xs font-medium text-amber-800">Link this booking to an event</p>
                        <div className="space-y-1.5">
                          <Input
                            value={bookForm.search}
                            onChange={(e) => setBookForm({ ...bookForm, search: e.target.value, selectedEventId: null })}
                            placeholder="Search upcoming events…"
                            className="h-8 text-xs"
                          />
                          {filtered.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground px-1">No upcoming events found</p>
                          ) : (
                            <ul className="max-h-40 overflow-auto rounded-md border border-border bg-popover">
                              {filtered.map((e) => {
                                const sel = bookForm.selectedEventId === e.id;
                                const dateLabel = e.event_date ? format(new Date(e.event_date + "T12:00:00"), "MMM d, yyyy") : "No date";
                                return (
                                  <li key={e.id}>
                                    <button
                                      type="button"
                                      onClick={() => setBookForm({ ...bookForm, selectedEventId: e.id })}
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs hover:bg-accent",
                                        sel && "bg-accent font-medium"
                                      )}
                                    >
                                      {dateLabel} · {e.hostess_name || "(no hostess)"}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          {(() => {
                            const selected = upcomingEvents.find((e) => e.id === bookForm.selectedEventId);
                            const isGuestEvent = selected?.event_type === "Guest Event";
                            return isGuestEvent ? (
                              <Button size="sm" className="h-8 text-xs" disabled={!bookForm.selectedEventId} onClick={addBookingToGuestList}>
                                Add to Guest List
                              </Button>
                            ) : (
                              <Button size="sm" className="h-8 text-xs" disabled={!bookForm.selectedEventId} onClick={linkBookingToEvent}>
                                Link as Hostess
                              </Button>
                            );
                          })()}
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={createEventForBooking}>

                            Create New Event
                          </Button>
                          <button
                            type="button"
                            onClick={() => setBookForm(null)}
                            className="ml-auto text-[11px] text-muted-foreground hover:underline"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    );
                   })()}

                  {/* Inline career interest panel */}
                  {careerForm && careerForm.guestId === g.id && (
                    <div className="mt-2 p-2 rounded-md border border-amber-200 bg-amber-50/60 space-y-2">
                      <p className="text-xs font-medium text-amber-800">Book a sharing appointment</p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Button size="sm" className="h-8 text-xs" onClick={createSharingAppointment}>
                          Create Sharing Appointment for {careerForm.name}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setCareerForm(null)}
                          className="ml-auto text-[11px] text-muted-foreground hover:underline"
                        >
                          Skip
                        </button>
                      </div>
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
                  {g.email && <p className="text-[11px] text-muted-foreground truncate">{g.email}</p>}
                  <GuestSkinTypeSelect value={(g as any).skin_type || null}
                    onChange={(v) => updateMutation.mutate({ id: g.id, updates: { skin_type: v } as any })} />

                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                  Confirmed
                </span>
                <div className="flex items-center gap-0.5 shrink-0 rounded border border-border bg-muted/40 px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => bumpReferrals(g, -1)}
                    className="h-5 w-5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                    disabled={(Number((g as any).referral_count) || 0) === 0}
                    aria-label="Decrease referrals"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    value={Number((g as any).referral_count) || 0}
                    onChange={(e) => setReferrals(g, parseInt(e.target.value, 10))}
                    className="w-12 h-5 text-[10px] font-medium tabular-nums text-center bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-ring rounded"
                    aria-label="Referral count"
                  />
                  <button
                    type="button"
                    onClick={() => bumpReferrals(g, 1)}
                    className="h-5 w-5 text-xs text-muted-foreground hover:text-foreground"
                    aria-label="Increase referrals"
                  >+</button>
                </div>
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ id: g.id, updates: { video_watched: !(g as any).video_watched } as any })}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0",
                    (g as any).video_watched
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-muted text-muted-foreground border-border hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                  )}
                >
                  {(g as any).video_watched ? "Video ✓" : "Video"}
                </button>
                <GuestAllergiesButton
                  value={(g as any).allergies || null}
                  onSave={(v) => updateMutation.mutate({ id: g.id, updates: { allergies: v } as any })}
                />
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

      {/* Join → duplicate consultant guard */}
      <DuplicateGuardDialog
        open={!!joinDupCheck}
        onOpenChange={(v) => { if (!v) setJoinDupCheck(null); }}
        strong={joinDupCheck?.strong || null}
        softName={joinDupCheck?.softName || null}
        attemptedName={joinForm?.name || ""}
        targetKind="consultant"
        linkPending={joinInsertPending}
        onLinkExisting={async (match) => {
          if (match.kind === "consultant") {
            await fillEmptyFieldsFromNew(match, { phone: joinForm?.phone || null });
            await performJoinInsert(match.id);
          } else {
            // Existing customer — still need a consultant row; just create new but pre-linked to same person
            await performJoinInsert();
          }
        }}
        onCreateAnyway={async () => { await performJoinInsert(); }}
      />

      {/* Guest ordered → convert to customer (with optional Scan Card path) */}
      <ConvertGuestToCustomerDialog
        prompt={convertGuestPrompt}
        setPrompt={setConvertGuestPrompt}
        allConsultants={allConsultants as any[]}
        eventId={eventId}
        onCreated={async (customerId) => {
          if (!convertGuestPrompt) return;
          await updateMutation.mutateAsync({ id: convertGuestPrompt.guest.id, updates: { converted_customer_id: customerId } as any });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }}
        dupCheck={convertGuestDup}
        setDupCheck={setConvertGuestDup}
      />

      <ScanCardDialog
        open={Boolean(scanSeed)}
        onOpenChange={(v) => { if (!v) setScanSeed(null); }}
        seed={scanSeed ?? undefined}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }}
      />
    </div>
  );
}

// Inline: prompt to add an ordered guest to the customer list, with duplicate guard + "assigned to" picker.
// Supports two modes: manual (name/phone only) and scan-card (photo → Gemini vision → editable review).
function ConvertGuestToCustomerDialog({
  prompt,
  setPrompt,
  allConsultants,
  eventId,
  onCreated,
  dupCheck,
  setDupCheck,
}: {
  prompt: { guest: EventGuest; assign: string } | null;
  setPrompt: (v: any) => void;
  allConsultants: Array<{ id: string; name: string }>;
  eventId: string;
  onCreated: (customerId: string) => Promise<void>;
  dupCheck: { strong: DuplicateMatch | null; softName: DuplicateMatch | null } | null;
  setDupCheck: (v: any) => void;
}) {
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"manual" | "scan">("manual");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanBackFile, setScanBackFile] = useState<File | null>(null);
  const [scanBackPreview, setScanBackPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanExtracted, setScanExtracted] = useState<import("@/lib/scanPhoto").Extracted | null>(null);
  const [scanFields, setScanFields] = useState<Record<string, string>>({});
  const [scanOrders, setScanOrders] = useState<import("@/lib/scanPhoto").OrderDraft[]>([]);

  const resetScan = () => {
    setScanFile(null); setScanPreview(null); setScanning(false);
    setScanBackFile(null); setScanBackPreview(null);
    setScanExtracted(null); setScanFields({}); setScanOrders([]);
  };

  const closeAll = () => { setPrompt(null); setDupCheck(null); resetScan(); setMode("manual"); };

  if (!prompt) return null;
  const g = prompt.guest;

  const performCreate = async (linkExistingId?: string, linkKind?: "customer" | "consultant") => {
    setPending(true);
    try {
      if (linkExistingId && linkKind === "customer") {
        // Link existing customer path — reuse existing behavior (no scan applied to an existing record here;
        // for that Stephanie can use Scan Photo on the customer's profile after linking).
        await fillEmptyFieldsFromNew(
          { kind: "customer", id: linkExistingId, name: g.name, phone: g.phone, email: g.email, reason: "phone" },
          { phone: g.phone, email: g.email }
        );
        await onCreated(linkExistingId);
        toast.success(`Linked ${g.name} to existing customer`);
      } else {
        // Build new customer payload from scan fields (if scan mode) merged with guest name/phone fallback.
        const scanPayload = mode === "scan" ? scanFields : {};
        const created = await createCustomer({
          full_name: scanPayload.full_name?.trim() || g.name,
          phone: scanPayload.phone?.trim() || g.phone || null,
          email: scanPayload.email?.trim() || g.email || null,
          address_line_1: scanPayload.address_line_1?.trim() || null,
          address_line_2: scanPayload.address_line_2?.trim() || null,
          city: scanPayload.city?.trim() || null,
          state_territory: scanPayload.state_territory?.trim() || null,
          postal_code: scanPayload.postal_code?.trim() || null,
          birthday: scanPayload.birthday?.trim() || null,
          relationship_status: "Customer",
          assigned_consultant_id: prompt.assign === "__me__" ? null : prompt.assign,
        } as any, { allowDuplicate: true });

        // If we ran a scan, finalize: upload image + create orders + audit note.
        if (mode === "scan" && scanExtracted) {
          const { finalizeScanForNewCustomer, beautyProfileFromExtracted } = await import("@/lib/scanPhoto");

          // 1) Beauty Profile read off the card — saved on its own so nothing else can block it.
          try {
            const { cleanBeautyProfile, isBeautyProfileEmpty } = await import("@/lib/beautyProfile");
            const cardProfile = cleanBeautyProfile(beautyProfileFromExtracted(scanExtracted));
            if (!isBeautyProfileEmpty(cardProfile)) {
              const { updateCustomer } = await import("@/lib/queries");
              await updateCustomer(created.id, { beauty_notes: cardProfile } as any);
            }
          } catch (e: any) {
            toast.warning(`Saved, but the beauty profile didn't attach: ${e?.message || e}`);
          }

          // 2) Orders + audit note + photo backup. The backup step can't throw,
          //    so a Drive/PDF problem only shows up as a warning below.
          try {
            const res = await finalizeScanForNewCustomer({
              customerId: created.id,
              customerName: (created as any).full_name || g.name,
              file: scanFile,
              files: [scanFile, scanBackFile],
              extracted: scanExtracted,
              orderDrafts: scanOrders,
              eventId,
            });
            if (res.driveNeedsSetup) {
              toast.warning("Saved — Google Drive isn't connected yet, so the card photo backup was skipped.");
            } else if (res.driveError) {
              toast.warning("Saved — but the card photo backup failed.");
            }
          } catch (e: any) {
            // Don't roll back the customer for a scan-finalize glitch — surface it.
            toast.error(`Customer created, but the orders/notes step failed: ${e?.message || e}`);
          }
        }


        await onCreated(created.id);
        toast.success(`${(created as any).full_name || g.name} added to customer list`);
      }
      closeAll();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setPending(false);
    }
  };

  const handleConfirm = async () => {
    const nameForCheck = (mode === "scan" ? scanFields.full_name?.trim() : "") || g.name;
    const phoneForCheck = (mode === "scan" ? scanFields.phone?.trim() : "") || g.phone;
    const dup = await checkForDuplicatePerson({ fullName: nameForCheck, phone: phoneForCheck, kind: "customer" });
    if (dup.strong || dup.softName) {
      setDupCheck(dup);
      return;
    }
    await performCreate();
  };

  const handleScanFile = (f: File) => {
    setScanFile(f);
    setScanPreview(URL.createObjectURL(f));
    setScanExtracted(null); setScanFields({}); setScanOrders([]);
  };

  const handleScanBackFile = (f: File) => {
    setScanBackFile(f);
    setScanBackPreview(URL.createObjectURL(f));
    setScanExtracted(null); setScanFields({}); setScanOrders([]);
  };

  const openScanCapture = useCameraCapture(handleScanFile);
  const openScanBackCapture = useCameraCapture(handleScanBackFile);

  const runScan = async () => {
    if (!scanFile) return;
    setScanning(true);
    try {
      const { runScanExtract, orderDraftsFromExtracted, contactFieldsForNewCustomer } = await import("@/lib/scanPhoto");
      const ex = await runScanExtract(scanBackFile ? [scanFile, scanBackFile] : scanFile);
      setScanExtracted(ex);
      // Seed editable fields: scanned values, falling back to guest name/phone for any that are missing.
      const seeded = contactFieldsForNewCustomer(ex);
      if (!seeded.full_name && g.name) seeded.full_name = g.name;
      if (!seeded.phone && g.phone) seeded.phone = g.phone;
      if (!seeded.email && g.email) seeded.email = g.email;
      setScanFields(seeded);
      setScanOrders(orderDraftsFromExtracted(ex));
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const updateScanField = (k: string, v: string) => setScanFields((prev) => ({ ...prev, [k]: v }));
  const updateScanOrder = (i: number, patch: Partial<import("@/lib/scanPhoto").OrderDraft>) =>
    setScanOrders((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const removeScanOrder = (i: number) => setScanOrders((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <>
      <Dialog open={!!prompt && !dupCheck} onOpenChange={(v) => { if (!v) closeAll(); }}>
        <DialogContent
          className={mode === "scan" ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-sm"}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add {g.name} to your customer list?
            </DialogTitle>
            <DialogDescription>
              They ordered at this event. Add them so you can track future follow-ups.
            </DialogDescription>
          </DialogHeader>

          {/* Mode switcher */}
          <div className="flex items-center gap-2 text-xs">
            <Button
              type="button"
              size="sm"
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => { setMode("manual"); resetScan(); }}
              disabled={pending || scanning}
            >Quick add</Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "scan" ? "default" : "outline"}
              onClick={() => setMode("scan")}
              disabled={pending || scanning}
              className="gap-1"
            >📷 Scan profile card</Button>
          </div>

          {mode === "manual" && (
            <div className="space-y-2">
              <Label className="text-xs">Assigned to</Label>
              <Select value={prompt.assign} onValueChange={(v) => setPrompt({ ...prompt, assign: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__me__">Me (director)</SelectItem>
                  {allConsultants.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "scan" && (
            <div className="space-y-3">
              {!scanExtracted && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => openScanCapture()} className="gap-2" disabled={scanning}>
                      📷 {scanFile ? "Replace front" : "Front of card"}
                    </Button>
                    {scanFile && <span className="text-xs text-muted-foreground truncate">{scanFile.name}</span>}
                  </div>
                  {scanPreview && (
                    <div className="border rounded-md overflow-hidden bg-muted/30">
                      <img src={scanPreview} alt="Front preview" className="w-full max-h-56 object-contain" />
                    </div>
                  )}

                  {scanFile && (
                    <div className="rounded-md border border-dashed p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">Got writing on the back? Snap it — otherwise skip ahead.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openScanBackCapture()} className="gap-2" disabled={scanning}>
                          📷 {scanBackFile ? "Replace back" : "Back of card"}
                        </Button>
                        {scanBackFile && (
                          <Button type="button" size="sm" variant="ghost" disabled={scanning}
                            onClick={() => { setScanBackFile(null); setScanBackPreview(null); }}>
                            Remove back
                          </Button>
                        )}
                      </div>
                      {scanBackPreview && (
                        <div className="border rounded-md overflow-hidden bg-muted/30">
                          <img src={scanBackPreview} alt="Back preview" className="w-full max-h-56 object-contain" />
                        </div>
                      )}
                    </div>
                  )}
                  <Button type="button" disabled={!scanFile || scanning} onClick={runScan} className="w-full">
                    {scanning ? "Extracting…" : "Extract with AI"}
                  </Button>
                </>
              )}

              {scanExtracted && (
                <div className="space-y-4">
                  {/* Editable contact fields */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Contact info (edit anything before saving)</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <FieldInput label="Full name" value={scanFields.full_name || ""} onChange={(v) => updateScanField("full_name", v)} />
                      <FieldInput label="Phone" value={scanFields.phone || ""} onChange={(v) => updateScanField("phone", v)} />
                      <FieldInput label="Email" value={scanFields.email || ""} onChange={(v) => updateScanField("email", v)} />
                      <FieldInput label="Birthday" value={scanFields.birthday || ""} onChange={(v) => updateScanField("birthday", v)} placeholder="YYYY-MM-DD" />
                      <FieldInput label="Address line 1" value={scanFields.address_line_1 || ""} onChange={(v) => updateScanField("address_line_1", v)} className="col-span-2" />
                      <FieldInput label="Address line 2" value={scanFields.address_line_2 || ""} onChange={(v) => updateScanField("address_line_2", v)} className="col-span-2" />
                      <FieldInput label="City" value={scanFields.city || ""} onChange={(v) => updateScanField("city", v)} />
                      <FieldInput label="State" value={scanFields.state_territory || ""} onChange={(v) => updateScanField("state_territory", v)} />
                      <FieldInput label="ZIP" value={scanFields.postal_code || ""} onChange={(v) => updateScanField("postal_code", v)} />
                    </div>
                    <div className="pt-1">
                      <Label className="text-xs">Assigned to</Label>
                      <Select value={prompt.assign} onValueChange={(v) => setPrompt({ ...prompt, assign: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__me__">Me (director)</SelectItem>
                          {allConsultants.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Orders */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Orders (linked to this event, created as Unpaid)</h3>
                    {scanOrders.length === 0 && <p className="text-xs text-muted-foreground italic">No orders detected.</p>}
                    {scanOrders.map((o, i) => (
                      <div key={i} className={cn("border rounded-md p-2 space-y-2", !o.include && "opacity-50")}>
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={o.include} onChange={(e) => updateScanOrder(i, { include: e.target.checked })} />
                            Include this order
                          </label>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeScanOrder(i)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Date</Label>
                            <Input type="date" value={o.order_date} onChange={(e) => updateScanOrder(i, { order_date: e.target.value })} className="h-8" />
                          </div>
                          <div>
                            <Label className="text-xs">Total ($)</Label>
                            <Input type="number" step="0.01" value={o.total} onChange={(e) => updateScanOrder(i, { total: e.target.value })} className="h-8" />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Items</Label>
                          <textarea
                            value={o.itemsText}
                            onChange={(e) => updateScanOrder(i, { itemsText: e.target.value })}
                            rows={2}
                            className="w-full text-xs border rounded p-2"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {scanExtracted.raw_notes && (
                    <div className="text-xs">
                      <div className="font-semibold mb-1">Other handwriting captured</div>
                      <div className="p-2 rounded border bg-muted/30 whitespace-pre-wrap">{scanExtracted.raw_notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeAll} disabled={pending || scanning}>Not now</Button>
            {mode === "scan" && scanExtracted && (
              <Button variant="outline" onClick={resetScan} disabled={pending}>Start over</Button>
            )}
            <Button
              onClick={handleConfirm}
              disabled={pending || scanning || (mode === "scan" && !scanExtracted)}
            >
              {pending ? "Saving…" : mode === "scan" ? "Save customer + orders" : "Add customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicateGuardDialog
        open={!!dupCheck}
        onOpenChange={(v) => { if (!v) setDupCheck(null); }}
        strong={dupCheck?.strong || null}
        softName={dupCheck?.softName || null}
        attemptedName={g.name}
        targetKind="customer"
        linkPending={pending}
        onLinkExisting={async (match) => {
          if (match.kind === "prospect") return;
          await performCreate(match.id, match.kind);
        }}
        onCreateAnyway={async () => { await performCreate(); }}
      />
    </>
  );
}

function FieldInput({ label, value, onChange, placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8" placeholder={placeholder} />
    </div>
  );
}


