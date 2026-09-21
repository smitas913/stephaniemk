import { describe, it, expect } from "vitest";
import {
  assignMatches,
  matchesForReceipt,
  scoreCandidate,
  merchantSimilarity,
} from "./receiptMatching";

const r = (id: string, date: string, amount: number, merchantKey = "target store") => ({
  id,
  date,
  amount,
  merchantKey,
});

describe("receiptMatching", () => {
  it("matches equal amounts within a cent as a strong match", () => {
    const m = scoreCandidate(r("r1", "2026-03-10", 42.5), r("c1", "2026-03-10", 42.5));
    expect(m?.kind).toBe("strong");
  });

  it("matches a charge up to 30% above the receipt total as tip-adjusted", () => {
    expect(scoreCandidate(r("r1", "2026-03-10", 20), r("c1", "2026-03-11", 24))?.kind).toBe("tip");
    // more than 30% over is not a match at all
    expect(scoreCandidate(r("r1", "2026-03-10", 20), r("c1", "2026-03-11", 27))).toBeNull();
  });

  it("respects the 5 day window", () => {
    expect(scoreCandidate(r("r1", "2026-03-10", 20), r("c1", "2026-03-15", 20))?.kind).toBe("strong");
    expect(scoreCandidate(r("r1", "2026-03-10", 20), r("c1", "2026-03-16", 20))).toBeNull();
  });

  it("scores closer dates and similar merchants higher", () => {
    const near = scoreCandidate(r("r1", "2026-03-10", 20, "costco whse"), r("c1", "2026-03-10", 20, "costco whse"))!;
    const far = scoreCandidate(r("r1", "2026-03-10", 20, "costco whse"), r("c2", "2026-03-14", 20, "shell oil"))!;
    expect(near.score).toBeGreaterThan(far.score);
    expect(merchantSimilarity("costco whse", "costco gas")).toBe(1);
    expect(merchantSimilarity("costco whse", "shell oil")).toBe(0);
  });

  it("assigns strictly one-to-one, best score first", () => {
    const receipts = [r("r1", "2026-03-10", 20, "target store"), r("r2", "2026-03-10", 20, "shell oil")];
    const charges = [r("c1", "2026-03-10", 20, "shell oil gas"), r("c2", "2026-03-12", 20, "target store")];
    const result = assignMatches(receipts, charges);
    expect(result).toHaveLength(2);
    expect(result.find((m) => m.receiptId === "r1")?.chargeId).toBe("c2");
    expect(result.find((m) => m.receiptId === "r2")?.chargeId).toBe("c1");
  });

  it("prefers a strong match over a tip-adjusted one for the same receipt", () => {
    const result = assignMatches(
      [r("r1", "2026-03-10", 20)],
      [r("c1", "2026-03-10", 24), r("c2", "2026-03-11", 20)],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ chargeId: "c2", kind: "strong" });
  });

  it("returns nothing when nothing matches", () => {
    expect(assignMatches([r("r1", "2026-03-10", 20)], [r("c1", "2026-05-01", 99)])).toEqual([]);
    expect(matchesForReceipt(r("r1", "2026-03-10", 20), [])).toEqual([]);
  });
});
