import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  APPOINTMENT_INTEREST_OPTIONS,
  SKIN_CONCERN_OPTIONS,
  SKIN_TYPE_OPTIONS,
  type BeautyProfile,
} from "@/lib/beautyProfile";
import { toLocalDateKey } from "@/lib/dateOnly";

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

function ChipSingle({ label, options, value, onChange }: {
  label: string; options: readonly string[]; value: string | undefined; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o} label={o} active={value === o} onClick={() => onChange(value === o ? "" : o)} />
        ))}
      </div>
    </div>
  );
}

function ChipMulti({ label, options, value, onChange }: {
  label: string; options: readonly string[]; value: string[] | undefined; onChange: (v: string[]) => void;
}) {
  const selected = value ?? [];
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip
            key={o}
            label={o}
            active={selected.includes(o)}
            onClick={() => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o])}
          />
        ))}
      </div>
    </div>
  );
}

/** Simplified Beauty Profile matching the paper card. */
export default function BeautyProfileFields({
  value,
  onChange,
  showNotes = true,
}: {
  value: BeautyProfile;
  onChange: (next: BeautyProfile) => void;
  showNotes?: boolean;
}) {
  const set = (patch: Partial<BeautyProfile>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Text OK</Label>
          <div className="flex flex-wrap gap-1.5">
            {(["Y", "N"] as const).map((o) => (
              <Chip key={o} label={o} active={value.text_ok === o} onClick={() => set({ text_ok: value.text_ok === o ? "" : o })} />
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Date</Label>
          <Input type="date" className="h-9" value={value.profile_date || toLocalDateKey()} onChange={(e) => set({ profile_date: e.target.value })} />
        </div>
      </div>
      <ChipSingle label="Skin Type" options={SKIN_TYPE_OPTIONS} value={value.skin_type} onChange={(v) => set({ skin_type: v })} />
      <ChipMulti label="Main Skin Concerns" options={SKIN_CONCERN_OPTIONS} value={value.skin_concerns} onChange={(v) => set({ skin_concerns: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Foundation Type</Label>
          <Input className="h-9" placeholder="e.g. TimeWise 3D Matte" value={value.foundation_type || ""} onChange={(e) => set({ foundation_type: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Shade</Label>
          <Input className="h-9" placeholder="e.g. Beige 3, Ivory 100" value={value.foundation_shade || ""} onChange={(e) => set({ foundation_shade: e.target.value })} />
        </div>
      </div>
      <ChipMulti
        label="What would you enjoy at your next appointment"
        options={APPOINTMENT_INTEREST_OPTIONS}
        value={value.appointment_interests}
        onChange={(v) => set({ appointment_interests: v })}
      />
      {showNotes && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</Label>
          <Textarea className="min-h-[70px]" value={value.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
        </div>
      )}
    </div>
  );
}
