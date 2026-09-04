export const SCRIPT_CATEGORIES = [
  "Customer Follow-Up",
  "Booking",
  "Recruiting",
  "Hostess Coaching",
  "Consultant Coaching",
  "Reorders",
  "Reactivation",
  "Relationship Touches",
  "Promotions / Seasonal",
  "Email Scripts",
  "Call Scripts",
  "Voicemail Scripts",
] as const;

export type ScriptCategory = (typeof SCRIPT_CATEGORIES)[number];

export const MERGE_FIELDS = [
  "{first_name}",
  "{product}",
  "{event_date}",
  "{hostess_name}",
] as const;

/** Map context types to relevant script categories */
export const CONTEXT_CATEGORY_MAP: Record<string, ScriptCategory[]> = {
  customer: ["Customer Follow-Up", "Reorders", "Reactivation", "Relationship Touches", "Promotions / Seasonal"],
  prospect: ["Recruiting"],
  hostess: ["Hostess Coaching", "Booking"],
  consultant: ["Consultant Coaching"],
  lead: ["Booking"],
  event_task: ["Hostess Coaching", "Booking"],
};
