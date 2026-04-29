/**
 * Intent-based categorization for follow-up activities.
 *
 * Activities are categorized by the user's selected intent (Follow-Up Reason),
 * NOT by the person type they are interacting with. This ensures, for example,
 * that an event "Post-Event Follow-Up" lands in Coaching while a generic
 * check-in with the same hostess lands in Follow-Up.
 *
 * If no specific intent is selected, the activity defaults to Follow-Up.
 */

export type IntentCategory =
  | "Follow-Up"
  | "Booking"
  | "Coaching"
  | "Recruiting"
  | "Team Building";

export const INTENT_CATEGORIES: IntentCategory[] = [
  "Follow-Up",
  "Booking",
  "Coaching",
  "Recruiting",
  "Team Building",
];

/**
 * Reasons grouped by their resulting category. The reason → category mapping
 * is intentional and explicit so that (a) the UI can render reasons under
 * the right header and (b) the same reason text always lands in the same
 * category regardless of who triggered it.
 */
export const REASONS_BY_CATEGORY: Record<IntentCategory, string[]> = {
  "Follow-Up": [
    "General Check-In",
    "Trial / Sample Follow-Up",
    "Product Check-In",
    "Post-Appointment Follow-Up",
    "Relationship Touch",
    "Birthday Reach-Out",
    "Catalog Follow-Up",
  ],
  Booking: ["Booking Ask", "Rescheduling"],
  Coaching: ["Hostess Coaching", "Event Prep", "Event Reminder", "Event Follow-Up", "Post-Event Follow-Up"],
  Recruiting: ["Initial Outreach", "Interview / Info Shared", "Recruiting Follow-Up"],
  "Team Building": ["Coaching", "Accountability", "Training / Support"],
};

// Build the reverse lookup once.
const REASON_TO_CATEGORY: Record<string, IntentCategory> = (() => {
  const map: Record<string, IntentCategory> = {};
  for (const cat of INTENT_CATEGORIES) {
    for (const reason of REASONS_BY_CATEGORY[cat]) {
      map[reason.toLowerCase()] = cat;
    }
  }
  return map;
})();

/**
 * Resolve an intent string (the user-selected follow-up reason or any free-text
 * label found on a note) to one of the 5 canonical categories.
 *
 * Rules:
 *  - Empty / null / unknown → "Follow-Up" (the safe default).
 *  - Coaching reasons (Hostess Coaching, Event Prep, Event Follow-Up, etc.) → Coaching.
 *  - Booking Ask / Rescheduling → Booking.
 *  - Recruiting outreach to prospects → Recruiting.
 *  - Consultant coaching/accountability/training → Team Building.
 *  - Anything else (general check-ins, product, birthdays, etc.) → Follow-Up.
 */
export function resolveIntentCategory(reason?: string | null): IntentCategory {
  if (!reason) return "Follow-Up";
  const key = reason.trim().toLowerCase();
  if (!key) return "Follow-Up";
  const direct = REASON_TO_CATEGORY[key];
  if (direct) return direct;

  // Loose substring matching to absorb legacy / freeform reasons like
  // "Booking Lead - Facebook" or "Hostess Coaching — F1".
  if (key.includes("booking") || key.includes("reschedul")) return "Booking";
  if (key.includes("hostess") || key.includes("event prep") || key.includes("event reminder") || key.includes("event follow") || key.includes("post-event")) return "Coaching";
  if (key.includes("recruit") || key.includes("interview") || key.includes("info shared")) return "Recruiting";
  if (key.includes("accountab") || key.includes("training") || key.includes("team building") || key === "coaching") return "Team Building";
  return "Follow-Up";
}

export const CATEGORY_TAG_PREFIX = "category:";

export function categoryTag(category: IntentCategory): string {
  return `${CATEGORY_TAG_PREFIX}${category}`;
}

/**
 * Inspect a note's tags array (and fall back to its note_body / note_type) to
 * extract the canonical category. Returns null if no category-bearing
 * information is present, so callers can apply legacy fallback logic.
 */
export function readCategoryFromTags(tags?: string[] | null): IntentCategory | null {
  if (!tags || !Array.isArray(tags)) return null;
  for (const t of tags) {
    if (typeof t === "string" && t.startsWith(CATEGORY_TAG_PREFIX)) {
      const value = t.slice(CATEGORY_TAG_PREFIX.length).trim();
      if ((INTENT_CATEGORIES as string[]).includes(value)) return value as IntentCategory;
    }
  }
  return null;
}

/**
 * Extract a category from a note. Prefers the explicit `category:` tag, then
 * tries to derive one from the bracketed `[Reason]` prefix in note_body, and
 * finally falls back to "Follow-Up".
 */
export function deriveCategoryFromNote(note: { tags?: string[] | null; note_body?: string | null }): IntentCategory {
  const tagged = readCategoryFromTags(note.tags);
  if (tagged) return tagged;
  const body = note.note_body || "";
  const match = body.match(/^\s*\[([^\]]+)\]/);
  if (match) return resolveIntentCategory(match[1]);
  return "Follow-Up";
}
