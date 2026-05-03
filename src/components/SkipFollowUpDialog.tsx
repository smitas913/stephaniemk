import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
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
import { CheckCircle2, Calendar, Mail, XCircle } from "lucide-react";

export type SkipChoice =
  | { kind: "days"; days: number; label: string }
  | { kind: "custom"; date: string }
  | { kind: "pcp" }
  | { kind: "clear" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName?: string;
  /** When false, hides the "Add to PCP" option (only meaningful for customers). */
  allowPcp?: boolean;
  onChoose: (choice: SkipChoice) => void;
};

const QUICK_OPTIONS: Array<{ key: string; days: number; label: string; sub: string; icon: any; isDefault?: boolean }> = [
  { key: "30d", days: 30, label: "30 Days", sub: "Check-in", icon: CheckCircle2 },
  { key: "60d", days: 60, label: "60 Days", sub: "Mid-cycle", icon: CheckCircle2 },
  { key: "90d", days: 90, label: "90 Days", sub: "Reorder / Reconnect", icon: CheckCircle2, isDefault: true },
];

export default function SkipFollowUpDialog({ open, onOpenChange, personName, allowPcp = true, onChoose }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState(format(addDays(new Date(), 90), "yyyy-MM-dd"));

  useEffect(() => {
    if (open) {
      setShowCustom(false);
      setCustomDate(format(addDays(new Date(), 90), "yyyy-MM-dd"));
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
            {QUICK_OPTIONS.map((o) => {
              const Icon = o.icon;
              const date = format(addDays(new Date(), o.days), "yyyy-MM-dd");
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => choose({ kind: "days", days: o.days, label: `${o.label} — ${o.sub}` })}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-colors",
                    o.isDefault ? "border-primary/40 bg-primary/5 hover:bg-primary/10" : "border-border hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-foreground flex items-center gap-2">
                        {o.label}
                        {o.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">Default</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{o.sub}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{format(addDays(new Date(), o.days), "MMM d")}</div>
                </button>
              );
            })}

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
                <div className="text-sm font-medium text-foreground">Clear Follow-Up</div>
                <div className="text-[11px] text-muted-foreground">Removes from follow-up queue</div>
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
