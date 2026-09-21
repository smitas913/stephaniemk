/**
 * Shared, pure matching logic between scanned receipts and bank/credit-card
 * statement charges. Used by BOTH directions:
 *   - statement imported after receipts were scanned (src/pages/Expenses.tsx import review)
 *   - receipt scanned after a statement was imported (receipt scan review)
 *
 * No I/O here on purpose so it stays unit-testable.
 */
import { parseLocalDate } from "@/lib/dateOnly";

export const MATCH_MAX_DAYS = 5;
/** A charge may exceed the receipt total by up to 30% (restaurant tips). */
export const MATCH_TIP_MAX_RATIO = 1.3;
const CENT = 0.01;

export type MatchKind = "strong" | "tip";

export type MatchableReceipt = {
  id: string;
  /** Normalized merchant key (see normalizeMerchantKey). */
  merchantKey: string;
  /** Local date-only string, YYYY-MM-DD. */
  date: string;
  amount: number;
};

export type MatchableCharge = MatchableReceipt;

export type MatchCandidate = {
  receiptId: string;
  chargeId: string;
  kind: MatchKind;
  score: number;
  daysApart: number;
};

export const daysBetween = (a: string, b: string): number =>
  Math.abs(
    Math.round(
      (parseLocalDate(String(a).slice(0, 10)).getTime() -
        parseLocalDate(String(b).slice(0, 10)).getTime()) /
        86_400_000,
    ),
  );

const tokens = (key: string): string[] =>
  (key || "").split(" ").filter((t) => t.length > 2);

/** 0..1 similarity between two normalized merchant keys. */
export const merchantSimilarity = (a: string, b: string): number => {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  if (ta[0] === tb[0]) return 1;
  const shared = ta.filter((t) => tb.includes(t)).length;
  if (shared === 0) return 0;
  return Math.min(0.9, shared / Math.max(ta.length, tb.length));
};

/**
 * Returns the candidate match for one receipt/charge pair, or null when the
 * pair can't be a match at all (outside the date window or wrong amounts).
 */
export const scoreCandidate = (
  receipt: MatchableReceipt,
  charge: MatchableCharge,
): MatchCandidate | null => {
  if (!receipt.date || !charge.date) return null;
  if (!(receipt.amount > 0) || !(charge.amount > 0)) return null;
  const days = daysBetween(receipt.date, charge.date);
  if (days > MATCH_MAX_DAYS) return null;

  const diff = Math.abs(charge.amount - receipt.amount);
  let kind: MatchKind;
  if (diff <= CENT) {
    kind = "strong";
  } else if (
    charge.amount > receipt.amount &&
    charge.amount <= receipt.amount * MATCH_TIP_MAX_RATIO + CENT
  ) {
    kind = "tip";
  } else {
    return null;
  }

  const dateScore = (MATCH_MAX_DAYS - days) / MATCH_MAX_DAYS; // 1 = same day
  const similarity = merchantSimilarity(receipt.merchantKey, charge.merchantKey);
  const score =
    (kind === "strong" ? 100 : 40) + dateScore * 20 + similarity * 25;

  return { receiptId: receipt.id, chargeId: charge.id, kind, score, daysApart: days };
};

/** Every possible pair, best score first. */
export const buildCandidates = (
  receipts: MatchableReceipt[],
  charges: MatchableCharge[],
): MatchCandidate[] => {
  const out: MatchCandidate[] = [];
  for (const r of receipts) {
    for (const c of charges) {
      const candidate = scoreCandidate(r, c);
      if (candidate) out.push(candidate);
    }
  }
  return out.sort((a, b) => b.score - a.score || a.daysApart - b.daysApart);
};

/**
 * Strictly one-to-one greedy assignment. Tip-adjusted pairs are only allowed
 * when neither side has any strong candidate available.
 */
export const assignMatches = (
  receipts: MatchableReceipt[],
  charges: MatchableCharge[],
): MatchCandidate[] => {
  const all = buildCandidates(receipts, charges);
  const strongReceipts = new Set(all.filter((c) => c.kind === "strong").map((c) => c.receiptId));
  const strongCharges = new Set(all.filter((c) => c.kind === "strong").map((c) => c.chargeId));
  const allowed = all.filter(
    (c) =>
      c.kind === "strong" ||
      (!strongReceipts.has(c.receiptId) && !strongCharges.has(c.chargeId)),
  );

  const usedReceipts = new Set<string>();
  const usedCharges = new Set<string>();
  const result: MatchCandidate[] = [];
  for (const c of allowed) {
    if (usedReceipts.has(c.receiptId) || usedCharges.has(c.chargeId)) continue;
    usedReceipts.add(c.receiptId);
    usedCharges.add(c.chargeId);
    result.push(c);
  }
  return result;
};

/**
 * Candidates for a single freshly scanned receipt against existing charges,
 * best first. Tip-adjusted candidates are dropped when a strong one exists.
 */
export const matchesForReceipt = (
  receipt: MatchableReceipt,
  charges: MatchableCharge[],
): MatchCandidate[] => {
  const all = buildCandidates([receipt], charges);
  const strong = all.filter((c) => c.kind === "strong");
  return strong.length > 0 ? strong : all;
};
