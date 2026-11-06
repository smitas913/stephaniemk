import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/lib/dateOnly";
import type { BeautyProfile } from "@/lib/beautyProfile";

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
        <Badge key={i} variant="secondary" className="font-normal">{i}</Badge>
      ))}
    </div>
  );
}

/** Read-only rendering of the simplified Beauty Profile. */
export default function BeautyProfileSummary({ profile }: { profile: BeautyProfile }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2">
        {profile.skin_type && <Row label="Skin Type">{profile.skin_type}</Row>}
        {profile.foundation_type && <Row label="Foundation Type">{profile.foundation_type}</Row>}
        {profile.foundation_shade && <Row label="Shade">{profile.foundation_shade}</Row>}
      </div>
      {profile.skin_concerns?.length ? <Row label="Main Skin Concerns"><Chips items={profile.skin_concerns} /></Row> : null}
      {profile.appointment_interests?.length ? (
        <Row label="Would enjoy at next appointment"><Chips items={profile.appointment_interests} /></Row>
      ) : null}
      {profile.notes && <Row label="Notes"><div className="whitespace-pre-wrap">{profile.notes}</div></Row>}
      {profile.profile_updated_at && (
        <p className="text-[11px] text-muted-foreground">Profile updated {formatDateOnly(profile.profile_updated_at)}</p>
      )}
    </div>
  );
}
