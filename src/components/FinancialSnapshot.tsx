import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOrders } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Tag, CreditCard } from "lucide-react";

type Range = "mtd" | "ytd" | "all";

function startOf(range: Range): Date | null {
  const now = new Date();
  if (range === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "ytd") return new Date(now.getFullYear(), 0, 1);
  return null;
}

export default function FinancialSnapshot({ range = "mtd", compact = false }: { range?: Range; compact?: boolean }) {
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const totals = useMemo(() => {
    const start = startOf(range);
    const filtered = (orders as any[]).filter(o => {
      if (!start) return true;
      return new Date(o.order_date) >= start;
    });
    let sales = 0, discounts = 0, fees = 0, net = 0;
    for (const o of filtered) {
      const retail = Number(o.retail_amount) || 0;
      const disc = Number(o.discount_amount) || 0;
      const fee = Number(o.cc_fee_amount) || 0;
      const tax = Number(o.tax_amount) || 0;
      const finalTotal = retail - disc;
      const netRec = o.net_received != null ? Number(o.net_received) : (finalTotal + tax - fee);
      sales += retail;
      discounts += disc;
      fees += fee;
      if (o.payment_status === "Paid") net += netRec;
    }
    return { sales, discounts, fees, net };
  }, [orders, range]);

  const label = range === "mtd" ? "This Month" : range === "ytd" ? "Year to Date" : "All Time";

  const items = [
    { icon: TrendingUp, label: "Total Sales", value: totals.sales, color: "text-emerald-600" },
    { icon: Tag, label: "Discounts Given", value: totals.discounts, color: "text-amber-600" },
    { icon: DollarSign, label: "Net Collected", value: totals.net, color: "text-primary" },
    { icon: CreditCard, label: "Fees Paid", value: totals.fees, color: "text-rose-600" },
  ];

  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          Financial Snapshot
          <span className="text-[11px] text-muted-foreground font-normal ml-auto">{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className={`grid grid-cols-2 ${compact ? "sm:grid-cols-4" : "sm:grid-cols-4"} gap-3`}>
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
