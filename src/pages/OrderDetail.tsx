import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrder, updateOrder, createPayment, deletePayment, deleteOrderItem } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = ["Cash", "Check", "Venmo", "Zelle", "Card"] as const;
const PAYMENT_STATUSES = ["Paid", "Unpaid", "Partial"] as const;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order } = useQuery({ queryKey: ["order", id], queryFn: () => fetchOrder(id!) });

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "Cash", notes: "" });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["order", id] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => updateOrder(id!, updates),
    onSuccess: () => { invalidateAll(); toast.success("Order updated"); },
  });

  const addPaymentMutation = useMutation({
    mutationFn: (data: { amount: number; payment_method: "Cash" | "Check" | "Venmo" | "Zelle" | "Card"; notes?: string }) =>
      createPayment({ order_id: id!, ...data }),
    onSuccess: () => {
      invalidateAll();
      setPayOpen(false);
      setPayForm({ amount: "", payment_method: "Cash", notes: "" });
      toast.success("Payment recorded");
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: deletePayment,
    onSuccess: () => { invalidateAll(); toast.success("Payment removed"); },
  });

  const deleteItemMutation = useMutation({
    mutationFn: deleteOrderItem,
    onSuccess: () => { invalidateAll(); toast.success("Item removed"); },
  });

  if (!order) return <Layout><p className="text-muted-foreground text-center py-12">Loading...</p></Layout>;

  const totalPaid = (order.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const total = Number(order.total_amount);
  const balance = total - totalPaid;

  const hasMismatch =
    (order.payment_status === "Paid" && balance > 0.01) ||
    (order.payment_status === "Unpaid" && totalPaid > 0);

  const paidPct = total > 0 ? Math.min((totalPaid / total) * 100, 100) : 0;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {(order as any).customers?.name}
            </h2>
            <p className="text-sm text-muted-foreground">{order.order_date} · {order.order_source}</p>
          </div>
        </div>

        {/* Warning banner */}
        {hasMismatch && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">Payment mismatch</p>
              <p className="text-destructive/80">
                {order.payment_status === "Paid" && balance > 0.01
                  ? `Marked as Paid but $${balance.toFixed(2)} still unpaid`
                  : `Marked as Unpaid but $${totalPaid.toFixed(2)} has been recorded`}
              </p>
            </div>
          </div>
        )}

        {/* Payment Summary Card */}
        <Card className={cn("border-border/50 shadow-sm", hasMismatch && "border-destructive/30")}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Payment Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-foreground">${totalPaid.toFixed(2)} of ${total.toFixed(2)}</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    paidPct >= 100 ? "bg-green-500" : paidPct > 0 ? "bg-yellow-500" : "bg-muted"
                  )}
                  style={{ width: `${paidPct}%` }}
                />
              </div>
            </div>

            {/* Balance due */}
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl",
              balance > 0.01 ? "bg-destructive/10 border border-destructive/20" : "bg-green-50 border border-green-200"
            )}>
              <span className={cn("text-sm font-semibold", balance > 0.01 ? "text-destructive" : "text-green-700")}>
                {balance > 0.01 ? "Balance Due" : "Fully Paid"}
              </span>
              <div className="flex items-center gap-1.5">
                {balance <= 0.01 && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                <span className={cn("text-lg font-bold", balance > 0.01 ? "text-destructive" : "text-green-700")}>
                  ${Math.max(balance, 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Status chips */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
              <div className="flex gap-1.5">
                {PAYMENT_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateMutation.mutate({ payment_status: s })}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm font-medium transition-all active:scale-95",
                      order.payment_status === s
                        ? s === "Paid" ? "bg-green-600 text-primary-foreground shadow-sm"
                          : s === "Partial" ? "bg-yellow-500 text-primary-foreground shadow-sm"
                          : "bg-destructive text-destructive-foreground shadow-sm"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payments */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base text-foreground">Payments</CardTitle>
            <Dialog open={payOpen} onOpenChange={setPayOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-1" />Record</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addPaymentMutation.mutate({
                      amount: parseFloat(payForm.amount),
                      payment_method: payForm.payment_method as any,
                      notes: payForm.notes || undefined,
                    });
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={payForm.amount}
                      onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                      required
                      min={0}
                      step={0.01}
                      className="h-12 text-lg font-semibold"
                      inputMode="decimal"
                    />
                    {balance > 0.01 && (
                      <button
                        type="button"
                        className="text-xs text-primary font-medium"
                        onClick={() => setPayForm({ ...payForm, amount: balance.toFixed(2) })}
                      >
                        Use remaining balance (${balance.toFixed(2)})
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Method</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPayForm({ ...payForm, payment_method: m })}
                          className={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium transition-all active:scale-95",
                            payForm.payment_method === m
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input placeholder="Notes (optional)" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="h-11 text-base" />
                  <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={addPaymentMutation.isPending}>
                    {addPaymentMutation.isPending ? "Recording..." : "Record Payment"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {(order.payments || []).length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  {order.payment_status === "Unpaid" ? "$0.00 paid" : "No payments recorded yet"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {(order.payments || []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                    <div>
                      <p className="font-semibold text-foreground">${Number(p.amount).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{p.payment_method} · {p.payment_date}</p>
                      {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deletePaymentMutation.mutate(p.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            {(order.order_items || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No items.</p>
            ) : (
              <div className="space-y-2">
                {(order.order_items || []).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                    <div>
                      <p className="font-medium text-foreground">{item.product_name}</p>
                      <p className="text-sm text-muted-foreground">{item.quantity} × ${Number(item.price).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-foreground">${Number(item.line_total).toFixed(2)}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteItemMutation.mutate(item.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {order.notes && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base text-foreground">Notes</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">{order.notes}</p></CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
