import { describe, it, expect } from "vitest";
import { computeOrderFinancials } from "@/lib/financialSettings";
import { myShopMonthlyCost } from "@/pages/Register";
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

describe("computeOrderFinancials with CDS shipping", () => {
  const base = {
    orderTotal: 100,
    discount: 0,
    taxRate: 0,
    profitMarginRate: 50,
    isCreditCard: false,
  };

  it("margin path subtracts shipping from profit only", () => {
    const noShip = computeOrderFinancials(base);
    const ship = computeOrderFinancials({ ...base, shipping: 5.95 });
    expect(noShip.netProfit).toBe(50);
    expect(ship.netProfit).toBe(44.05);
    expect(ship.netReceived).toBe(noShip.netReceived);
    expect(ship.finalTotal).toBe(noShip.finalTotal);
    expect(ship.shipping).toBe(5.95);
  });

  it("wholesale path subtracts shipping from profit only", () => {
    const noShip = computeOrderFinancials({ ...base, wholesale: 50 });
    const ship = computeOrderFinancials({ ...base, wholesale: 50, shipping: 5.95 });
    expect(noShip.netProfit).toBe(50);
    expect(ship.netProfit).toBe(44.05);
    expect(ship.netReceived).toBe(noShip.netReceived);
  });
});

describe("MyShop monthly product cost", () => {
  it("uses wholesale when present and the margin fallback otherwise", () => {
    const byMonth = myShopMonthlyCost(
      [
        { order_date: "2026-03-04", retail_amount: 100, discount_amount: 0, wholesale_amount: 48 },
        { order_date: "2026-03-20", retail_amount: 200, discount_amount: 20, wholesale_amount: null },
        { order_date: "2026-04-01", retail_amount: 50, discount_amount: 0, wholesale_amount: null },
      ],
      50,
    );
    expect(byMonth.get("2026-03")).toBe(138); // 48 + 90
    expect(byMonth.get("2026-04")).toBe(25);
  });
});

describe("MyShop payout / CDS charge matching", () => {
  it("links a deposit to the MyShop order it pays out, never before the order", () => {
    const matches = assignMatches(
      [{ id: "order", date: "2026-03-01", amount: 52, merchantKey: "" }],
      [
        { id: "early", date: "2026-02-20", amount: 52, merchantKey: "" },
        { id: "payout", date: "2026-03-25", amount: 52, merchantKey: "" },
      ],
      { maxDays: 60, requireChargeOnOrAfter: true },
    );
    expect(matches.map((m) => m.chargeId)).toEqual(["payout"]);
  });

  it("links a CDS shipping charge within 7 days of the order", () => {
    const matches = assignMatches(
      [{ id: "cds", date: "2026-03-01", amount: 5.95, merchantKey: "" }],
      [
        { id: "charge", date: "2026-03-06", amount: 5.95, merchantKey: "" },
        { id: "far", date: "2026-03-20", amount: 5.95, merchantKey: "" },
      ],
      { maxDays: 7 },
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].chargeId).toBe("charge");
    expect(matches[0].kind).toBe("strong");
  });
});
