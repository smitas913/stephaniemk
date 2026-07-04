import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers, fetchTeamConsultants } from "@/lib/queries";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, GitMerge, AlertTriangle } from "lucide-react";
import { formatPhone } from "@/lib/phoneUtils";
import { toast } from "sonner";

type Kind = "customer" | "consultant";

export default function MergePickerDialog({
  open,
  onOpenChange,
  currentId,
  currentName,
  kind,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentId: string;
  currentName: string;
  kind: Kind;
  onMerged?: (keptId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [otherId, setOtherId] = useState<string | null>(null);
  const [keep, setKeep] = useState<"current" | "other">("current");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers, enabled: open && kind === "customer" });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants, enabled: open && kind === "consultant" });

  const items = useMemo(() => {
    const rows: Array<{ id: string; name: string; phone: string | null; email: string | null }> =
      kind === "customer"
        ? (customers as any[]).map((c) => ({ id: c.id, name: c.full_name, phone: c.phone, email: c.email }))
        : (consultants as any[]).map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.id !== currentId)
      .filter((r) => !q || r.name?.toLowerCase().includes(q) || r.phone?.includes(q) || r.email?.toLowerCase().includes(q))
      .slice(0, 30);
  }, [customers, consultants, kind, search, currentId]);

  const other = items.find((i) => i.id === otherId) || null;

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!other) throw new Error("Pick a record to merge");
      const keepId = keep === "current" ? currentId : other.id;
      const dupId = keep === "current" ? other.id : currentId;
      const fn = kind === "consultant" ? "merge_consultants" : "merge_customers";
      const { data, error } = await supabase.rpc(fn as any, { _keep_id: keepId, _dup_id: dupId });
      if (error) throw error;
      return { keepId, data };
    },
    onSuccess: ({ keepId }) => {
      queryClient.invalidateQueries();
      toast.success("Merge complete");
      onOpenChange(false);
      setOtherId(null);
      setSearch("");
      onMerged?.(keepId);
    },
    onError: (e: Error) => toast.error(e.message || "Merge failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5" /> Merge duplicate {kind}
          </DialogTitle>
          <DialogDescription>
            Pick another {kind} record to combine with <b>{currentName}</b>. All orders, notes, and history
            will move onto the record you keep. This can't be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Search {kind}s</Label>
            <Input
              autoFocus
              placeholder="Name, phone, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 mt-1"
            />
          </div>

          <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
            {items.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">No matches</p>
            ) : (
              items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setOtherId(r.id)}
                  className={`w-full text-left px-3 py-2 hover:bg-muted/50 text-xs ${otherId === r.id ? "bg-primary/10" : ""}`}
                >
                  <div className="font-medium text-foreground">{r.name}</div>
                  <div className="text-muted-foreground">
                    {r.phone ? formatPhone(r.phone) : ""}{r.phone && r.email ? " · " : ""}{r.email || ""}
                  </div>
                </button>
              ))
            )}
          </div>

          {other && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium">Which record should be kept?</p>
              <RadioGroup value={keep} onValueChange={(v) => setKeep(v as any)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="current" id="keep-current" />
                  <Label htmlFor="keep-current" className="text-xs cursor-pointer">
                    Keep <b>{currentName}</b> (this record)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="other" id="keep-other" />
                  <Label htmlFor="keep-other" className="text-xs cursor-pointer">
                    Keep <b>{other.name}</b>
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-[11px] text-muted-foreground flex items-start gap-1 pt-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                The other record will be deleted. Empty fields on the kept record will be filled from the deleted one.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mergeMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mergeMutation.mutate()} disabled={!other || mergeMutation.isPending}>
            {mergeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
