import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrder, updateOrder, deleteOrder } from "@/lib/queries";
import { ORDER_TYPES, PAYMENT_TYPES, FACE_TYPES } from "@/lib/types";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDateOnly } from "@/lib/dateOnly";
import OrderTagChips, { type OrderTagState } from "@/components/OrderTagChips";
import DiscountTypeChips from "@/components/DiscountTypeChips";

export default function EditOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(id!),
    enabled: !!id,
  });

  const [orderDate, setOrderDate] = useState("");
  const [retailAmount, setRetailAmount] = useState("");
  const [wholesaleAmount, setWholesaleAmount] = useState("");
  const [orderType, setOrderType] = useState("");
  const [faceType, setFaceType] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"Paid" | "Unpaid">("Paid");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<OrderTagState>({ hostess: false, half_price: false, birthday: false, referral: false, myshop: false });
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountTypeIds, setDiscountTypeIds] = useState<string[]>([]);

  useEffect(() => {
    if (order) {
      setOrderDate(order.order_date);
      setRetailAmount(String(order.retail_amount));
      setWholesaleAmount(order.wholesale_amount != null ? String(order.wholesale_amount) : "");
      setOrderType(order.order_type || "");
      setFaceType(order.face_type || "");
      setPaymentType(order.payment_type || "");
      setPaymentStatus(order.payment_status === "Unpaid" || !order.payment_type ? "Unpaid" : "Paid");
      setNotes(order.notes || "");
      setTags({
        hostess: !!order.hostess,
        half_price: !!order.half_price_deal,
        birthday: !!order.birthday,
        referral: !!order.referral,
        myshop: !!(order as any).is_myshop_order,
      });
      setDiscountAmount((order as any).discount_amount != null ? String((order as any).discount_amount) : "");
      setDiscountTypeIds(Array.isArray((order as any).discount_type_ids) ? (order as any).discount_type_ids : []);
    }
  }, [order]);

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => updateOrder(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order updated");
      navigate("/orders");
    },
    onError: () => toast.error("Failed to update order"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order deleted");
      navigate("/orders");
    },
  });

  const handleSave = () => {
    const retail = parseFloat(retailAmount);
    if (!retail || retail <= 0) {
      toast.error("Retail amount must be greater than zero");
      return;
    }
    if (paymentStatus === "Paid" && !paymentType) {
      toast.error("Select a payment method or mark the order unpaid");
      return;
    }
    updateMutation.mutate({
      order_date: orderDate,
      retail_amount: retail,
      wholesale_amount: wholesaleAmount ? parseFloat(wholesaleAmount) : null,
      order_type: orderType || null,
      face_type: faceType || null,
      payment_status: paymentStatus,
      payment_type: paymentStatus === "Unpaid" ? null : (paymentType || null),
      notes: notes || null,
      hostess: tags.hostess,
      half_price_deal: tags.half_price,
      birthday: tags.birthday,
      referral: tags.referral,
      is_myshop_order: !!tags.myshop,
      discount_amount: discountAmount ? parseFloat(discountAmount) : 0,
      discount_type_ids: discountTypeIds,
    });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <p className="text-muted-foreground text-center py-12">Order not found.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/orders")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h2 className="text-xl font-bold text-foreground">Edit Order</h2>
              <p className="text-sm text-muted-foreground">
                {order.customer_name || order.customers?.full_name || "Unknown"} · {formatDateOnly(order.order_date)}
              </p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="w-4 h-4 mr-1" />Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this order?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Order Type</label>
                <Select value={orderType} onValueChange={setOrderType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {ORDER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Retail Amount ($)</label>
                <Input type="number" step="0.01" min="0" value={retailAmount} onChange={(e) => setRetailAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Wholesale Amount ($)</label>
                <Input type="number" step="0.01" min="0" value={wholesaleAmount} onChange={(e) => setWholesaleAmount(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Face Type</label>
                <Select value={faceType || "__none__"} onValueChange={(v) => setFaceType(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None</SelectItem>
                    {FACE_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Payment Status</label>
                <div className="flex gap-1.5">
                  {(["Paid", "Unpaid"] as const).map(s => (
                    <button key={s} type="button"
                      className={cn("h-9 px-4 rounded-md text-xs font-medium border transition-colors",
                        paymentStatus === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                      onClick={() => { setPaymentStatus(s); if (s === "Unpaid") setPaymentType(""); }}
                    >{s}</button>
                  ))}
                </div>
              </div>
              {paymentStatus === "Paid" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
                  <Select value={paymentType || "__none__"} onValueChange={(v) => setPaymentType(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select</SelectItem>
                      {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {paymentStatus === "Unpaid" && (
                <p className="text-xs text-muted-foreground col-span-2">Payment method is optional for unpaid orders and will be cleared on save.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Order Tags</label>
              <OrderTagChips
                value={tags}
                onChange={setTags}
                include={["hostess", "half_price", "birthday", "referral", "myshop"]}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="w-4 h-4 mr-1" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
