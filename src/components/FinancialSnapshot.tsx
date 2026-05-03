import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOrders } from "@/lib/queries";
import { fetchFinancialSettings } from "@/lib/financialSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Tag, CreditCard, Wallet, PiggyBank } from "lucide-react";

type Range = "mtd" | "ytd" | "all";

const pad = (n: number) => String(n).padStart(2, "0");
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Returns inclusive [startKey, endKey] in YYYY-MM-DD local format, or nulls for "all". */
function rangeKeys(range: Range): { startKey: string | null; endKey: string | null } {
  const now = new Date();
  if (range === "mtd") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startKey: localKey(start), endKey: localKey(end) };
  }
  if (range === "ytd") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return { startKey: localKey(start), endKey: localKey(end) };
  }
  return { startKey: null, endKey: null };
}

export default function FinancialSnapshot({ range = "mtd", compact = false }: { range?: Range; compact?: boolean }) {
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: settings } = useQuery({ queryKey: ["financial-settings"], queryFn: fetchFinancialSettings });
  const margin = (settings?.profit_margin_rate ?? 50) / 100;

  const totals = useMemo(() => {
    const { startKey, endKey } = rangeKeys(range);
    const filtered = (orders as any[]).filter(o => {
      // order_date is stored as a YYYY-MM-DD string; compare as strings to
      // avoid UTC/local timezone slippage on month boundaries.
      const key = typeof o.order_date === "string" ? o.order_date.slice(0, 10) : "";
      if (!key) return false;
      if (startKey && key < startKey) return false;
      if (endKey && key > endKey) return false;
      return true;
    });
    let sales = 0, discounts = 0, fees = 0, netRev = 0, netProfit = 0;
    for (const o of filtered) {
      const retail = Number(o.retail_amount) || 0;
      const disc = Number(o.discount_amount) || 0;
      const fee = Number(o.cc_fee_amount) || 0;
      const finalTotal = retail - disc;
      const orderNetRev = o.net_received != null ? Number(o.net_received) : (finalTotal - fee);
      const orderNetProfit = o.net_profit != null ? Number(o.net_profit) : +(orderNetRev * margin).toFixed(2);
      sales += retail;
      discounts += disc;
      fees += fee;
      if (o.payment_status === "Paid") {
        netRev += orderNetRev;
        netProfit += orderNetProfit;
      }
    }
    return { sales, discounts, fees, netRev, netProfit };
  }, [orders, range, margin]);

  const label = range === "mtd" ? "This Month" : range === "ytd" ? "Year to Date" : "All Time";

  const items = [
    { icon: TrendingUp, label: "Total Sales", value: totals.sales, color: "text-emerald-600" },
    { icon: Tag, label: "Discounts", value: totals.discounts, color: "text-amber-600" },
    { icon: CreditCard, label: "Fees", value: totals.fees, color: "text-rose-600" },
    { icon: Wallet, label: "Net Revenue", value: totals.netRev, color: "text-primary" },
    { icon: PiggyBank, label: "Est. Net Profit", value: totals.netProfit, color: "text-emerald-700" },
  ];

  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          Financial Snapshot
          <span className="text-[11px] text-muted-foreground font-normal ml-auto">
            {label} · {Math.round(margin * 100)}% margin
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {items.map(it => (
          <div key={it.label} className="rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <it.icon className={`w-3.5 h-3.5 ${it.color}`} />
              {it.label}
            </div>
            <div className="text-lg font-bold text-foreground mt-0.5">
              ${it.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
