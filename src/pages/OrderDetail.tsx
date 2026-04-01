import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrder, updateOrder, createPayment, deletePayment, deleteOrderItem } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order } = useQuery({ queryKey: ["order", id], queryFn: () => fetchOrder(id!) });

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "Cash", notes: "" });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => updateOrder(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order updated");
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: (data: { amount: number; payment_method: "Cash" | "Check" | "Venmo" | "Zelle" | "Card"; notes?: string }) =>
      createPayment({ order_id: id!, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      setPayOpen(false);
      setPayForm({ amount: "", payment_method: "Cash", notes: "" });
      toast.success("Payment recorded");
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: deletePayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      toast.success("Payment removed");
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: deleteOrderItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      toast.success("Item removed");
    },
  });

  if (!order) return <Layout><p className="text-muted-foreground">Loading...</p></Layout>;

  const totalPaid = (order.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const balance = Number(order.total_amount) - totalPaid;

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Order for {(order as any).customers?.name}
            </h2>
            <p className="text-muted-foreground">{order.order_date} · {order.order_source}</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border/50 shadow-sm">
            <CardHeader><CardTitle className="text-foreground">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold text-foreground">${Number(order.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-green-600">${totalPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Balance</span>
                <span className={`font-bold ${balance > 0 ? "text-destructive" : "text-green-600"}`}>
                  ${balance.toFixed(2)}
                </span>
              </div>

              <div className="pt-2 space-y-3">
                <Select
                  value={order.payment_status}
                  onValueChange={(v) => updateMutation.mutate({ payment_status: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Paid", "Unpaid", "Partial"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground">Payments</CardTitle>
              <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add</Button>
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
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={payForm.amount}
                      onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                      required
                      min={0}
                      step={0.01}
                    />
                    <Select value={payForm.payment_method} onValueChange={(v) => setPayForm({ ...payForm, payment_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Cash", "Check", "Venmo", "Zelle", "Card"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
                    <Button type="submit" className="w-full" disabled={addPaymentMutation.isPending}>
                      Record Payment
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {(order.payments || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              ) : (
                <div className="space-y-2">
                  {(order.payments || []).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                      <div>
                        <p className="text-sm font-medium text-foreground">${Number(p.amount).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{p.payment_method} · {p.payment_date}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deletePaymentMutation.mutate(p.id)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardHeader><CardTitle className="text-foreground">Line Items</CardTitle></CardHeader>
          <CardContent>
            {(order.order_items || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No items.</p>
            ) : (
              <div className="space-y-2">
                {(order.order_items || []).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground">{item.product_name}</p>
                      <p className="text-sm text-muted-foreground">{item.quantity} × ${Number(item.price).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-foreground">${Number(item.line_total).toFixed(2)}</span>
                      <Button variant="ghost" size="icon" onClick={() => deleteItemMutation.mutate(item.id)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
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
            <CardHeader><CardTitle className="text-foreground">Notes</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">{order.notes}</p></CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
