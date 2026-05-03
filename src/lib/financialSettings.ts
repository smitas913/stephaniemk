import { supabase } from "@/integrations/supabase/client";

export type PaymentProcessor = "Square" | "Stripe" | "PayPal" | "Custom";
export type CcTransactionType = "in_person" | "online" | "keyed";

export type FinancialSettings = {
  user_id: string;
  tax_rate: number;
  cc_fee_rate: number; // legacy fallback (%)
  profit_margin_rate: number;
  payment_processor: PaymentProcessor;
  fee_in_person_pct: number;
  fee_in_person_flat: number;
  fee_online_pct: number;
  fee_online_flat: number;
  fee_keyed_pct: number;
  fee_keyed_flat: number;
};

export const PROCESSOR_PRESETS: Record<PaymentProcessor, {
  in_person_pct: number; in_person_flat: number;
  online_pct: number; online_flat: number;
  keyed_pct: number; keyed_flat: number;
}> = {
  Square: {
    in_person_pct: 2.6, in_person_flat: 0.15,
    online_pct: 3.3, online_flat: 0.30,
    keyed_pct: 3.5, keyed_flat: 0.15,
  },
  Stripe: {
    in_person_pct: 2.7, in_person_flat: 0.05,
    online_pct: 2.9, online_flat: 0.30,
    keyed_pct: 3.4, keyed_flat: 0.30,
  },
  PayPal: {
    in_person_pct: 2.29, in_person_flat: 0.09,
    online_pct: 3.49, online_flat: 0.49,
    keyed_pct: 3.49, keyed_flat: 0.09,
  },
  Custom: {
    in_person_pct: 0, in_person_flat: 0,
    online_pct: 0, online_flat: 0,
    keyed_pct: 0, keyed_flat: 0,
  },
};

export const TRANSACTION_TYPE_LABELS: Record<CcTransactionType, string> = {
  in_person: "In-person card",
  online: "Online / invoice",
  keyed: "Manually entered card",
};

export const DEFAULT_FINANCIAL_SETTINGS: Omit<FinancialSettings, "user_id"> = {
  tax_rate: 0,
  cc_fee_rate: 0,
  profit_margin_rate: 50,
  payment_processor: "Custom",
  fee_in_person_pct: 0,
  fee_in_person_flat: 0,
  fee_online_pct: 0,
  fee_online_flat: 0,
  fee_keyed_pct: 0,
  fee_keyed_flat: 0,
};

export async function fetchFinancialSettings(): Promise<FinancialSettings | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data, error } = await (supabase as any)
    .from("financial_settings")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as FinancialSettings) || { user_id: uid, ...DEFAULT_FINANCIAL_SETTINGS };
}

export async function upsertFinancialSettings(values: Partial<Omit<FinancialSettings, "user_id">>) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const { error } = await (supabase as any)
    .from("financial_settings")
    .upsert({ user_id: uid, ...values }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Pick the configured percentage + flat fee for a given transaction type. */
export function getProcessorFee(
  settings: Pick<FinancialSettings,
    "fee_in_person_pct" | "fee_in_person_flat" |
    "fee_online_pct" | "fee_online_flat" |
    "fee_keyed_pct" | "fee_keyed_flat" | "cc_fee_rate"
  > | null | undefined,
  txType: CcTransactionType | null | undefined
): { pct: number; flat: number } {
  if (!settings) return { pct: 0, flat: 0 };
  switch (txType) {
    case "in_person": return { pct: +settings.fee_in_person_pct || 0, flat: +settings.fee_in_person_flat || 0 };
    case "online":    return { pct: +settings.fee_online_pct || 0,    flat: +settings.fee_online_flat || 0 };
    case "keyed":     return { pct: +settings.fee_keyed_pct || 0,     flat: +settings.fee_keyed_flat || 0 };
    default:
      // Fall back to legacy single % rate when no transaction type is selected.
      return { pct: +settings.cc_fee_rate || 0, flat: 0 };
  }
}

/**
 * Tax = Order Total (retail, pre-discount) × tax%
 * Final Total = Order Total - Discount + Tax
 * CC Fee = Final Total × pct% + flat   (only when paying by Credit Card / processor)
 *           Manual override wins when provided.
 * Net Revenue = Final Total - Tax - CC Fee  (tax is pass-through, not income)
 * Net Profit = Net Revenue × profit margin %
 */
export function computeOrderFinancials(input: {
  orderTotal: number;
  discount: number;
  taxRate: number;
  profitMarginRate: number;
  isCreditCard: boolean;
  // Either pass per-tx pct/flat...
  ccFeePct?: number;
  ccFeeFlat?: number;
  // ...or legacy single %.
  ccFeeRate?: number;
  // Manual override takes precedence when set (>= 0).
  ccFeeOverride?: number | null;
}) {
  const orderTotal = Math.max(0, input.orderTotal || 0);
  const discount = Math.max(0, Math.min(orderTotal, input.discount || 0));
  const tax = +(orderTotal * (input.taxRate || 0) / 100).toFixed(2);
  const finalTotal = +(orderTotal - discount + tax).toFixed(2);

  let ccFee = 0;
  if (input.isCreditCard) {
    if (input.ccFeeOverride != null && input.ccFeeOverride >= 0) {
      ccFee = +input.ccFeeOverride.toFixed(2);
    } else if (input.ccFeePct != null || input.ccFeeFlat != null) {
      ccFee = +(finalTotal * (input.ccFeePct || 0) / 100 + (input.ccFeeFlat || 0)).toFixed(2);
    } else {
      ccFee = +(finalTotal * (input.ccFeeRate || 0) / 100).toFixed(2);
    }
  }

  const netRevenue = +(finalTotal - tax - ccFee).toFixed(2);
  const netProfit = +(netRevenue * (input.profitMarginRate || 0) / 100).toFixed(2);
  const netReceived = netRevenue;
  return { orderTotal, discount, finalTotal, tax, ccFee, netRevenue, netReceived, netProfit };
}
