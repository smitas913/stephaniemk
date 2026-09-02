/**
 * Digital version of the printed Mary Kay Beauty Profile card
 * (©2025 Mary Kay Inc., form 10-260112).
 *
 * Stored in the existing `beauty_notes` jsonb column on `customers` and, for
 * consistency, on `facial_contacts`. Field names/option sets mirror the card
 * exactly so a scan or a manual entry can be added "as is".
 *
 * Name / birthday / address / email / phone live on the person record itself
 * and are deliberately NOT duplicated here.
 */

export const BEST_TIME_OPTIONS = ["AM", "PM"] as const;
export const BEST_CONTACT_OPTIONS = ["Call", "Text", "Email"] as const;
export const SOCIAL_OPTIONS = ["Facebook", "Instagram", "None"] as const;

export const INTEREST_OPTIONS = [
  "Additional skin care options",
  "Color application techniques",
  "Earning hostess rewards",
  "Earning extra money",
  "Fragrance and body care",
  "Men's products",
  "Gift-giving services",
  "Wedding services",
] as const;

export const AGE_RANGE_OPTIONS = ["20 and under", "20s–30s", "40s–50s", "60s–70s", "80s+"] as const;

export const PRIMARY_SKIN_CARE_NEEDS_OPTIONS = [
  "No aging concerns/Sensitive skin",
  "Early-to-moderate signs of aging",
  "Advanced signs of aging",
  "Mild-to-moderate acne",
] as const;

export const MOISTURIZER_FEEL_OPTIONS = [
  "Dry/tight",
  "Neither dry nor oily",
  "Oily",
  "Oily in the T-zone",
] as const;

export const OTHER_SKIN_CONCERN_OPTIONS = [
  "More even-/radiant-looking skin",
  "Improved skin texture",
  "Skin firmness and resilience",
  "Extra hydration",
  "Wrinkles and expression lines",
  "Large-looking pores",
  "Excess oil",
  "Maximum hydration/extremely dry skin",
] as const;

export const EYE_CONCERN_OPTIONS = [
  "Deep wrinkles puffiness and sagging",
  "Fine lines and wrinkles",
  "Tired- and puffy-looking",
  "Gentle makeup remover",
] as const;

export const LIP_CONCERN_OPTIONS = ["Fine lines and wrinkles", "Dry lips"] as const;

export const FOUNDATION_COVERAGE_OPTIONS = ["Light", "Medium/Full"] as const;

/**
 * A person the customer is happy to have her product wish list shared with —
 * i.e. someone who might buy her a gift. Stored as written on the card; these
 * are NOT business referrals and never enter the booking/lead pipeline.
 */
export type WishListReferral = {
  name?: string;
  relationship?: string;
  contact?: string;
};

export type BeautyProfile = {
  // --- Front of card ---
  hostess?: string;
  date?: string;
  anniversary?: string;
  occupation?: string;
  best_time?: string;
  best_contact?: string;
  social?: string;
  interests?: string[];
  wish_list_referrals?: WishListReferral[];

  // --- Back of card ---
  age_range?: string;
  primary_skin_care_needs?: string[];
  moisturizer_feel?: string;
  other_skin_concerns?: string[];
  eye_concerns?: string[];
  lip_concerns?: string[];
  foundation_coverage?: string;
  foundation_type?: string;
  /** Labeled "Shade" on the card — existing key, kept as-is. */
  foundation_shade?: string;

  // --- Free-text notes carried over from the previous Beauty Notes card ---
  favorite_products?: string;
  skincare_routine?: string;
  color_preferences?: string;
  sensitivities?: string;
  general?: string;
};

export const SINGLE_SELECT_FIELDS = {
  best_time: BEST_TIME_OPTIONS,
  best_contact: BEST_CONTACT_OPTIONS,
  social: SOCIAL_OPTIONS,
  age_range: AGE_RANGE_OPTIONS,
  moisturizer_feel: MOISTURIZER_FEEL_OPTIONS,
  foundation_coverage: FOUNDATION_COVERAGE_OPTIONS,
} as const;

export const MULTI_SELECT_FIELDS = {
  interests: INTEREST_OPTIONS,
  primary_skin_care_needs: PRIMARY_SKIN_CARE_NEEDS_OPTIONS,
  other_skin_concerns: OTHER_SKIN_CONCERN_OPTIONS,
  eye_concerns: EYE_CONCERN_OPTIONS,
  lip_concerns: LIP_CONCERN_OPTIONS,
} as const;

export const TEXT_FIELDS_LABELS: Array<{ key: keyof BeautyProfile; label: string; type?: string; placeholder?: string; long?: boolean }> = [
  { key: "hostess", label: "Hostess", placeholder: "Who hosted this event" },
  { key: "date", label: "Date", type: "date" },
  { key: "anniversary", label: "Anniversary", type: "date" },
  { key: "occupation", label: "Occupation" },
];

export const FOUNDATION_TEXT_FIELDS: Array<{ key: keyof BeautyProfile; label: string; placeholder?: string }> = [
  { key: "foundation_type", label: "Foundation Type", placeholder: "e.g. TimeWise 3D Matte" },
  { key: "foundation_shade", label: "Shade", placeholder: "e.g. Beige 3, Ivory 100" },
];

export const NOTE_FIELDS: Array<{ key: keyof BeautyProfile; label: string; placeholder: string }> = [
  { key: "favorite_products", label: "Favorite Products", placeholder: "e.g. TimeWise Repair, CC Cream" },
  { key: "skincare_routine", label: "Skincare Routine", placeholder: "Cleanser, serum, moisturizer…" },
  { key: "color_preferences", label: "Color Preferences", placeholder: "e.g. warm tones, red lipstick" },
  { key: "sensitivities", label: "Sensitivities / Avoid", placeholder: "e.g. fragrance, sensitive skin" },
  { key: "general", label: "General Notes", placeholder: "Anything else worth remembering" },
];

const SINGLE_KEYS = Object.keys(SINGLE_SELECT_FIELDS) as Array<keyof typeof SINGLE_SELECT_FIELDS>;
const MULTI_KEYS: Array<keyof BeautyProfile> = [
  "interests",
  "primary_skin_care_needs",
  "other_skin_concerns",
  "eye_concerns",
  "lip_concerns",
];

/** Read whatever is in `beauty_notes` and coerce it into a valid BeautyProfile. */
export function parseBeautyProfile(raw: unknown): BeautyProfile {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: BeautyProfile = {};

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  for (const f of [...TEXT_FIELDS_LABELS, ...FOUNDATION_TEXT_FIELDS, ...NOTE_FIELDS]) {
    const v = str(src[f.key as string]);
    if (v) (out as any)[f.key] = v;
  }

  for (const key of SINGLE_KEYS) {
    const v = str(src[key]);
    if (v && (SINGLE_SELECT_FIELDS[key] as readonly string[]).includes(v)) (out as any)[key] = v;
  }

  for (const key of MULTI_KEYS) {
    const v = src[key as string];
    const allowed = (MULTI_SELECT_FIELDS as any)[key] as readonly string[] | undefined;
    if (Array.isArray(v)) {
      const list = v.map((x) => str(x)).filter((x) => x && (!allowed || allowed.includes(x)));
      if (list.length) (out as any)[key] = list;
    }
  }

  const refs = src.wish_list_referrals;
  if (Array.isArray(refs)) {
    const list: WishListReferral[] = refs
      .slice(0, 2)
      .map((r) => {
        const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
        return {
          name: str(o.name),
          relationship: str(o.relationship),
          contact: str(o.contact),
        };
      })
      .filter((r) => r.name || r.relationship || r.contact);
    if (list.length) out.wish_list_referrals = list;
  }

  return out;
}

/** Strip empty values so we never persist noise. */
export function cleanBeautyProfile(p: BeautyProfile): BeautyProfile {
  const out: BeautyProfile = {};
  (Object.keys(p) as Array<keyof BeautyProfile>).forEach((k) => {
    const v = p[k];
    if (k === "wish_list_referrals") {
      const list = (v as WishListReferral[] | undefined)?.filter(
        (r) => (r.name || "").trim() || (r.relationship || "").trim() || (r.contact || "").trim(),
      );
      if (list && list.length) out.wish_list_referrals = list.slice(0, 2);
      return;
    }
    if (Array.isArray(v)) {
      const list = v.filter((x) => typeof x === "string" && x.trim());
      if (list.length) (out as any)[k] = list;
      return;
    }
    if (typeof v === "string" && v.trim()) (out as any)[k] = v.trim();
  });
  return out;
}

export function isBeautyProfileEmpty(p: BeautyProfile): boolean {
  return Object.keys(cleanBeautyProfile(p)).length === 0;
}

/** Everything in the profile as one lowercase string, for free-text search. */
export function beautyProfileSearchText(raw: unknown): string {
  const p = parseBeautyProfile(raw);
  const parts: string[] = [];
  (Object.keys(p) as Array<keyof BeautyProfile>).forEach((k) => {
    const v = p[k];
    if (k === "wish_list_referrals") {
      (v as WishListReferral[]).forEach((r) => parts.push(r.name || "", r.relationship || "", r.contact || ""));
    } else if (Array.isArray(v)) parts.push(...(v as string[]));
    else if (typeof v === "string") parts.push(v);
  });
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Coarse skin-type label derived from the moisturizer-feel answer. Used only to
 * keep the Facial Contacts list column and filter working — the Beauty Profile
 * is the single source of truth on the profile itself.
 */
export function derivedSkinType(p: BeautyProfile): string | null {
  switch (p.moisturizer_feel) {
    case "Dry/tight":
    case "Neither dry nor oily":
      return "Normal to Dry";
    case "Oily":
    case "Oily in the T-zone":
      return "Combination to Oily";
    default:
      return null;
  }
}

/** Map a loose AI/legacy skin-type guess onto a moisturizer-feel option. */
export function moisturizerFeelFromLoose(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  const exact = MOISTURIZER_FEEL_OPTIONS.find((o) => o.toLowerCase() === s);
  if (exact) return exact;
  if (/t-?zone|combo|combination/.test(s)) return "Oily in the T-zone";
  if (/oily/.test(s)) return "Oily";
  if (/dry|tight/.test(s)) return "Dry/tight";
  if (/normal/.test(s)) return "Neither dry nor oily";
  return null;
}

/** Keep only allowed options from a loose AI-provided list. */
export function pickAllowed(values: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(values)) return [];
  const lower = new Map(allowed.map((a) => [a.toLowerCase(), a]));
  const out: string[] = [];
  for (const v of values) {
    const hit = lower.get(String(v ?? "").trim().toLowerCase());
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/** Keep a single loose value only if it matches one of the allowed options. */
export function pickOne(value: unknown, allowed: readonly string[]): string {
  const s = String(value ?? "").trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === s) || "";
}

/** Normalize a whole AI-extracted beauty profile onto the exact option sets. */
export function normalizeExtractedBeautyProfile(raw: unknown): BeautyProfile {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p: BeautyProfile = {};
  const str = (v: unknown) => String(v ?? "").trim();

  for (const f of [...TEXT_FIELDS_LABELS, ...FOUNDATION_TEXT_FIELDS]) {
    const v = str(src[f.key as string]);
    if (v) (p as any)[f.key] = v;
  }
  p.best_time = pickOne(src.best_time, BEST_TIME_OPTIONS);
  p.best_contact = pickOne(src.best_contact, BEST_CONTACT_OPTIONS);
  p.social = pickOne(src.social, SOCIAL_OPTIONS);
  p.age_range = pickOne(src.age_range, AGE_RANGE_OPTIONS);
  p.moisturizer_feel = moisturizerFeelFromLoose(str(src.moisturizer_feel)) || "";
  p.foundation_coverage = pickOne(src.foundation_coverage, FOUNDATION_COVERAGE_OPTIONS);
  p.interests = pickAllowed(src.interests, INTEREST_OPTIONS);
  p.primary_skin_care_needs = pickAllowed(src.primary_skin_care_needs, PRIMARY_SKIN_CARE_NEEDS_OPTIONS);
  p.other_skin_concerns = pickAllowed(src.other_skin_concerns, OTHER_SKIN_CONCERN_OPTIONS);
  p.eye_concerns = pickAllowed(src.eye_concerns, EYE_CONCERN_OPTIONS);
  p.lip_concerns = pickAllowed(src.lip_concerns, LIP_CONCERN_OPTIONS);

  const refs = src.wish_list_referrals;
  if (Array.isArray(refs)) {
    p.wish_list_referrals = refs.slice(0, 2).map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return { name: str(o.name), relationship: str(o.relationship), contact: str(o.contact) };
    });
  }

  return cleanBeautyProfile(p);
}
