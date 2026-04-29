import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCustomers,
  fetchProspects,
  fetchBookingLeads,
  fetchTeamConsultants,
  createBookingLead,
  createNote,
} from "@/lib/queries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Users, MessageSquare, Calendar, UserPlus, Search, Loader2 } from "lucide-react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
      setNote("");
      setBusy(false);
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

  const handleSave = async () => {
    if (!resultType) return;
    const trimmed = query.trim();
    if (!selected && !trimmed) {
      toast.error("Please enter a name");
      return;
    }
    setBusy(true);
    try {
      let person = selected;

      // No selection — match by exact name or create new lead
      if (!person) {
        if (exactMatch) {
          person = exactMatch;
        } else {
          // Create new booking lead with status 'New'
          const newLead = await createBookingLead({ name: trimmed, status: "New" as any });
          person = { kind: "lead", id: (newLead as any).id, name: trimmed };
        }
      }

      // Map to note fields
      const noteBody = note.trim() || `Quick log: ${resultType}${person ? ` — ${person.name}` : ""}`;
      const payload: Parameters<typeof createNote>[0] = {
        entity_type: kindToEntityType(person.kind),
        note_body: noteBody,
        note_type: "General",
        result_type: resultType,
        is_booking_attempt: resultType === "Booking Conversation",
      };
      if (person.kind === "customer") {
        payload.customer_id = person.id;
        payload.person_type = "customer";
        payload.person_id = person.id;
      } else if (person.kind === "prospect") {
        payload.prospect_id = person.id;
        payload.person_type = "prospect";
        payload.person_id = person.id;
      } else if (person.kind === "lead") {
        payload.person_type = "lead";
        payload.person_id = person.id;
      } else if (person.kind === "consultant") {
        payload.person_type = "consultant";
        payload.person_id = person.id;
      } else if (person.kind === "hostess") {
        payload.person_type = "hostess";
        payload.person_id = person.id;
      }

      await createNote(payload);
      toast.success(`${resultType} logged for ${person.name}`);
      onLogged();
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || e?.error_description || "Unknown error";
      toast.error(`Failed to log: ${msg}`);
    } finally {
      setBusy(false);
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
                    <span>Create new lead: <span className="font-semibold">{query.trim()}</span></span>
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
              {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</> : "Save"}
            </Button>
          </div>
        </div>
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
