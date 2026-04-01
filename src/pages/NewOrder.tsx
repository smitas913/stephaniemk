import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, createOrder, createOrderItem, updateOrder } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface LineItem {
  product_name: string;
  quantity: number;
  price: number;
}

export default function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const [customerId, setCustomerId] = useState(searchParams.get("customer") || "");
  const [orderSource, setOrderSource] = useState<string>("Other");
  const [paymentStatus, setPaymentStatus] = useState<string>("Unpaid");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ product_name: "", quantity: 1, price: 0 }]);
  const [submitting, setSubmitting] = useState(false);

  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const addItem = () => setItems([...items, { product_name: "", quantity: 1, price: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    const updated = [...items];
    (updated[i] as any)[field] = value;
    setItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast.error("Select a customer"); return; }
    setSubmitting(true);
    try {
      const order = await createOrder({
        customer_id: customerId,
        order_source: orderSource as any,
        payment_status: paymentStatus as any,
        payment_method: paymentMethod ? (paymentMethod as any) : null,
        notes: notes || undefined,
        total_amount: total,
      });

      const validItems = items.filter((i) => i.product_name.trim());
      await Promise.all(validItems.map((item) => createOrderItem({ order_id: order.id, ...item })));

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order created!");
      navigate(`/orders/${order.id}`);
    } catch {
      toast.error("Failed to create order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">New Order</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader><CardTitle className="text-foreground">Order Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer *" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-4">
                <Select value={orderSource} onValueChange={setOrderSource}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    {["Online", "Phone", "Text", "Event", "Other"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger><SelectValue placeholder="Payment Status" /></SelectTrigger>
                  <SelectContent>
                    {["Paid", "Unpaid", "Partial"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue placeholder="Payment Method (optional)" /></SelectTrigger>
                <SelectContent>
                  {["Cash", "Check", "Venmo", "Zelle", "Card", "Other"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground">Line Items</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" />Add Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Product name"
                    value={item.product_name}
                    onChange={(e) => updateItem(i, "product_name", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 0)}
                    className="w-20"
                    min={1}
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    value={item.price}
                    onChange={(e) => updateItem(i, "price", parseFloat(e.target.value) || 0)}
                    className="w-24"
                    min={0}
                    step={0.01}
                  />
                  <span className="w-20 text-right text-sm font-medium text-foreground">
                    ${(item.quantity * item.price).toFixed(2)}
                  </span>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="pt-3 border-t border-border text-right">
                <span className="text-lg font-bold text-foreground">Total: ${total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating..." : "Create Order"}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
