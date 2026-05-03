import { cn } from "@/lib/utils";
import { Award, Percent, Cake, Users, ShoppingBag, UserPlus } from "lucide-react";

export type OrderTagKey = "hostess" | "half_price" | "birthday" | "referral" | "guest" | "myshop";

export interface OrderTagState {
  hostess: boolean;
  half_price: boolean;
  birthday: boolean;
  referral: boolean;
  guest?: boolean;
  myshop?: boolean;
}

const TAG_DEFS: Array<{ key: OrderTagKey; label: string; icon: any }> = [
  { key: "hostess", label: "Hostess", icon: Award },
  { key: "half_price", label: "Half Price", icon: Percent },
  { key: "birthday", label: "Birthday", icon: Cake },
  { key: "referral", label: "Referral", icon: UserPlus },
  { key: "guest", label: "Guest", icon: Users },
  { key: "myshop", label: "MyShop", icon: ShoppingBag },
];

interface Props {
  value: OrderTagState;
  onChange: (next: OrderTagState) => void;
  /** Which optional tags to render. Defaults to core 4. */
  include?: OrderTagKey[];
  className?: string;
}

export default function OrderTagChips({ value, onChange, include, className }: Props) {
  const visible = TAG_DEFS.filter((t) =>
    include ? include.includes(t.key) : ["hostess", "half_price", "birthday", "referral"].includes(t.key)
  );

  const toggle = (k: OrderTagKey) => {
    onChange({ ...value, [k]: !value[k] });
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visible.map((t) => {
        const active = !!value[t.key];
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => toggle(t.key)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all active:scale-[0.97]",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
