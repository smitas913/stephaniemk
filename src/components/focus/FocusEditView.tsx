import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw } from "lucide-react";
import type { FocusItemConfig, DayType } from "@/hooks/useFocusItems";
import { DEFAULT_FOCUS_ITEMS, DEFAULT_DAY_TYPE_TARGETS } from "@/hooks/useFocusItems";

interface FocusEditViewProps {
  draft: Omit<FocusItemConfig, "id">[];
  dayTypeTargetsDraft: Record<DayType, number[]>;
  setDraft: React.Dispatch<React.SetStateAction<Omit<FocusItemConfig, "id">[]>>;
  setDayTypeTargetsDraft: React.Dispatch<React.SetStateAction<Record<DayType, number[]>>>;
  onSave: () => void;
  onCancel: () => void;
}

const DAY_TYPES: { value: DayType; label: string; emoji: string }[] = [
  { value: "power", label: "Power Day", emoji: "⚡" },
  { value: "appointment", label: "Appointment Day", emoji: "📅" },
  { value: "flex", label: "Flex Day", emoji: "🌿" },
];

export default function FocusEditView({
  draft, dayTypeTargetsDraft, setDraft, setDayTypeTargetsDraft, onSave, onCancel,
}: FocusEditViewProps) {
  const resetToDefaults = () => {
    setDraft([...DEFAULT_FOCUS_ITEMS]);
    setDayTypeTargetsDraft({ ...DEFAULT_DAY_TYPE_TARGETS });
  };

  // Use canonical labels from defaults to ensure consistent naming.
  const labels = DEFAULT_FOCUS_ITEMS.map(i => i.label);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Set your targets for each day type</p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Choose how many of each activity you aim to complete based on the kind of day you're having.
        </p>
      </div>

      {DAY_TYPES.map(dt => (
        <div key={dt.value} className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <span>{dt.emoji}</span>
            <span>{dt.label}</span>
          </p>
          <div className="space-y-1.5">
            {labels.map((label, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-foreground flex-1 truncate">{label}</span>
                <Input
                  type="number"
                  value={dayTypeTargetsDraft[dt.value]?.[idx] ?? 1}
                  onChange={(e) => {
                    setDayTypeTargetsDraft(prev => {
                      const updated = { ...prev };
                      const arr = [...(updated[dt.value] || [])];
                      arr[idx] = Math.max(0, parseInt(e.target.value) || 0);
                      updated[dt.value] = arr;
                      return updated;
                    });
                  }}
                  className="h-7 text-xs w-14 text-center"
                  min={0}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={onSave}>Save</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 ml-auto text-muted-foreground" onClick={resetToDefaults}>
          <RotateCcw className="w-3 h-3" /> Reset
        </Button>
      </div>
    </div>
  );
}
