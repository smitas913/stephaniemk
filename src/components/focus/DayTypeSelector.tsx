import { cn } from "@/lib/utils";
import { Zap, CalendarCheck, Coffee } from "lucide-react";
import type { DayType } from "@/hooks/useFocusItems";
import { DAY_TYPE_INFO } from "@/hooks/useFocusItems";

const ICONS: Record<DayType, React.ElementType> = {
  power: Zap,
  appointment: CalendarCheck,
  flex: Coffee,
};

interface DayTypeSelectorProps {
  value: DayType;
  onChange: (type: DayType) => void;
  suggestion?: DayType | null;
  disabled?: boolean;
}

export default function DayTypeSelector({ value, onChange, suggestion, disabled }: DayTypeSelectorProps) {
  return (
    <div className="flex gap-1.5">
      {DAY_TYPE_INFO.map(dt => {
        const Icon = ICONS[dt.value];
        const isSuggested = suggestion === dt.value && value !== dt.value;
        return (
          <button
            key={dt.value}
            type="button"
            onClick={() => !disabled && onChange(dt.value)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
              value === dt.value
                ? "bg-primary text-primary-foreground border-primary"
                : isSuggested
                  ? "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            title={dt.description}
          >
            <Icon className="w-3 h-3" />
            {dt.label}
          </button>
        );
      })}
    </div>
  );
}
