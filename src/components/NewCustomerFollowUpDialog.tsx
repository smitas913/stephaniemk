import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock, Repeat, Calendar, X } from "lucide-react";
import { toast } from "sonner";
import { toLocalDateKey } from "@/lib/dateOnly";
import { applyNewCustomerFollowUp, type FollowUpChoice } from "@/lib/newCustomerFollowUp";

interface Props {
  customerId: string | null;
  customerName: string;
  open: boolean;
  /**
   * Optional anchor date (YYYY-MM-DD). When supplied — typically the order /
   * Became Customer Date — 2+2+2 and 90-Day offsets are computed from this
   * date instead of today, so the cadence reflects the real purchase timeline.
   */
  baseDate?: string;
  /** Called after a choice is applied (or default applied on close). */
  onClose: (applied: { choice: FollowUpChoice; reason: string } | null) => void;
}

/**
 * Standardized "Start 2+2+2 Follow-Up?" prompt shown after any new customer is
 * created (Quick Add, Add Customer page, Add Order, Convert from Lead).
 *
 * - Default action: 2+2+2 sequence (one tap)
 * - Alternative: Custom date + reason
 * - Alternative: 90-Day Care Cycle only (long-term, no near-term touches)
 *
 * Closing the dialog without choosing applies the 90-Day default — never a
 * dead-end.
 */
export default function NewCustomerFollowUpDialog({ customerId, customerName, open, onClose, baseDate }: Props) {
  const [busy, setBusy] = useState(false);
  const [customDate, setCustomDate] = useState("");

  const apply = async (choice: FollowUpChoice, date?: string) => {
    if (!customerId) return;
    setBusy(true);
    try {
      const result = await applyNewCustomerFollowUp(customerId, choice, date, baseDate);
      toast.success(`Follow-up set: ${result.reason}`);
      onClose({ choice, reason: result.reason });
    } catch (e: any) {
      toast.error(`Failed to set follow-up: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBusy(false);
      setCustomDate("");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) {
          // Failsafe: closing = Skip (customer is already saved). No dead-end.
          onClose(null);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Start 2+2+2 Follow-Up?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick a follow-up path for <span className="font-semibold text-foreground">{customerName}</span>.
            Defaults to the 90-Day Care Cycle if you close without choosing.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant="default"
              className="h-auto py-3 justify-start gap-3"
              disabled={busy}
              onClick={() => apply("222")}
            >
              <Repeat className="w-4 h-4 shrink-0" />
              <div className="text-left">
                <div className="text-sm font-semibold">Yes — Start 2+2+2</div>
                <div className="text-[11px] opacity-90">+2 days · +2 weeks · +2 months</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 justify-start gap-3 hover:bg-primary/5 hover:border-primary/40"
              disabled={busy}
              onClick={() => apply("default")}
            >
              <CalendarClock className="w-4 h-4 text-primary shrink-0" />
              <div className="text-left">
                <div className="text-sm font-semibold">Add to 90-Day Cycle Only</div>
                <div className="text-[11px] text-muted-foreground">Long-term retention rhythm (~75 days)</div>
              </div>
            </Button>
            <div className="rounded-md border p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Custom Follow-Up</span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  min={toLocalDateKey()}
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="h-9 flex-1"
                  disabled={busy}
                />
                <Button
                  size="sm"
                  className="h-9"
                  variant="outline"
                  disabled={busy || !customDate}
                  onClick={() => apply("custom", customDate)}
                >
                  Set
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              disabled={busy}
              onClick={() => onClose(null)}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Skip for now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
