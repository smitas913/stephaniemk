import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Pencil, ChevronDown, ChevronUp } from "lucide-react";
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
 * Compact profile completion summary.
 * - 100%: single line "Profile Complete ✅ 100%" + optional Edit.
 * - <100%: compact progress bar + missing-field chips + Add button.
 *   Full checklist is hidden behind an expander.
 */
export default function ProfileCompletionCard({ customer, onEditField }: ProfileCompletionCardProps) {
  const [expanded, setExpanded] = useState(false);

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
  const missing = fields.filter((f) => !f.complete);
  const isComplete = pct === 100;

  const barColor =
    pct === 100 ? "bg-emerald-500"
    : pct >= 70 ? "bg-primary"
    : pct >= 40 ? "bg-amber-500"
    : "bg-destructive";

  if (isComplete) {
    return (
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">Profile Complete</span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">100%</span>
          </div>
          <button
            type="button"
            onClick={onEditField}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            aria-label="Edit profile"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-3 space-y-2">
        {/* Header line: pct + Add */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-foreground">Profile</span>
            <span
              className={cn(
                "text-xs font-bold tabular-nums",
                pct >= 70 ? "text-primary"
                : pct >= 40 ? "text-amber-600 dark:text-amber-400"
                : "text-destructive"
              )}
            >
              {pct}%
            </span>
            <span className="text-[11px] text-muted-foreground">
              · {missing.length} missing
            </span>
          </div>
          <button
            type="button"
            onClick={onEditField}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Pencil className="w-3 h-3" /> Add
          </button>
        </div>

        {/* Compact progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Missing field chips */}
        {missing.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {missing.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={onEditField}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/20"
              >
                + {f.label}{f.required && "*"}
              </button>
            ))}
          </div>
        )}

        {/* Expandable full checklist */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Hide details" : "Show all fields"}
        </button>
        {expanded && (
          <ul className="space-y-0.5 pt-1">
            {fields.map((f) => (
              <li
                key={f.key}
                className="flex items-center gap-2 px-1 py-0.5 text-xs text-foreground"
              >
                {f.complete ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-dashed border-muted-foreground/50 shrink-0" />
                )}
                <span className={cn("truncate", !f.complete && "text-muted-foreground")}>
                  {f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
