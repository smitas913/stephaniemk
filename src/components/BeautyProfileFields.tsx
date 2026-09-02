import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AGE_RANGE_OPTIONS,
  BEST_CONTACT_OPTIONS,
  BEST_TIME_OPTIONS,
  EYE_CONCERN_OPTIONS,
  FOUNDATION_COVERAGE_OPTIONS,
  FOUNDATION_TEXT_FIELDS,
  INTEREST_OPTIONS,
  LIP_CONCERN_OPTIONS,
  MOISTURIZER_FEEL_OPTIONS,
  NOTE_FIELDS,
  OTHER_SKIN_CONCERN_OPTIONS,
  PRIMARY_SKIN_CARE_NEEDS_OPTIONS,
  SOCIAL_OPTIONS,
  TEXT_FIELDS_LABELS,
  type BeautyProfile,
  type WishListReferral,
} from "@/lib/beautyProfile";

/** Tap-friendly single-select chip row. */
function ChipSingle({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(active ? "" : o)}
              className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Checkbox group for the card's multi-select lists. */
function CheckGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string[] | undefined;
  onChange: (v: string[]) => void;
}) {
  const selected = value ?? [];
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {options.map((o) => (
          <label key={o} className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={selected.includes(o)} onCheckedChange={() => toggle(o)} className="mt-0.5" />
            <span className="leading-snug">{o}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function BeautyProfileFields({
  value,
  onChange,
  showNotes = true,
}: {
  value: BeautyProfile;
  onChange: (next: BeautyProfile) => void;
  /** Free-text extras (favorite products, routine, etc.) — hidden on the scan review screen. */
  showNotes?: boolean;
}) {
  const set = (patch: Partial<BeautyProfile>) => onChange({ ...value, ...patch });

  const refs: WishListReferral[] = [0, 1].map((i) => value.wish_list_referrals?.[i] ?? {});
  const setRef = (i: number, patch: Partial<WishListReferral>) => {
    const next = [...refs];
    next[i] = { ...next[i], ...patch };
    set({ wish_list_referrals: next });
  };

  return (
    <div className="space-y-6">
      {/* ---------------- Front of card ---------------- */}
      <section className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Front of card</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEXT_FIELDS_LABELS.map((f) => (
            <div key={f.key as string}>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{f.label}</Label>
              <Input
                className="h-9"
                type={f.type || "text"}
                placeholder={f.placeholder}
                value={(value[f.key] as string) || ""}
                onChange={(e) => set({ [f.key]: e.target.value } as Partial<BeautyProfile>)}
              />
            </div>
          ))}
        </div>

        <ChipSingle label="Best time to reach me" options={BEST_TIME_OPTIONS} value={value.best_time} onChange={(v) => set({ best_time: v })} />
        <ChipSingle label="Best way to contact me" options={BEST_CONTACT_OPTIONS} value={value.best_contact} onChange={(v) => set({ best_contact: v })} />
        <ChipSingle label="Connect with me on social media" options={SOCIAL_OPTIONS} value={value.social} onChange={(v) => set({ social: v })} />

        <CheckGroup
          label="Interested in learning more about"
          options={INTEREST_OPTIONS}
          value={value.interests}
          onChange={(v) => set({ interests: v })}
        />

        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground block">
            Who can I share your product wish list with?
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Each name you fill in is added to the booking pipeline as a Referral lead when you save.
          </p>
          {refs.map((r, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input className="h-9" placeholder={`Name ${i + 1}`} value={r.name || ""} onChange={(e) => setRef(i, { name: e.target.value })} />
              <Input className="h-9" placeholder="Relationship" value={r.relationship || ""} onChange={(e) => setRef(i, { relationship: e.target.value })} />
              <Input className="h-9" placeholder="Contact information" value={r.contact || ""} onChange={(e) => setRef(i, { contact: e.target.value })} />
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Back of card ---------------- */}
      <section className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Back of card</h4>

        <ChipSingle label="Age Range" options={AGE_RANGE_OPTIONS} value={value.age_range} onChange={(v) => set({ age_range: v })} />
        <CheckGroup
          label="Primary Skin Care Needs"
          options={PRIMARY_SKIN_CARE_NEEDS_OPTIONS}
          value={value.primary_skin_care_needs}
          onChange={(v) => set({ primary_skin_care_needs: v })}
        />
        <ChipSingle
          label="If I don't use moisturizer, my skin feels"
          options={MOISTURIZER_FEEL_OPTIONS}
          value={value.moisturizer_feel}
          onChange={(v) => set({ moisturizer_feel: v })}
        />
        <CheckGroup
          label="Other Skin Care Concerns/Needs"
          options={OTHER_SKIN_CONCERN_OPTIONS}
          value={value.other_skin_concerns}
          onChange={(v) => set({ other_skin_concerns: v })}
        />
        <CheckGroup
          label="Eye Area Concerns/Needs"
          options={EYE_CONCERN_OPTIONS}
          value={value.eye_concerns}
          onChange={(v) => set({ eye_concerns: v })}
        />
        <CheckGroup
          label="Lip Area Concerns"
          options={LIP_CONCERN_OPTIONS}
          value={value.lip_concerns}
          onChange={(v) => set({ lip_concerns: v })}
        />
        <ChipSingle
          label="Preferred Foundation Coverage"
          options={FOUNDATION_COVERAGE_OPTIONS}
          value={value.foundation_coverage}
          onChange={(v) => set({ foundation_coverage: v })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FOUNDATION_TEXT_FIELDS.map((f) => (
            <div key={f.key as string}>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{f.label}</Label>
              <Input
                className="h-9"
                placeholder={f.placeholder}
                value={(value[f.key] as string) || ""}
                onChange={(e) => set({ [f.key]: e.target.value } as Partial<BeautyProfile>)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Extra notes ---------------- */}
      {showNotes && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your notes</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {NOTE_FIELDS.map((f) => (
              <div key={f.key as string} className={f.key === "general" ? "sm:col-span-2" : ""}>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">{f.label}</Label>
                <Textarea
                  className="min-h-[60px]"
                  placeholder={f.placeholder}
                  value={(value[f.key] as string) || ""}
                  onChange={(e) => set({ [f.key]: e.target.value } as Partial<BeautyProfile>)}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
