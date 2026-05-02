import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCustomers,
  fetchProspects,
  fetchBookingLeads,
  fetchTeamConsultants,
  createBookingLead,
  createCustomer,
  createNote,
  flagCustomer,
  updateCustomer,
} from "@/lib/queries";
import { toLocalDateKey } from "@/lib/dateOnly";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Users, MessageSquare, Calendar, UserPlus, Search, Loader2, Flag } from "lucide-react";

type ResultType = "Face" | "Career Chat" | "Booking Conversation";

const TITLES: Record<ResultType, { label: string; icon: any; emoji: string }> = {
  "Face": { label: "Face", icon: Users, emoji: "👤" },
  "Career Chat": { label: "Career Chat", icon: MessageSquare, emoji: "💬" },
  "Booking Conversation": { label: "Booking", icon: Calendar, emoji: "📅" },
};

type PersonKind = "customer" | "prospect" | "lead" | "hostess" | "consultant";

interface PersonMatch {
  kind: PersonKind;
  id: string;
  name: string;
  detail?: string;
}

const KIND_BADGE: Record<PersonKind, string> = {
  customer: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300",
  prospect: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300",
  lead: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300",
  hostess: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300",
  consultant: "bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300",
};

export default function QuickAddPersonDialog({
  open,
  resultType,
  onOpenChange,
  onLogged,
}: {
  open: boolean;
  resultType: ResultType | null;
  onOpenChange: (v: boolean) => void;
  onLogged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PersonMatch | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Step 2: optional "Add person?" capture for brand-new names on Face logs
  const [capturePrompt, setCapturePrompt] = useState<{ name: string; noteBody: string } | null>(null);
  // Step 3: optional "Flag for follow-up?" prompt after a customer-linked log
  const [flagPrompt, setFlagPrompt] = useState<{ customerId: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
      setNote("");
      setBusy(false);
      setCapturePrompt(null);
      setFlagPrompt(null);
      // Autofocus search shortly after mount
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Only fetch people when dialog open
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers, enabled: open });
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects, enabled: open });
  const { data: leads = [] } = useQuery({ queryKey: ["booking-leads"], queryFn: fetchBookingLeads, enabled: open });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants, enabled: open });

  const allPeople = useMemo<PersonMatch[]>(() => {
    const list: PersonMatch[] = [];
    customers.forEach((c: any) => list.push({ kind: "customer", id: c.id, name: c.full_name, detail: c.phone || c.email || undefined }));
    prospects.forEach((p: any) => list.push({ kind: "prospect", id: p.id, name: p.name, detail: p.phone || p.email || undefined }));
    leads.forEach((l: any) => list.push({ kind: "lead", id: l.id, name: l.name, detail: l.phone || l.email || undefined }));
    consultants.forEach((c: any) => list.push({ kind: "consultant", id: c.id, name: c.name, detail: c.phone || c.email || undefined }));
    return list;
  }, [customers, prospects, leads, consultants]);

  const matches = useMemo<PersonMatch[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allPeople
      .filter((p) => p.name?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allPeople, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allPeople.find((p) => p.name?.toLowerCase() === q) || null;
  }, [allPeople, query]);

  const handleSelect = (p: PersonMatch) => {
    setSelected(p);
    setQuery(p.name);
  };

  // Logs a note for the given person (or anonymous if person is null)
  const logActivity = async (person: PersonMatch | null, name: string) => {
    if (!resultType) return;
    const noteBody = note.trim() || `Quick log: ${resultType}${person ? ` — ${person.name}` : name ? ` — ${name}` : ""}`;
    const payload: Parameters<typeof createNote>[0] = {
      entity_type: person ? kindToEntityType(person.kind) : "Lead",
      note_body: noteBody,
      note_type: "General",
      result_type: resultType,
      is_booking_attempt: resultType === "Booking Conversation",
    };
    if (person?.kind === "customer") {
      payload.customer_id = person.id;
      payload.person_type = "customer";
      payload.person_id = person.id;
    } else if (person?.kind === "prospect") {
      payload.prospect_id = person.id;
      payload.person_type = "prospect";
      payload.person_id = person.id;
    } else if (person?.kind === "lead") {
      payload.person_type = "lead";
      payload.person_id = person.id;
    } else if (person?.kind === "consultant") {
      payload.person_type = "consultant";
      payload.person_id = person.id;
    } else if (person?.kind === "hostess") {
      payload.person_type = "hostess";
      payload.person_id = person.id;
    }
    await createNote(payload);
  };

  const finishOrPromptFlag = (person: PersonMatch | null, name: string) => {
    if (person?.kind === "customer") {
      // Offer 1-tap flag for follow-through
      setFlagPrompt({ customerId: person.id, name: person.name });
      return;
    }
    onLogged();
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!resultType) return;
    const trimmed = query.trim();
    if (!selected && !trimmed) {
      toast.error("Please enter a name");
      return;
    }
    setBusy(true);
    try {
      // If selected or exact-match exists → log directly
      if (selected || exactMatch) {
        const person = selected || exactMatch!;
        await logActivity(person, person.name);
        toast.success(`${resultType} logged for ${person.name}`);
        setBusy(false);
        finishOrPromptFlag(person, person.name);
        return;
      }

      // Brand-new name
      if (resultType === "Face") {
        // Show "Add person?" prompt — defer activity log until user chooses
        setCapturePrompt({ name: trimmed, noteBody: note.trim() });
        setBusy(false);
        return;
      }

      // Other result types: keep existing behavior (auto-create lead)
      const newLead = await createBookingLead({ name: trimmed, status: "New" as any });
      const person: PersonMatch = { kind: "lead", id: (newLead as any).id, name: trimmed };
      await logActivity(person, trimmed);
      toast.success(`${resultType} logged for ${person.name}`);
      setBusy(false);
      finishOrPromptFlag(person, person.name);
    } catch (e: any) {
      const msg = e?.message || e?.error_description || "Unknown error";
      toast.error(`Failed to log: ${msg}`);
      setBusy(false);
    }
  };

  // "Add person?" handler: captures a Customer / Lead / Skip choice
  const handleCaptureChoice = async (choice: "customer" | "lead" | "skip") => {
    if (!capturePrompt || !resultType) return;
    setBusy(true);
    try {
      let person: PersonMatch | null = null;
      if (choice === "customer") {
        const c = await createCustomer({ full_name: capturePrompt.name, relationship_status: "Customer" } as any);
        person = { kind: "customer", id: (c as any).id, name: capturePrompt.name };
        toast.success(`Customer added: ${capturePrompt.name}`);
      } else if (choice === "lead") {
        const l = await createBookingLead({ name: capturePrompt.name, status: "New" as any });
        person = { kind: "lead", id: (l as any).id, name: capturePrompt.name };
        toast.success(`Lead added: ${capturePrompt.name}`);
      } else {
        toast.success(`Face logged for ${capturePrompt.name}`);
      }
      await logActivity(person, capturePrompt.name);
      setBusy(false);
      setCapturePrompt(null);
      finishOrPromptFlag(person, capturePrompt.name);
    } catch (e: any) {
      const msg = e?.message || e?.error_description || "Unknown error";
      toast.error(`Failed: ${msg}`);
      setBusy(false);
    }
  };

  // Flag prompt handler — 1 tap to mark customer needing follow-through
  const handleFlagChoice = async (reason: "Finish later" | "Needs follow-up" | "Complete details later" | null) => {
    if (!flagPrompt) return;
    setBusy(true);
    try {
      if (reason) {
        await flagCustomer(flagPrompt.customerId, reason);
        toast.success(`Flagged: ${reason}`);
      }
    } catch (e: any) {
      toast.error(`Failed to flag: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBusy(false);
      setFlagPrompt(null);
      onLogged();
      onOpenChange(false);
    }
  };

  const meta = resultType ? TITLES[resultType] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {meta && <span className="text-2xl">{meta.emoji}</span>}
            <span>Log {meta?.label}</span>
          </DialogTitle>
        </DialogHeader>

        {flagPrompt ? (
          <div className="space-y-3">
            <div className="text-sm">
              <p className="text-foreground font-medium flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5 text-primary" /> Flag for follow-up?
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mark <span className="font-semibold">{flagPrompt.name}</span> so they show in your weekly Business Reset.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {(["Finish later", "Needs follow-up", "Complete details later"] as const).map((reason) => (
                <Button
                  key={reason}
                  variant="outline"
                  className="h-10 justify-start gap-2 hover:bg-primary/5 hover:border-primary/40"
                  disabled={busy}
                  onClick={() => handleFlagChoice(reason)}
                >
                  <Flag className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm">{reason}</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                className="h-9 text-xs text-muted-foreground"
                disabled={busy}
                onClick={() => handleFlagChoice(null)}
              >
                No flag — done
              </Button>
            </div>
            {busy && (
              <div className="flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...
              </div>
            )}
          </div>
        ) : capturePrompt ? (
          <div className="space-y-3">
            <div className="text-sm">
              <p className="text-foreground font-medium">Add person?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Save <span className="font-semibold">{capturePrompt.name}</span> to your contacts so they show up in follow-ups.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col gap-1 hover:bg-blue-50 hover:border-blue-300"
                disabled={busy}
                onClick={() => handleCaptureChoice("customer")}
              >
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold">Customer</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col gap-1 hover:bg-amber-50 hover:border-amber-300"
                disabled={busy}
                onClick={() => handleCaptureChoice("lead")}
              >
                <UserPlus className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-semibold">Lead</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col gap-1"
                disabled={busy}
                onClick={() => handleCaptureChoice("skip")}
              >
                <span className="text-base">⏭️</span>
                <span className="text-xs font-semibold">Skip</span>
              </Button>
            </div>
            {busy && (
              <div className="flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...
              </div>
            )}
            <p className="text-[11px] text-muted-foreground text-center">
              Skip just logs the Face — no contact is created.
            </p>
          </div>
        ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder="Type a name..."
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (matches[0] && !selected) handleSelect(matches[0]);
                    else handleSave();
                  }
                }}
                className="h-10 pl-8"
                autoComplete="off"
              />
            </div>

            {/* Match dropdown */}
            {query.trim() && !selected && (
              <div className="mt-1 border rounded-md bg-popover shadow-sm max-h-56 overflow-y-auto">
                {matches.length > 0 ? (
                  matches.map((m) => (
                    <button
                      key={`${m.kind}-${m.id}`}
                      type="button"
                      onClick={() => handleSelect(m)}
                      className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{m.name}</div>
                        {m.detail && <div className="text-[11px] text-muted-foreground truncate">{m.detail}</div>}
                      </div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", KIND_BADGE[m.kind])}>
                        {m.kind}
                      </span>
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={handleSave}
                    className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 text-sm"
                  >
                    <UserPlus className="w-4 h-4 text-primary" />
                    <span>
                      {resultType === "Face"
                        ? <>Use new name: <span className="font-semibold">{query.trim()}</span></>
                        : <>Create new lead: <span className="font-semibold">{query.trim()}</span></>}
                    </span>
                  </button>
                )}
              </div>
            )}

            {selected && (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Linked to</span>
                <span className={cn("px-1.5 py-0.5 rounded font-medium", KIND_BADGE[selected.kind])}>{selected.kind}</span>
                <button type="button" className="text-primary hover:underline ml-auto" onClick={() => { setSelected(null); inputRef.current?.focus(); }}>
                  Change
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
            <Textarea
              placeholder="Quick note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[60px]"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={busy || !query.trim()}>
              {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</> : (resultType === "Face" ? "Continue" : "Save")}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function kindToEntityType(kind: PersonKind): "Customer" | "Prospect" | "Lead" | "Consultant" | "Hostess" {
  switch (kind) {
    case "customer": return "Customer";
    case "prospect": return "Prospect";
    case "lead": return "Lead";
    case "consultant": return "Consultant";
    case "hostess": return "Hostess";
  }
}
