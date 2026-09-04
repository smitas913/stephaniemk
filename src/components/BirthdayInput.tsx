import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTH_LABELS, type BirthdayValue } from "@/lib/birthday";

/**
 * Birthday entry that works whether or not the year is known.
 * "I know the year" saves a full date; "Just month & day" saves month/day only.
 */
export default function BirthdayInput({
  value,
  onChange,
  label = "Birthday",
  className,
}: {
  value: BirthdayValue;
  onChange: (next: BirthdayValue) => void;
  label?: string;
  className?: string;
}) {
  const set = (patch: Partial<BirthdayValue>) => onChange({ ...value, ...patch });

  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
        {([
          { mode: "full" as const, text: "I know the year" },
          { mode: "month-day" as const, text: "Just month & day" },
        ]).map((o) => {
          const active = value.mode === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              onClick={() => set({ mode: o.mode })}
              className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {o.text}
            </button>
          );
        })}
      </div>

      {value.mode === "full" ? (
        <Input
          type="date"
          className="h-9"
          value={value.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Select value={value.month} onValueChange={(v) => set({ month: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={value.day} onValueChange={(v) => set({ day: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Day" /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <SelectItem key={d} value={String(d)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
