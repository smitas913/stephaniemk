import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchTeamConsultants, updateTeamConsultant } from "@/lib/queries";
import { formatDateOnly } from "@/lib/dateOnly";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";

const STORAGE_KEY = "t6-review-shown-month";

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isT6Flagged(c: any): boolean {
  return Boolean(c?.needs_attention) && String(c?.attention_reason || "").toUpperCase().includes("T6");
}

interface Props {
  /** Controlled mode — used when Stephanie reopens the review manually. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Auto mode — pops once per calendar month on/after the 1st. */
  auto?: boolean;
}

export default function T6ReviewDialog({ open, onOpenChange, auto }: Props) {
  const queryClient = useQueryClient();
  const [autoOpen, setAutoOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const flagged = useMemo(() => (consultants as any[]).filter(isT6Flagged), [consultants]);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open! : autoOpen;

  useEffect(() => {
    if (!auto || isControlled) return;
    if (flagged.length === 0) return;
    if (localStorage.getItem(STORAGE_KEY) === currentMonthKey()) return;
    setAutoOpen(true);
    localStorage.setItem(STORAGE_KEY, currentMonthKey());
  }, [auto, isControlled, flagged.length]);

  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setAutoOpen(v);
  };

  const apply = async (id: string, fields: Record<string, any>, msg: string) => {
    setBusyId(id);
    try {
      await updateTeamConsultant(id, fields as any);
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      toast.success(msg);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            It's the 1st — let's update our consultant list
          </DialogTitle>
          <DialogDescription className="text-xs">
            These team members came in with a T6 activity status (no activating order). Keep them on your list or remove them.
          </DialogDescription>
        </DialogHeader>

        {flagged.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No one is flagged for T6 review right now.</p>
        ) : (
          <div className="space-y-2">
            {flagged.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 rounded-md border border-border/60 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Started {c.join_date ? formatDateOnly(c.join_date) : "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busyId === c.id}
                  onClick={() => apply(c.id, { needs_attention: false, attention_reason: null }, `Keeping ${c.name}`)}
                >
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8"
                  disabled={busyId === c.id}
                  onClick={() =>
                    apply(
                      c.id,
                      { status: "Inactive", needs_attention: false, attention_reason: null },
                      `${c.name} marked inactive`,
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
