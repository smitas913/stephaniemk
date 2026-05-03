// US state name → 2-letter abbreviation.
const STATE_MAP: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC", "puerto rico": "PR",
};

const VALID_ABBR = new Set(Object.values(STATE_MAP));

/** Normalize any state input to a 2-letter uppercase abbreviation when possible.
 *  Returns the original (trimmed) value untouched if it can't be normalized. */
export function normalizeStateAbbreviation(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && VALID_ABBR.has(upper)) return upper;
  const lower = trimmed.toLowerCase();
  if (STATE_MAP[lower]) return STATE_MAP[lower];
  return trimmed;
}
