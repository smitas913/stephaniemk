import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchCustomers, createOrder } from "@/lib/queries";
import { ORDER_SOURCES, PAYMENT_TYPES } from "@/lib/types";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function AddOrder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const preselectedCustomer = params.get("customer") || "";

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const [customerId, setCustomerId] = useState(preselectedCustomer);
  const [customerSearch, setCustomerSearch] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [source, setSource] = useState("In Person");
  const [paymentType, setPaymentType] = useState("");
  const [retailTotal, setRetailTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 10);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.full_name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)).slice(0, 10);
  }, [customers, customerSearch]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast.error("Select a customer"); return; }
    if (!retailTotal || Number(retailTotal) <= 0) { toast.error("Enter retail total"); return; }
    setSubmitting(true);
    try {
      const order = await createOrder({
        customer_id: customerId,
        order_date: orderDate,
        source,
        payment_type: paymentType || null,
        retail_total: Number(retailTotal),
        notes: notes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-orders", customerId] });
      toast.success("Order created!");
      navigate(`/customers/${customerId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">New Order</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Customer *</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                <span className="font-medium">{selectedCustomer.full_name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCustomerId("")}>Change</Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input placeholder="Search customers..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
                <div className="border border-border rounded-lg max-h-40 overflow-auto">
                  {filteredCustomers.map((c) => (
                    <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => { setCustomerId(c.id); setCustomerSearch(""); }}>
                      <span className="font-medium">{c.full_name}</span>
                      {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && <p className="text-sm text-muted-foreground px-3 py-2">No customers found</p>}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Order Date *</label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Retail Total *</label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={retailTotal} onChange={(e) => setRetailTotal(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Source</label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORDER_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Payment Type</label>
              <Select value={paymentType || "none"} onValueChange={(v) => setPaymentType(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Notes</label>
            <Textarea placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button type="submit" className="w-full h-11" disabled={submitting}>
            {submitting ? "Creating..." : "Create Order"}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
