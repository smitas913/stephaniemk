import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrders, deleteOrder } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function Orders() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const deleteMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order deleted");
    },
  });

  const filtered = useMemo(() => {
    if (!search) return orders;
    const q = search.toLowerCase();
    return orders.filter((o) => o.customers?.full_name?.toLowerCase().includes(q));
  }, [orders, search]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Orders</h2>
            <p className="text-sm text-muted-foreground">{orders.length} total</p>
          </div>
          <Button size="sm" onClick={() => navigate("/orders/new")}><Plus className="w-4 h-4 mr-1" />New</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by customer name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No orders found.</p>
        ) : (
          <div className="grid gap-2">
            {filtered.map((o) => (
              <Card key={o.id} className="border-border/50 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => navigate(`/customers/${o.customer_id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{o.customers?.full_name || "Unknown"}</p>
                      <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{new Date(o.order_date).toLocaleDateString()}</span>
                        {o.source && <span className="px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{o.source}</span>}
                        {o.payment_type && <span>{o.payment_type}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground">${Number(o.retail_total).toFixed(2)}</p>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(o.id); }}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
