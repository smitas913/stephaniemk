import { createBookingLead } from "@/lib/queries";
import type { BeautyProfile, WishListReferral } from "@/lib/beautyProfile";

const isEmail = (s: string) => /\S+@\S+\.\S+/.test(s);
const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Push every filled-in "who can I share your product wish list with" entry into
 * the booking pipeline as a Referral lead, and stamp the created lead id back on
 * the profile entry so a later save never creates a duplicate.
 *
 * The lead record is the source of truth; the profile entry is just what was
 * written on the card. Never throws — a lead failure must not block the save.
 */
export async function syncWishListReferrals(
  profile: BeautyProfile,
  referredByName: string,
): Promise<{ profile: BeautyProfile; created: number }> {
  const list = profile.wish_list_referrals;
  if (!list || list.length === 0) return { profile, created: 0 };

  let created = 0;
  const next: WishListReferral[] = [];

  for (const r of list) {
    const name = (r.name || "").trim();
    const relationship = (r.relationship || "").trim();
    const contact = (r.contact || "").trim();
    if (!name && !relationship && !contact) continue;

    if (r.lead_id || !name) {
      next.push(r);
      continue;
    }

    try {
      const noteParts = [
        `Referral from ${referredByName || "a customer"}'s Beauty Profile wish list.`,
        relationship ? `Relationship: ${relationship}` : null,
        contact && !isEmail(contact) && digits(contact).length < 10 ? `Contact info as written: ${contact}` : null,
      ].filter(Boolean);

      const lead: any = await createBookingLead({
        name,
        lead_source: "Referral",
        status: "New Contact" as any,
        notes: noteParts.join("\n"),
        ...(isEmail(contact) ? { email: contact } : {}),
        ...(!isEmail(contact) && digits(contact).length >= 10 ? { phone: contact } : {}),
      });
      created += 1;
      next.push({ name, relationship, contact, lead_id: lead?.id });
    } catch {
      next.push({ name, relationship, contact });
    }
  }

  return { profile: { ...profile, wish_list_referrals: next }, created };
}
