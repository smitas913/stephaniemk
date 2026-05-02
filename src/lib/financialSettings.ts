import { supabase } from "@/integrations/supabase/client";

export type FinancialSettings = {
  user_id: string;
  tax_rate: number;          // percent
  cc_fee_rate: number;       // percent
  profit_margin_rate: number; // percent, e.g. 50
};

export const DEFAULT_FINANCIAL_SETTINGS: Omit<FinancialSettings, "user_id"> = {
  tax_rate: 0,
  cc_fee_rate: 0,
  profit_margin_rate: 50,
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

export async function upsertFinancialSettings(values: { tax_rate: number; cc_fee_rate: number; profit_margin_rate: number }) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const { error } = await (supabase as any)
    .from("financial_settings")
    .upsert({ user_id: uid, ...values }, { onConflict: "user_id" });
  if (error) throw error;
}

/**
 * Final Total = Order Total - Discount
 * Tax (informational) = Order Total × tax%
 * CC Fee = Final Total × ccFee%  (only when paying by Credit Card)
 * Net Revenue = Final Total - CC Fee
 * Net Profit = Net Revenue × profit margin %
 */
export function computeOrderFinancials(input: {
  orderTotal: number;
  discount: number;
  taxRate: number;
  ccFeeRate: number;
  profitMarginRate: number;
  isCreditCard: boolean;
}) {
  const orderTotal = Math.max(0, input.orderTotal || 0);
  const discount = Math.max(0, Math.min(orderTotal, input.discount || 0));
  const finalTotal = +(orderTotal - discount).toFixed(2);
  const tax = +(orderTotal * (input.taxRate || 0) / 100).toFixed(2);
  const ccFee = input.isCreditCard ? +(finalTotal * (input.ccFeeRate || 0) / 100).toFixed(2) : 0;
  const netRevenue = +(finalTotal - ccFee).toFixed(2);
  const netProfit = +(netRevenue * (input.profitMarginRate || 0) / 100).toFixed(2);
  // Backward-compat alias used by some consumers
  const netReceived = netRevenue;
  return { orderTotal, discount, finalTotal, tax, ccFee, netRevenue, netReceived, netProfit };
}
