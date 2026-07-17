import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCustomers, fetchProspects, fetchBookingLeads, fetchTeamConsultants, createNote, updateCustomer } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { toLocalDateKey } from "@/lib/dateOnly";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MessageSquare, Calendar } from "lucide-react";

const INTEREST_LEVELS = [1,2,3,4,5,6,7,8,9,10].map(n => ({
  value: n,
  label: String(n),
  color: n <= 3 ? "border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-950/30"
    : n <= 6 ? "border-amber-200 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
    : n <= 8 ? "border-orange-200 text-orange-600 bg-orange-50 dark:bg-orange-950/30"
    : "border-green-200 text-green-600 bg-green-50 dark:bg-green-950/30",
}));

const MY_NEXT_STEPS = [
  { value: "book_party", label: "Book for a party" },
  { value: "book_facial", label: "Book for a facial" },
  { value: "invite_event", label: "Invite to upcoming event" },
  { value: "follow_up", label: "Add to follow-up system" },
  { value: "not_interested", label: "Not interested — no follow-up" },
  { value: "none", label: "No next step yet" },
];

const CONSULTANT_NEXT_STEPS = [
  { value: "coach_followup", label: "Remind me to coach consultant on this prospect" },
  { value: "book_party", label: "Help consultant book a party with this prospect" },
  { value: "book_facial", label: "Help consultant book a facial" },
  { value: "none", label: "No next step yet" },
];

export default function QuickCareerChatDialog({
  open,
  onOpenChange,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLogged: () => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string; kind: string } | null>(null);
  const [isForConsultant, setIsForConsultant] = useState(false);
  const [consultantQuery, setConsultantQuery] = useState("");
  const [selectedConsultant, setSelectedConsultant] = useState<{ id: string; name: string } | null>(null);
  const [interestLevel, setInterestLevel] = useState<number | null>(null);
  const [nextStep, setNextStep] = useState("none");
  const [notes, setNotes] = useState("");
  const [chatDate, setChatDate] = useState(toLocalDateKey());

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers, enabled: open });
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects, enabled: open });
  const { data: leads = [] } = useQuery({ queryKey: ["booking-leads"], queryFn: fetchBookingLeads, enabled: open });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants, enabled: open });

  const allPeople = useMemo(() => {
    const list: { id: string; name: string; phone: string; kind: string }[] = [];
    customers.forEach((c: any) => list.push({ id: c.id, name: c.full_name, phone: c.phone || "", kind: "customer" }));
    prospects.forEach((p: any) => list.push({ id: p.id, name: p.name, phone: p.phone || "", kind: "prospect" }));
    leads.forEach((l: any) => list.push({ id: l.id, name: l.name, phone: l.phone || "", kind: "lead" }));
    return list;
  }, [customers, prospects, leads]);

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q || selected) return [];
    return allPeople.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 6);
  }, [allPeople, query, selected]);

  const consultantMatches = useMemo(() => {
    const q = consultantQuery.toLowerCase().trim();
    if (!q || selectedConsultant) return [];
    return (consultants as any[]).filter((c: any) => c.name?.toLowerCase().includes(q)).slice(0, 5);
  }, [consultants, consultantQuery, selectedConsultant]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const today = chatDate;
      const interestLabel = interestLevel ? `Interest: ${interestLevel}/10` : "";
      const nextStepOptions = isForConsultant ? CONSULTANT_NEXT_STEPS : MY_NEXT_STEPS;
      const nextStepLabel = nextStepOptions.find(s => s.value === nextStep)?.label || "";

      const noteBody = [
        isForConsultant && selectedConsultant ? `Career chat coached with ${selectedConsultant.name}` : "Career chat",
        selected ? `— ${selected.name}` : query.trim() ? `— ${query.trim()}` : "",
        interestLabel ? `· ${interestLabel}` : "",
        nextStep !== "none" ? `· Next: ${nextStepLabel}` : "",
        notes.trim() ? `\n${notes.trim()}` : "",
      ].filter(Boolean).join(" ");

      const personName = selected?.name || query.trim();

      // Smart follow-up based on interest level
      const getFollowUpDays = (level: number | null) => {
        if (!level) return 14;
        if (level >= 7) return 3;
        if (level >= 4) return 10;
        return 30;
      };
      const followUpDate = format(addDays(new Date(), getFollowUpDays(interestLevel)), "yyyy-MM-dd");

      const userId = (await supabase.auth.getUser()).data.user?.id;

      if (isForConsultant && selectedConsultant) {
        await createNote({
          entity_type: "Consultant",
          person_type: "consultant",
          person_id: selectedConsultant.id,
          note_body: noteBody,
          note_type: "Career Chat",
          note_date: today,
          result_type: "Career Chat",
        });
        if (nextStep === "coach_followup") {
          await supabase.from("team_consultants" as any)
            .update({ next_follow_up_date: followUpDate, follow_up_notes: `Coach on prospect: ${personName}` } as any)
            .eq("id", selectedConsultant.id);
        }
        return;
      }

      // Always create or find a Prospect record for career chats
      let prospectId: string | null = null;

      if (selected?.kind === "prospect") {
        // Update existing prospect
        prospectId = selected.id;
        await supabase.from("prospects" as any).update({
          interest_level: interestLevel,
          last_contact_date: today,
          next_follow_up_date: followUpDate,
          opportunity_status: interestLevel && interestLevel >= 7 ? "Interested" : "Follow-Up",
          updated_at: new Date().toISOString(),
        } as any).eq("id", selected.id);
      } else {
        // Create new prospect — even if they're an existing customer
        const { data: newProspect, error } = await supabase
          .from("prospects" as any)
          .insert({
            name: personName,
            customer_id: selected?.kind === "customer" ? selected.id : null,
            opportunity_status: interestLevel && interestLevel >= 7 ? "Interested" : "Follow-Up",
            interest_level: interestLevel,
            date_shared: today,
            last_contact_date: today,
            next_follow_up_date: followUpDate,
            owner_user_id: userId,
            ownership_type: "personal",
          } as any)
          .select()
          .single();
        if (error) throw error;
        prospectId = (newProspect as any).id;
      }

      // Log note under prospect
      if (prospectId) {
        await createNote({
          entity_type: "Prospect",
          person_type: "prospect",
          person_id: prospectId,
          prospect_id: prospectId,
          note_body: noteBody,
          note_type: "Career Chat",
          note_date: today,
          result_type: "Career Chat",
        });
      }

      // Also log on customer profile if they're an existing customer
      if (selected?.kind === "customer") {
        await createNote({
          entity_type: "Customer",
          person_type: "customer",
          person_id: selected.id,
          customer_id: selected.id,
          note_body: noteBody,
          note_type: "Career Chat",
          note_date: today,
          result_type: "Career Chat",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospects"] });
      qc.invalidateQueries({ queryKey: ["all-notes"] });
      qc.invalidateQueries({ queryKey: ["unified-notes"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Career chat logged! 💬");
      onLogged();
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to log career chat"),
  });

  const reset = () => {
    setQuery(""); setSelected(null); setIsForConsultant(false);
    setConsultantQuery(""); setSelectedConsultant(null);
    setInterestLevel(null); setNextStep("none"); setNotes("");
  };

  const canSave = (selected || query.trim()) && (!isForConsultant || selectedConsultant);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" /> Quick Career Chat
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Person name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Who did you chat with?</label>
            <Input
              autoFocus
              placeholder="Search or type name..."
              value={selected ? selected.name : query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
              className="h-9"
            />
            {matches.length > 0 && (
              <div className="border border-border rounded-lg mt-1 divide-y divide-border/40 max-h-36 overflow-y-auto">
                {matches.map((p, i) => (
                  <button key={i} className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                    onClick={() => { setSelected(p); setQuery(p.name); }}>
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{p.kind}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* For consultant toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isForConsultant}
              onChange={e => { setIsForConsultant(e.target.checked); setSelectedConsultant(null); setConsultantQuery(""); setNextStep("none"); }}
              className="rounded border-border" />
            <span className="text-xs font-medium text-foreground">This is for one of my consultants</span>
          </label>

          {/* Consultant picker */}
          {isForConsultant && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Which consultant?</label>
              <Input
                placeholder="Search consultant..."
                value={selectedConsultant ? selectedConsultant.name : consultantQuery}
                onChange={e => { setConsultantQuery(e.target.value); setSelectedConsultant(null); }}
                className="h-9"
              />
              {consultantMatches.length > 0 && !selectedConsultant && (
                <div className="border border-border rounded-lg mt-1 divide-y divide-border/40">
                  {consultantMatches.map((c: any) => (
                    <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                      onClick={() => { setSelectedConsultant({ id: c.id, name: c.name }); setConsultantQuery(c.name); }}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Interest level 1-10 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Interest level <span className="font-normal">(1 = not interested · 10 = joined)</span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {INTEREST_LEVELS.map(l => (
                <button key={l.value} type="button"
                  onClick={() => setInterestLevel(interestLevel === l.value ? null : l.value)}
                  className={cn("h-9 rounded-lg border text-xs font-semibold transition-colors",
                    interestLevel === l.value ? l.color : "border-border text-muted-foreground hover:bg-muted"
                  )}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Next step */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Next step</label>
            <Select value={nextStep} onValueChange={setNextStep}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(isForConsultant ? CONSULTANT_NEXT_STEPS : MY_NEXT_STEPS).map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes (optional)</label>
            <Textarea
              placeholder="What did you discuss? Any objections? Next steps?"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="min-h-[70px] text-sm resize-none"
            />
          </div>

          <Button className="w-full" disabled={!canSave || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? "Logging..." : "Log Career Chat"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
