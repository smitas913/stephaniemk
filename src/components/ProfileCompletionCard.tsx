import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileLike {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  birthday_mmdd?: string | null;
  address_line_1?: string | null;
  city?: string | null;
  state_territory?: string | null;
  postal_code?: string | null;
}

interface ProfileCompletionCardProps {
  customer: ProfileLike;
  onEditField: () => void;
}

/**
 * Visual checklist of profile fields with completion %.
 * Required: Name. Optional but tracked: Phone, Email, Birthday, Address.
 * Clicking a missing field opens edit mode on the parent profile card.
 */
export default function ProfileCompletionCard({ customer, onEditField }: ProfileCompletionCardProps) {
  const fields = useMemo(() => {
    const hasAddress =
      !!customer.address_line_1?.trim() &&
      !!customer.city?.trim() &&
      !!customer.state_territory?.trim() &&
      !!customer.postal_code?.trim();
    return [
      { key: "name", label: "Name", required: true, complete: !!customer.full_name?.trim() },
      { key: "phone", label: "Phone", required: false, complete: !!customer.phone?.trim() },
      { key: "email", label: "Email", required: false, complete: !!customer.email?.trim() },
      {
        key: "birthday",
        label: "Birthday",
        required: false,
        complete: !!(customer.birthday || customer.birthday_mmdd),
      },
      { key: "address", label: "Address", required: false, complete: hasAddress },
    ];
  }, [customer]);

  const completed = fields.filter((f) => f.complete).length;
  const total = fields.length;
  const pct = Math.round((completed / total) * 100);
  const missingCount = total - completed;

  // Color band based on completion
  const barColor =
    pct === 100
      ? "bg-emerald-500"
      : pct >= 70
      ? "bg-primary"
      : pct >= 40
      ? "bg-amber-500"
      : "bg-destructive";

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Profile Completion</p>
            <p className="text-[11px] text-muted-foreground">
              {missingCount === 0
                ? "All fields complete 🎉"
                : `${missingCount} field${missingCount === 1 ? "" : "s"} missing`}
            </p>
          </div>
          <span
            className={cn(
              "text-lg font-bold tabular-nums",
              pct === 100
                ? "text-emerald-600 dark:text-emerald-400"
                : pct >= 70
                ? "text-primary"
                : pct >= 40
                ? "text-amber-600 dark:text-amber-400"
                : "text-destructive"
            )}
          >
            {pct}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Checklist */}
        <ul className="space-y-1">
          {fields.map((f) => {
            const isClickable = !f.complete;
            const Wrapper: any = isClickable ? "button" : "div";
            return (
              <Wrapper
                key={f.key}
                {...(isClickable
                  ? {
                      type: "button",
                      onClick: onEditField,
                      "aria-label": `Add ${f.label}`,
                    }
                  : {})}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs",
                  f.complete
                    ? "text-foreground"
                    : "text-foreground hover:bg-muted cursor-pointer border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10"
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {f.complete ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-destructive shrink-0" />
                  )}
                  <span className={cn("font-medium truncate", !f.complete && "text-amber-800 dark:text-amber-300")}>
                    {f.label}
                    {f.required && <span className="text-destructive ml-0.5">*</span>}
                  </span>
                </span>
                {!f.complete && (
                  <span className="flex items-center gap-1 text-[10px] text-primary font-medium shrink-0">
                    <Pencil className="w-3 h-3" />
                    Add
                  </span>
                )}
              </Wrapper>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
