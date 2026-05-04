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
import { cn } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { Zap, CheckCircle2, Repeat, Calendar, Mail, XCircle } from "lucide-react";

export type SkipChoice =
  | { kind: "days"; days: number; label: string }
  | { kind: "custom"; date: string }
  | { kind: "pcp" }
  | { kind: "clear" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName?: string;
  /** When true, shows the legacy "Add to PCP" option. Defaults to false for the
   * standardized follow-up vocabulary (Quick Touch / Check-In / Reorder / No FU). */
  allowPcp?: boolean;
  onChoose: (choice: SkipChoice) => void;
};

type PrimaryOption = {
  key: string;
  days: number;
  label: string;
  sub: string;
  icon: any;
};

// Standardized Skip options — matches the unified follow-up vocabulary.
// Removed legacy options: "Standard Follow-Up", "45 days", "75-day reorder".
const PRIMARY_OPTIONS: PrimaryOption[] = [
  { key: "quick_touch", days: 2, label: "Quick Touch", sub: "+2 days", icon: Zap },
  { key: "check_in", days: 7, label: "Check-In", sub: "+7 days", icon: CheckCircle2 },
];

const REORDER_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
];

export default function SkipFollowUpDialog({ open, onOpenChange, personName, allowPcp = false, onChoose }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [customDate, setCustomDate] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));

  useEffect(() => {
    if (open) {
      setShowCustom(false);
      setShowReorder(false);
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

        {!showCustom && !showReorder ? (
          <div className="space-y-2">
            {PRIMARY_OPTIONS.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => choose({ kind: "days", days: o.days, label: `${o.label} — ${o.sub}` })}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border-2 border-border text-left hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-foreground">{o.label}</div>
                      <div className="text-[11px] text-muted-foreground">{o.sub}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{format(addDays(new Date(), o.days), "MMM d")}</div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowReorder(true)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <div className="text-sm font-medium text-foreground">Reorder Cycle</div>
                  <div className="text-[11px] text-muted-foreground">Pick 30 / 60 / 90 days</div>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">›</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-border text-left hover:bg-muted transition-colors"
            >
              <Calendar className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground">Custom Date</span>
            </button>

            {allowPcp && (
              <button
                type="button"
                onClick={() => choose({ kind: "pcp" })}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-border text-left hover:bg-muted transition-colors"
              >
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <div className="text-sm font-medium text-foreground">Add to PCP</div>
                  <div className="text-[11px] text-muted-foreground">Logs catalog sent today, follow-up in 6 days</div>
                </div>
              </button>
            )}

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
        ) : showReorder ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Reorder Cycle — pick a cadence</label>
            {REORDER_OPTIONS.map((o) => (
              <button
                key={o.days}
                type="button"
                onClick={() => choose({ kind: "days", days: o.days, label: `Reorder Cycle — ${o.label}` })}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border-2 border-border text-left hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-primary shrink-0" />
                  <div className="text-sm font-medium text-foreground">{o.label}</div>
                </div>
                <div className="text-[11px] text-muted-foreground">{format(addDays(new Date(), o.days), "MMM d")}</div>
              </button>
            ))}
            <div className="flex justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowReorder(false)}>Back</Button>
            </div>
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
