import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomer, fetchCustomerOrders, updateCustomer, deleteOrder } from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import { RELATIONSHIP_STATUSES, FOLLOW_UP_STAGES } from "@/lib/types";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Plus, Trash2, Phone, MessageSquare, Mail } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CustomerNotesTimeline from "@/components/CustomerNotesTimeline";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: customer } = useQuery({ queryKey: ["customer", id], queryFn: () => fetchCustomer(id!) });
  const { data: orders = [] } = useQuery({ queryKey: ["customer-orders", id], queryFn: () => fetchCustomerOrders(id!) });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (customer) {
      setForm({
        full_name: customer.full_name || "",
        phone: customer.phone || "",
        email: customer.email || "",
        birthday_mmdd: customer.birthday_mmdd || "",
        address_line_1: customer.address_line_1 || "",
        address_line_2: customer.address_line_2 || "",
        city: customer.city || "",
        state_territory: customer.state_territory || "",
        postal_code: customer.postal_code || "",
        relationship_status: customer.relationship_status || "Customer",
        profile_date_first_order_date: customer.profile_date_first_order_date || "",
        last_order_mk: customer.last_order_mk || "",
        last_contacted: customer.last_contacted || "",
        follow_up_reason: customer.follow_up_reason || "",
        notes: customer.notes || "",
        new_follow_up_stage: customer.new_follow_up_stage || "",
      });
    }
  }, [customer]);

  const computed = useMemo(() => {
    if (!customer) return null;
    return computeCustomerFields(customer, orders);
  }, [customer, orders]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, string>) => {
      const cleaned: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(data)) {
        cleaned[k] = v === "" ? null : v;
      }
      if (cleaned.full_name === null) cleaned.full_name = customer!.full_name;
      return updateCustomer(id!, cleaned as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditing(false);
      toast.success("Customer updated!");
    },
  });

  const deleteOrderMut = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order deleted");
    },
  });

  if (!customer || !computed) return <Layout><p className="text-muted-foreground text-center py-12">Loading...</p></Layout>;

  const statCards = [
    { label: "Activity", value: computed.activity_status || "—" },
    { label: "VIP", value: computed.vip || "—" },
    { label: "Last Order", value: computed.last_order_effective ? new Date(computed.last_order_effective).toLocaleDateString() : "—" },
    { label: "Days Since", value: computed.days_since_last_order !== null ? String(computed.days_since_last_order) : "—" },
    { label: "Orders YTD", value: String(computed.orders_this_year) },
    { label: "Retail YTD", value: `$${computed.retail_this_year.toFixed(2)}` },
    { label: "Next Follow-Up", value: computed.next_follow_up ? new Date(computed.next_follow_up).toLocaleDateString() : "—" },
    { label: "FU Status", value: computed.follow_up_status || "—" },
  ];

  const fuStatusColor = computed.follow_up_status === "OVERDUE" ? "text-red-600" : computed.follow_up_status === "TODAY" ? "text-blue-600" : "text-green-600";

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5 pb-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => navigate("/customers")}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-foreground truncate">{customer.full_name}</h2>
            <div className="flex gap-2 mt-0.5">
              {computed.new_first_90_days && <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">New</span>}
              {computed.vip && <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">VIP</span>}
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{customer.relationship_status || "Customer"}</span>
            </div>
          </div>
          <div className="flex gap-1">
            {customer.phone && (
              <>
                <Button size="sm" variant="outline" asChild title="Call">
                  <a href={`tel:${customer.phone}`}><Phone className="w-4 h-4" /></a>
                </Button>
                <Button size="sm" variant="outline" asChild title="Text">
                  <a href={`sms:${customer.phone}`}><MessageSquare className="w-4 h-4" /></a>
                </Button>
              </>
            )}
            {customer.email && (
              <Button size="sm" variant="outline" asChild title="Email">
                <a href={`mailto:${customer.email}`}><Mail className="w-4 h-4" /></a>
              </Button>
            )}
            <Button size="sm" onClick={() => navigate(`/orders/new?customer=${id}`)}><Plus className="w-4 h-4 mr-1" />Order</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statCards.map((s) => (
            <Card key={s.label} className="border-border/50 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className={cn("text-lg font-bold leading-tight", s.label === "FU Status" ? fuStatusColor : "text-foreground")}>{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Customer Info</CardTitle>
            {!editing ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-primary text-xs">Edit</Button>
            ) : (
              <div className="flex gap-1">
                <Button size="sm" onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>
                  <Save className="w-3 h-3 mr-1" />{updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Full Name *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input placeholder="Birthday (MM/DD)" value={form.birthday_mmdd} onChange={(e) => setForm({ ...form, birthday_mmdd: e.target.value })} />
                <Input placeholder="Address Line 1" value={form.address_line_1} onChange={(e) => setForm({ ...form, address_line_1: e.target.value })} />
                <Input placeholder="Address Line 2" value={form.address_line_2} onChange={(e) => setForm({ ...form, address_line_2: e.target.value })} />
                <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <Input placeholder="State" value={form.state_territory} onChange={(e) => setForm({ ...form, state_territory: e.target.value })} />
                <Input placeholder="Zip" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                <Select value={form.relationship_status} onValueChange={(v) => setForm({ ...form, relationship_status: v })}>
                  <SelectTrigger><SelectValue placeholder="Relationship Status" /></SelectTrigger>
                  <SelectContent>{RELATIONSHIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="date" placeholder="First Order Date" value={form.profile_date_first_order_date} onChange={(e) => setForm({ ...form, profile_date_first_order_date: e.target.value })} />
                <Input type="date" placeholder="Last Order (MK)" value={form.last_order_mk} onChange={(e) => setForm({ ...form, last_order_mk: e.target.value })} />
                <Input type="date" placeholder="Last Contacted" value={form.last_contacted} onChange={(e) => setForm({ ...form, last_contacted: e.target.value })} />
                <Select value={form.new_follow_up_stage || "none"} onValueChange={(v) => setForm({ ...form, new_follow_up_stage: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Follow-Up Stage" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Stage</SelectItem>
                    {FOLLOW_UP_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Follow-Up Reason" value={form.follow_up_reason} onChange={(e) => setForm({ ...form, follow_up_reason: e.target.value })} />
                <div className="sm:col-span-2">
                  <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <InfoRow label="Phone" value={customer.phone} />
                <InfoRow label="Email" value={customer.email} />
                <InfoRow label="Birthday" value={customer.birthday_mmdd} />
                <InfoRow label="Address" value={[customer.address_line_1, customer.address_line_2, [customer.city, customer.state_territory, customer.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")} />
                <InfoRow label="Relationship" value={customer.relationship_status} />
                <InfoRow label="First Order Date" value={customer.profile_date_first_order_date} />
                <InfoRow label="Last Order (MK)" value={customer.last_order_mk} />
                <InfoRow label="Last Contacted" value={customer.last_contacted} />
                <InfoRow label="Follow-Up Stage" value={customer.new_follow_up_stage} />
                <InfoRow label="Follow-Up Reason" value={customer.follow_up_reason} />
                {customer.notes && <div className="sm:col-span-2"><span className="text-muted-foreground">Notes:</span> {customer.notes}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Order History ({orders.length})</CardTitle>
            <Button size="sm" variant="ghost" className="text-primary text-xs" onClick={() => navigate(`/orders/new?customer=${id}`)}>
              <Plus className="w-3 h-3 mr-1" />New
            </Button>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No orders yet</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{new Date(o.order_date).toLocaleDateString()}</p>
                      <div className="flex gap-2 mt-0.5">
                        {o.order_type && <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{o.order_type}</span>}
                        {o.payment_type && <span className="text-xs text-muted-foreground">{o.payment_type}</span>}
                        {o.event_id && <span className="text-[10px] font-mono text-muted-foreground">{o.event_id}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground">${Number(o.retail_amount).toFixed(2)}</p>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteOrderMut.mutate(o.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <CustomerNotesTimeline customerId={id!} />
      </div>
    </Layout>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}
