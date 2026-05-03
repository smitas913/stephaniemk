import { useQuery } from "@tanstack/react-query";
import { backfillDefaultDiscountTypes, fetchDiscountTypes, type DiscountType } from "@/lib/discountTypes";
import { cn } from "@/lib/utils";
import { Tag } from "lucide-react";

interface Props {
  /** Selected discount type IDs */
  value: string[];
  onChange: (next: string[]) => void;
  /** When true, also show archived types whose ids are in `value` (for editing old orders) */
  showArchivedSelected?: boolean;
  /** Optional: auto-seed defaults on first render */
  seedDefaults?: boolean;
  className?: string;
}

export default function DiscountTypeChips({
  value,
  onChange,
  showArchivedSelected = false,
  seedDefaults = false,
  className,
}: Props) {
  const { data: types = [] } = useQuery<DiscountType[]>({
    queryKey: ["discount-types", { seed: seedDefaults }],
    queryFn: seedDefaults ? backfillDefaultDiscountTypes : fetchDiscountTypes,
  });

  // Preferred display order; "Other" always last, unknown names slot before "Other".
  const PREFERRED_ORDER = [
    "Birthday Discount",
    "Half Price Deal",
    "Referral Gift",
    "Hostess Credit",
    "Closing Sheet Deal",
  ];
  const orderRank = (name: string) => {
    if (/^other$/i.test(name)) return 999;
    const idx = PREFERRED_ORDER.findIndex((n) => n.toLowerCase() === name.toLowerCase());
    return idx === -1 ? 500 : idx;
  };

  const visible = types
    .filter((t) => !t.is_archived || (showArchivedSelected && value.includes(t.id)))
    .slice()
    .sort((a, b) => orderRank(a.name) - orderRank(b.name) || a.name.localeCompare(b.name));

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  if (visible.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No discount types yet. Add some in Admin → Order Options.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visible.map((t) => {
        const active = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all active:scale-[0.97]",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
              t.is_archived && "opacity-70",
            )}
          >
            <Tag className="w-3 h-3" />
            {t.name}
            {t.is_archived && <span className="text-[10px]">(archived)</span>}
          </button>
        );
      })}
    </div>
  );
}
