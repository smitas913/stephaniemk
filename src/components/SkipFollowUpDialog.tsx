import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addDays, format } from "date-fns";
import { Repeat, Calendar, XCircle } from "lucide-react";

export type SkipChoice =
  | { kind: "days"; days: number; label: string }
  | { kind: "custom"; date: string }
  | { kind: "pcp" }
  | { kind: "clear" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName?: string;
  /** Deprecated — retained for backwards compatibility with callers. Ignored. */
  allowPcp?: boolean;
  onChoose: (choice: SkipChoice) => void;
};

export default function SkipFollowUpDialog({ open, onOpenChange, personName, onChoose }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));

  useEffect(() => {
    if (open) {
      setShowCustom(false);
      setCustomDate(format(addDays(new Date(), 7), "yyyy-MM-dd"));
    }
  }, [open]);

  const choose = (c: SkipChoice) => {
    onChoose(c);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>What would you like to do next?</AlertDialogTitle>
          <AlertDialogDescription>
            {personName ? <>Skipping follow-up for <span className="font-medium text-foreground">{personName}</span>. </> : null}
            Choose when to reconnect.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!showCustom ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => choose({ kind: "days", days: 90, label: "Reorder Cycle — 90 days" })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <div className="text-sm font-medium text-foreground">Reorder Cycle</div>
                  <div className="text-[11px] text-muted-foreground">+90 days</div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">{format(addDays(new Date(), 90), "MMM d")}</div>
            </button>

            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-border text-left hover:bg-muted transition-colors"
            >
              <Calendar className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground">Custom Date</span>
            </button>

            <button
              type="button"
              onClick={() => choose({ kind: "clear" })}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-border text-left hover:bg-muted transition-colors"
            >
              <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-sm font-medium text-foreground">No Follow-Up</div>
                <div className="text-[11px] text-muted-foreground">Removes from active follow-up queue</div>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground">Pick a date</label>
            <Input
              type="date"
              value={customDate}
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setCustomDate(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCustom(false)}>Back</Button>
              <Button size="sm" onClick={() => choose({ kind: "custom", date: customDate })} disabled={!customDate}>
                Use this date
              </Button>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
