import { Badge } from "@/components/ui/badge";
import {
  FOUNDATION_TEXT_FIELDS,
  NOTE_FIELDS,
  TEXT_FIELDS_LABELS,
  type BeautyProfile,
} from "@/lib/beautyProfile";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 pt-0.5">
      {items.map((i) => (
        <Badge key={i} variant="secondary" className="font-normal">
          {i}
        </Badge>
      ))}
    </div>
  );
}

/** Read-only rendering of a saved Beauty Profile. */
export default function BeautyProfileSummary({ profile }: { profile: BeautyProfile }) {
  const singles: Array<{ label: string; value?: string }> = [
    ...TEXT_FIELDS_LABELS.map((f) => ({ label: f.label, value: profile[f.key] as string | undefined })),
    { label: "Best time to reach me", value: profile.best_time },
    { label: "Best way to contact me", value: profile.best_contact },
    { label: "Social media", value: profile.social },
    { label: "Age Range", value: profile.age_range },
    { label: "If I don't use moisturizer, my skin feels", value: profile.moisturizer_feel },
    { label: "Preferred Foundation Coverage", value: profile.foundation_coverage },
    ...FOUNDATION_TEXT_FIELDS.map((f) => ({ label: f.label, value: profile[f.key] as string | undefined })),
  ];

  const multis: Array<{ label: string; value?: string[] }> = [
    { label: "Interested in learning more about", value: profile.interests },
    { label: "Primary Skin Care Needs", value: profile.primary_skin_care_needs },
    { label: "Other Skin Care Concerns/Needs", value: profile.other_skin_concerns },
    { label: "Eye Area Concerns/Needs", value: profile.eye_concerns },
    { label: "Lip Area Concerns", value: profile.lip_concerns },
  ];

  const refs = (profile.wish_list_referrals ?? []).filter((r) => r.name || r.relationship || r.contact);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {singles
          .filter((s) => (s.value || "").trim())
          .map((s) => (
            <Row key={s.label} label={s.label}>
              {s.value}
            </Row>
          ))}
      </div>

      {multis
        .filter((m) => m.value && m.value.length > 0)
        .map((m) => (
          <Row key={m.label} label={m.label}>
            <Chips items={m.value!} />
          </Row>
        ))}

      {refs.length > 0 && (
        <Row label="Product wish list shared with">
          <ul className="space-y-0.5 pt-0.5">
            {refs.map((r, i) => (
              <li key={i} className="text-foreground">
                {[r.name, r.relationship, r.contact].filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
        </Row>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {NOTE_FIELDS.filter((f) => ((profile[f.key] as string) || "").trim()).map((f) => (
          <div key={f.key as string} className={f.key === "general" ? "sm:col-span-2" : ""}>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</div>
            <div className="whitespace-pre-wrap text-foreground">{profile[f.key] as string}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
