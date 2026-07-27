// Career Chat "layering" sequence — Stephanie's real-world recruiting cadence.
// Each career-chat prospect records the most recent layer she used ("last touch")
// and the next one queued up ("next touch"). "Bold Ask" is the natural exit point
// where a prospect either joins or opts out.

export const CAREER_CHAT_LAYERS = [
  "Loves Product",
  "Sample Pack",
  "Hostess",
  "Watch Video",
  "Referrals",
  "Guest Event",
  "WWW Survey",
  "Skin Analyzer App",
  "Customer FB Group",
  "Pearl Girl",
  "Recruiting Packet",
  "Coffee",
  "Bold Ask",
] as const;

export type CareerChatLayer = (typeof CAREER_CHAT_LAYERS)[number];

export function nextLayerAfter(current?: string | null): CareerChatLayer {
  if (!current) return CAREER_CHAT_LAYERS[0];
  const idx = (CAREER_CHAT_LAYERS as readonly string[]).indexOf(current);
  if (idx === -1) return CAREER_CHAT_LAYERS[0];
  if (idx >= CAREER_CHAT_LAYERS.length - 1) return "Bold Ask";
  return CAREER_CHAT_LAYERS[idx + 1];
}

export const BOLD_ASK: CareerChatLayer = "Bold Ask";
