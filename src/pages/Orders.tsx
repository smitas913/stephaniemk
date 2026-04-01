import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrders, deleteOrder } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, AlertTriangle, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type FilterMode = "all" | "unpaid" | "partial" | "paid";

function getOrderPaymentInfo(order: any) {
  const totalPaid = (order.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const total = Number(order.total_amount);
  const balance = total - totalPaid;
  const hasMismatch =
    (order.payment_status === "Paid" && balance > 0.01) ||
    (order.payment_status === "Unpaid" && totalPaid > 0);
  return { totalPaid, balance, hasMismatch };
}

export default function Orders() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterMode>("all");
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
    let result = orders;
    if (filter === "unpaid") result = result.filter((o) => o.payment_status === "Unpaid");
    else if (filter === "partial") result = result.filter((o) => o.payment_status === "Partial");
    else if (filter === "paid") result = result.filter((o) => o.payment_status === "Paid");

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((o) => (o as any).customers?.name?.toLowerCase().includes(q));
    }
    return result;
  }, [orders, filter, search]);

  const counts = useMemo(() => ({
    all: orders.length,
    unpaid: orders.filter((o) => o.payment_status === "Unpaid").length,
    partial: orders.filter((o) => o.payment_status === "Partial").length,
    paid: orders.filter((o) => o.payment_status === "Paid").length,
  }), [orders]);

  const filters: { key: FilterMode; label: string; accent?: boolean }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "unpaid", label: `Unpaid (${counts.unpaid})`, accent: counts.unpaid > 0 },
    { key: "partial", label: `Partial (${counts.partial})`, accent: counts.partial > 0 },
    { key: "paid", label: `Paid (${counts.paid})` },
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Orders</h2>
            <p className="text-sm text-muted-foreground">{orders.length} total</p>
          </div>
          <Button size="sm" onClick={() => navigate("/orders/new")}>
            <Plus className="w-4 h-4 mr-1" />New
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11 text-base" />
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 whitespace-nowrap shrink-0",
                filter === f.key
                  ? f.accent ? "bg-destructive text-destructive-foreground shadow-sm" : "bg-primary text-primary-foreground shadow-sm"
                  : f.accent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No orders found.</p>
        ) : (
          <div className="grid gap-2">
            {filtered.map((order) => {
              const { totalPaid, balance, hasMismatch } = getOrderPaymentInfo(order);
              return (
                <Card
                  key={order.id}
                  className={cn(
                    "border-border/50 shadow-sm cursor-pointer hover:shadow-md active:scale-[0.99] transition-all",
                    hasMismatch && "border-destructive/40 bg-destructive/5"
                  )}
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {hasMismatch && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                          <p className="font-semibold text-foreground truncate">{(order as any).customers?.name}</p>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-sm text-muted-foreground">
                          <span>{order.order_date}</span>
                          <span className="px-1.5 py-0.5 rounded bg-accent text-accent-foreground text-xs">{order.order_source}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="font-bold text-foreground">${Number(order.total_amount).toFixed(2)}</p>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full",
                              order.payment_status === "Paid" ? "bg-green-100 text-green-700" :
                              order.payment_status === "Partial" ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {order.payment_status}
                            </span>
                          </div>
                          {balance > 0.01 && order.payment_status !== "Paid" && (
                            <p className="text-[11px] text-destructive font-medium mt-0.5">
                              Due: ${balance.toFixed(2)}
                            </p>
                          )}
                          {order.payment_status === "Partial" && (
                            <p className="text-[10px] text-muted-foreground">
                              Paid: ${totalPaid.toFixed(2)}
                            </p>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(order.id); }}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
