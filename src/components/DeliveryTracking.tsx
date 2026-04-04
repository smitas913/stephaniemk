import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Search, Truck } from "lucide-react";
import { formatPhone } from "@/lib/phoneUtils";

type DeliveryCount = { customer_id: string; count: number };

export default function DeliveryTracking() {
  const [search, setSearch] = useState("");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const { data: counts = [] } = useQuery<DeliveryCount[]>({
    queryKey: ["delivery-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_plan_items" as any)
        .select("customer_id")
        .eq("item_type", "delivery")
        .not("customer_id", "is", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data as any) || []) {
        map[row.customer_id] = (map[row.customer_id] || 0) + 1;
      }
      return Object.entries(map).map(([customer_id, count]) => ({ customer_id, count }));
    },
  });

  const merged = useMemo(() => {
    const countMap = new Map(counts.map((c) => [c.customer_id, c.count]));
    return customers
      .map((c) => ({ id: c.id, name: c.full_name, phone: c.phone, deliveries: countMap.get(c.id) || 0 }))
      .filter((c) => c.deliveries > 0 || search)
      .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.deliveries - a.deliveries);
  }, [customers, counts, search]);

  return (
    <div className="space-y-4 mt-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Customer</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Phone</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Deliveries</th>
            </tr>
          </thead>
          <tbody>
            {merged.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground text-sm">No delivery data yet</td></tr>
            ) : (
              merged.map((c) => (
                <tr key={c.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1 text-foreground font-semibold">
                      <Truck className="w-3.5 h-3.5 text-primary" />
                      {c.deliveries}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
