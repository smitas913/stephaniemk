import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomer, fetchOrders, updateCustomer } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Plus, Phone, Mail, DollarSign, ShoppingBag, Calendar, StickyNote } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: customer } = useQuery({ queryKey: ["customer", id], queryFn: () => fetchCustomer(id!) });
  const { data: orders = [] } = useQuery({ queryKey: ["orders", id], queryFn: () => fetchOrders(id!) });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  useEffect(() => {
    if (customer) {
      setForm({ name: customer.name, phone: customer.phone || "", email: customer.email || "", notes: customer.notes || "" });
    }
  }, [customer]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => updateCustomer(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditing(false);
      toast.success("Customer updated!");
    },
  });

  if (!customer) return <Layout><p className="text-muted-foreground text-center py-12">Loading...</p></Layout>;

  const stats = [
    { label: "Lifetime Value", value: `$${Number(customer.total_spent).toFixed(2)}`, icon: DollarSign },
    { label: "Orders", value: orders.length.toString(), icon: ShoppingBag },
    { label: "Last Order", value: customer.last_order_date ? new Date(customer.last_order_date).toLocaleDateString() : "Never", icon: Calendar },
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={() => navigate("/customers")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground truncate">{customer.name}</h2>
            <p className="text-sm text-muted-foreground">
              Customer since {new Date(customer.created_at).toLocaleDateString()}
            </p>
          </div>
          <Button size="sm" onClick={() => navigate(`/orders/new?customer=${id}`)}>
            <Plus className="w-4 h-4 mr-1" />Order
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <Card key={s.label} className="border-border/50 shadow-sm">
              <CardContent className="p-3 text-center">
                <s.icon className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold text-foreground leading-tight">{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contact Info */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-foreground text-base">Contact Info</CardTitle>
            {!editing && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-primary text-xs">
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editing ? (
              <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(form); }} className="space-y-3">
                <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-11 text-base" />
                <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 text-base" type="tel" />
                <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 text-base" type="email" />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={updateMutation.isPending}>
                    <Save className="w-4 h-4 mr-1" />{updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setEditing(false); setForm({ name: customer.name, phone: customer.phone || "", email: customer.email || "", notes: customer.notes || "" }); }}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-2">
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-foreground hover:text-primary transition-colors py-1">
                    <Phone className="w-4 h-4 text-muted-foreground" />{customer.phone}
                  </a>
                ) : (
                  <p className="flex items-center gap-2 text-muted-foreground py-1"><Phone className="w-4 h-4" />No phone</p>
                )}
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-foreground hover:text-primary transition-colors py-1">
                    <Mail className="w-4 h-4 text-muted-foreground" />{customer.email}
                  </a>
                ) : (
                  <p className="flex items-center gap-2 text-muted-foreground py-1"><Mail className="w-4 h-4" />No email</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-foreground text-base flex items-center gap-2">
              <StickyNote className="w-4 h-4" />Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Add notes about this customer..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="min-h-[80px] text-base border-none bg-muted/40 focus-visible:ring-1"
            />
            {form.notes !== (customer.notes || "") && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => updateMutation.mutate(form)}
                disabled={updateMutation.isPending}
              >
                <Save className="w-3 h-3 mr-1" />Save Note
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Order History */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-foreground text-base">
              Order History ({orders.length})
            </CardTitle>
            <Button size="sm" variant="ghost" className="text-primary text-xs" onClick={() => navigate(`/orders/new?customer=${id}`)}>
              <Plus className="w-3 h-3 mr-1" />New
            </Button>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="text-center py-6">
                <ShoppingBag className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No orders yet</p>
                <Button size="sm" className="mt-3" onClick={() => navigate(`/orders/new?customer=${id}`)}>
                  Create First Order
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50 cursor-pointer hover:bg-muted active:scale-[0.99] transition-all"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{order.order_date}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{order.order_source}</span>
                        {order.payment_method && (
                          <span className="text-xs text-muted-foreground">{order.payment_method}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground">${Number(order.total_amount).toFixed(2)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        order.payment_status === "Paid" ? "bg-green-100 text-green-700" :
                        order.payment_status === "Partial" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {order.payment_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
