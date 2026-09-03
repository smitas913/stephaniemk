import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchCustomers, fetchProspects, fetchTeamConsultants, createNote, createProspectNote } from "@/lib/queries";
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

export default function QuickCareerChatDialog({
  open,
  onOpenChange,
  onLogged,
  initialProspectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLogged: () => void;
  initialProspectId?: string | null;
  /** @deprecated retained for call-site compatibility; layer concept removed */
  initialLastTouch?: string | null;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string; kind: string } | null>(null);
  const [isForConsultant, setIsForConsultant] = useState(false);
  const [consultantQuery, setConsultantQuery] = useState("");
  const [selectedConsultant, setSelectedConsultant] = useState<{ id: string; name: string } | null>(null);
  const [interestLevel, setInterestLevel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [chatDate, setChatDate] = useState(toLocalDateKey());
  const [followUpDateOverride, setFollowUpDateOverride] = useState<string>("");
  const [followUpDirty, setFollowUpDirty] = useState(false);

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers, enabled: open });
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects, enabled: open });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants, enabled: open });

  // Prefill from an existing prospect when caller passes one (e.g. Career Chats tab "Log conversation").
  useEffect(() => {
    if (!open) return;
    if (initialProspectId && prospects.length) {
      const p: any = (prospects as any[]).find((x: any) => x.id === initialProspectId);
      if (p) {
        setSelected({ id: p.id, name: p.name, kind: "prospect" });
        setQuery(p.name);
        if (p.ownership_type === "unit" && p.assigned_consultant_id) {
          const c: any = (consultants as any[]).find((x: any) => x.id === p.assigned_consultant_id);
          if (c) {
            setIsForConsultant(true);
            setSelectedConsultant({ id: c.id, name: c.name });
            setConsultantQuery(c.name);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProspectId, prospects.length]);

  // Auto-suggest follow-up date based on interest level (unless user manually overrode it).
  const suggestedFollowUpDate = useMemo(() => {
    const getFollowUpDays = (level: number | null) => {
      if (!level) return 14;
      if (level >= 7) return 3;
      if (level >= 4) return 10;
      return 30;
    };
    const days = isForConsultant ? 2 : getFollowUpDays(interestLevel);
    return format(addDays(new Date(chatDate + "T12:00"), days), "yyyy-MM-dd");
  }, [chatDate, interestLevel, isForConsultant]);

  useEffect(() => {
    if (!followUpDirty) setFollowUpDateOverride(suggestedFollowUpDate);
  }, [suggestedFollowUpDate, followUpDirty]);

  const allPeople = useMemo(() => {
    const list: { id: string; name: string; phone: string; kind: string }[] = [];
    customers.forEach((c: any) => list.push({ id: c.id, name: c.full_name, phone: c.phone || "", kind: "customer" }));
    prospects.forEach((p: any) => list.push({ id: p.id, name: p.name, phone: p.phone || "", kind: "prospect" }));
    return list;
  }, [customers, prospects]);

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
      const followUpDate = followUpDateOverride || suggestedFollowUpDate;

      const personName = selected?.name || query.trim();

      const userId = (await supabase.auth.getUser()).data.user?.id;
      const oppStatus = interestLevel && interestLevel >= 7 ? "Interested" : "Follow-Up";

      let prospectId: string | null = null;

      const commonFields: any = {
        interest_level: interestLevel,
        last_contact_date: today,
        next_follow_up_date: followUpDate,
        opportunity_status: oppStatus,
        is_career_chat: true,
        updated_at: new Date().toISOString(),
      };

      if (selected?.kind === "prospect") {
        prospectId = selected.id;
        await supabase.from("prospects" as any).update({
          ...commonFields,
          ...(isForConsultant && selectedConsultant ? {
            ownership_type: "unit",
            assigned_consultant_id: selectedConsultant.id,
          } : {}),
        } as any).eq("id", selected.id);
      } else {
        let existing: any = null;
        if (isForConsultant && selectedConsultant && personName) {
          const { data } = await supabase.from("prospects" as any)
            .select("id")
            .eq("assigned_consultant_id", selectedConsultant.id)
            .ilike("name", personName)
            .limit(1)
            .maybeSingle();
          existing = data;
        }

        if (existing?.id) {
          prospectId = existing.id;
          await supabase.from("prospects" as any).update({
            ...commonFields,
            ownership_type: "unit",
            assigned_consultant_id: selectedConsultant!.id,
          } as any).eq("id", existing.id);
        } else {
          const { data: newProspect, error } = await supabase
            .from("prospects" as any)
            .insert({
              name: personName,
              customer_id: selected?.kind === "customer" ? selected.id : null,
              opportunity_status: oppStatus,
              interest_level: interestLevel,
              date_shared: today,
              last_contact_date: today,
              next_follow_up_date: followUpDate,
              owner_user_id: userId,
              ownership_type: isForConsultant ? "unit" : "personal",
              assigned_consultant_id: isForConsultant && selectedConsultant ? selectedConsultant.id : null,
              is_career_chat: true,
            } as any)
            .select()
            .single();
          if (error) throw error;
          prospectId = (newProspect as any).id;
        }
      }

      // Header line for the timeline entry so the coaching context is preserved.
      const noteHeader = isForConsultant && selectedConsultant
        ? `Career chat coached with ${selectedConsultant.name}${interestLevel ? ` · Interest ${interestLevel}/10` : ""}`
        : `Career chat${interestLevel ? ` · Interest ${interestLevel}/10` : ""}`;
      const noteBody = notes.trim() ? `${noteHeader}\n${notes.trim()}` : noteHeader;

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
        await createProspectNote({ prospect_id: prospectId, note_text: noteBody, note_date: today });
      }

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
        return;
      }

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
    setInterestLevel(null);
    setNotes("");
    setChatDate(toLocalDateKey());
    setFollowUpDateOverride("");
    setFollowUpDirty(false);
  };

  const canSave = (selected || query.trim()) && (!isForConsultant || selectedConsultant);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" /> Log Career Chat
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
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

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date of chat
            </label>
            <Input type="date" value={chatDate} onChange={e => setChatDate(e.target.value)} className="h-9" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isForConsultant}
              onChange={e => { setIsForConsultant(e.target.checked); setSelectedConsultant(null); setConsultantQuery(""); }}
              className="rounded border-border" />
            <span className="text-xs font-medium text-foreground">This is for one of my consultants</span>
          </label>

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

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              What did you talk about?
            </label>
            <Textarea
              placeholder="Freeform notes from the conversation — what did she say, any objections, hopes, hesitations, next steps you agreed on…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="min-h-[120px] text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Interest level <span className="font-normal">(optional · 1 = not interested · 10 = joined)</span>
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

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Next check-in
            </label>
            <Input
              type="date"
              value={followUpDateOverride || suggestedFollowUpDate}
              onChange={e => { setFollowUpDateOverride(e.target.value); setFollowUpDirty(true); }}
              className="h-9"
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
