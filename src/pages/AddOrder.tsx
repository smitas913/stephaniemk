import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchCustomers, fetchOrders, createOrder, fetchOrder } from "@/lib/queries";
import { ORDER_TYPES, FACE_TYPES, PAYMENT_TYPES } from "@/lib/types";
import { generateEventId } from "@/lib/eventId";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Copy, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { OrderWithCustomer } from "@/lib/types";

export default function AddOrder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const preselectedCustomer = params.get("customer") || "";
  const duplicateId = params.get("duplicate") || "";
  const isPartyMode = params.get("mode") === "party";

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: duplicateOrder } = useQuery({
    queryKey: ["order", duplicateId],
    queryFn: () => fetchOrder(duplicateId),
    enabled: !!duplicateId,
  });

  const [customerId, setCustomerId] = useState(preselectedCustomer);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [orderType, setOrderType] = useState<string>(isPartyMode ? "Party" : "Reorder");
  const [faceType, setFaceType] = useState<string>("Customer");
  const [hostess, setHostess] = useState(false);
  const [halfPriceDeal, setHalfPriceDeal] = useState(false);
  const [birthday, setBirthday] = useState(false);
  const [referral, setReferral] = useState(false);
  const [paymentType, setPaymentType] = useState("");
  const [retailAmount, setRetailAmount] = useState("");
  const [wholesaleAmount, setWholesaleAmount] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Party mode state
  const [partyEventId, setPartyEventId] = useState("");
  const [useExistingParty, setUseExistingParty] = useState(false);
  const [partyOrders, setPartyOrders] = useState<OrderWithCustomer[]>([]);

  // Load duplicate order data
  useEffect(() => {
    if (duplicateOrder) {
      setCustomerId(duplicateOrder.customer_id);
      setCustomerName(duplicateOrder.customer_name || duplicateOrder.customers?.full_name || "");
      setOrderDate(duplicateOrder.order_date);
      setOrderType(duplicateOrder.order_type || "Reorder");
      setFaceType(duplicateOrder.face_type || "Customer");
      setHostess(duplicateOrder.hostess || false);
      setHalfPriceDeal(duplicateOrder.half_price_deal || false);
      setBirthday(duplicateOrder.birthday || false);
      setReferral(duplicateOrder.referral || false);
      setPaymentType(duplicateOrder.payment_type || "");
      setRetailAmount(String(duplicateOrder.retail_amount || ""));
      setNotes(duplicateOrder.notes || "");
      if (duplicateOrder.parent_event_id) {
        setPartyEventId(duplicateOrder.parent_event_id);
        setUseExistingParty(true);
      }
    }
  }, [duplicateOrder]);

  // Auto-fill customer name when customer is selected
  useEffect(() => {
    if (customerId) {
      const c = customers.find((c) => c.id === customerId);
      if (c) setCustomerName(c.full_name);
    }
  }, [customerId, customers]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) =>
      c.full_name.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [customers, customerSearch]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Existing event IDs for duplicate detection
  const existingEventIds = useMemo(() => allOrders.map((o) => o.event_id).filter(Boolean) as string[], [allOrders]);

  // Existing party event IDs for party mode
  const existingPartyEvents = useMemo(() => {
    const ids = new Set<string>();
    allOrders.forEach((o) => {
      if (o.order_type === "Party" && o.event_id) ids.add(o.event_id);
      if (o.parent_event_id) ids.add(o.parent_event_id);
    });
    return Array.from(ids);
  }, [allOrders]);

  const handleSubmit = async (e: React.FormEvent, addAnother = false) => {
    e.preventDefault();
    if (!customerId) { toast.error("Select a customer"); return; }
    if (!retailAmount || Number(retailAmount) <= 0) { toast.error("Retail amount must be greater than $0. Non-ordering attendees should be tracked as event guests, not orders."); return; }

    setSubmitting(true);
    try {
      const isEventBased = orderType === "Party" || orderType === "Facial" || orderType === "Appointment";

      // Generate event ID only for event-based orders
      let eventId: string | null = null;
      let parentId: string | null = null;

      if (isEventBased) {
        if (useExistingParty && partyEventId) {
          eventId = generateEventId(orderType, orderDate, customerName, existingEventIds);
          parentId = partyEventId;
        } else {
          eventId = generateEventId(orderType, orderDate, customerName, existingEventIds);
        }
      }

      await createOrder({
        customer_id: customerId,
        customer_name: customerName,
        order_date: orderDate,
        event_id: eventId || undefined,
        order_type: orderType,
        face_type: faceType,
        hostess,
        half_price_deal: halfPriceDeal,
        birthday,
        referral,
        payment_type: paymentType || null,
        retail_amount: Number(retailAmount) || 0,
        wholesale_amount: wholesaleAmount ? Number(wholesaleAmount) : null,
        payout_amount: payoutAmount ? Number(payoutAmount) : null,
        notes: notes || undefined,
        parent_event_id: parentId,
      });

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-orders", customerId] });
      toast.success("Order created!");

      if (addAnother) {
        // Reset for next entry but keep date and party context
        if (orderType === "Party" && !useExistingParty) {
          setPartyEventId(eventId);
          setUseExistingParty(true);
        }
        setCustomerId("");
        setCustomerName("");
        setCustomerSearch("");
        setRetailAmount("");
        setWholesaleAmount("");
        setPayoutAmount("");
        setNotes("");
        setHostess(false);
        setHalfPriceDeal(false);
        setBirthday(false);
        setReferral(false);
        setFaceType("Guest");
      } else {
        navigate("/orders");
      }
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
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {isPartyMode ? "Party Event" : "New Order"}
            </h2>
            {useExistingParty && partyEventId && (
              <p className="text-xs text-pink-600 font-medium flex items-center gap-1">
                <Users className="w-3 h-3" /> Adding to: {partyEventId}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
          {/* Customer selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Customer *</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                <div>
                  <span className="font-medium text-sm">{selectedCustomer.full_name}</span>
                  {selectedCustomer.phone && <span className="text-xs text-muted-foreground ml-2">{selectedCustomer.phone}</span>}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setCustomerId(""); setCustomerName(""); }}>Change</Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input placeholder="Search by name, phone, or email..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} autoFocus className="h-9" />
                {customerSearch && (
                  <div className="border border-border rounded-lg max-h-48 overflow-auto">
                    {filteredCustomers.map((c) => (
                      <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setCustomerId(c.id); setCustomerSearch(""); }}>
                        <span className="font-medium">{c.full_name}</span>
                        {c.phone && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
                        {c.email && <span className="text-muted-foreground ml-2 text-xs">{c.email}</span>}
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No customers found</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date + Amount row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Order Date *</label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required className="h-9" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Retail Amount *</label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={retailAmount} onChange={(e) => setRetailAmount(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Wholesale + Payout (financial) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Wholesale Cost</label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={wholesaleAmount} onChange={(e) => setWholesaleAmount(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">MyShop Payout</label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Order Type + Face Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Order Type</label>
              <div className="flex gap-1.5 mt-1">
                {ORDER_TYPES.map((t) => (
                  <button key={t} type="button"
                    className={cn("flex-1 h-9 rounded-md text-xs font-medium border transition-colors",
                      orderType === t
                        ? t === "Reorder" ? "bg-purple-100 border-purple-300 text-purple-700" :
                          t === "Party" ? "bg-pink-100 border-pink-300 text-pink-700" :
                          "bg-amber-100 border-amber-300 text-amber-700"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => setOrderType(t)}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Face Type</label>
              <Select value={faceType} onValueChange={setFaceType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{FACE_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Checkboxes row */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={hostess} onCheckedChange={(v) => setHostess(!!v)} /> Hostess
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={halfPriceDeal} onCheckedChange={(v) => setHalfPriceDeal(!!v)} /> ½ Price Deal
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={birthday} onCheckedChange={(v) => setBirthday(!!v)} /> Birthday
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={referral} onCheckedChange={(v) => setReferral(!!v)} /> Referral
            </label>
          </div>

          {/* Payment Type */}
          <div>
            <label className="text-sm font-medium text-foreground">Payment</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PAYMENT_TYPES.map((p) => (
                <button key={p} type="button"
                  className={cn("h-8 px-3 rounded-md text-xs font-medium border transition-colors",
                    paymentType === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => setPaymentType(paymentType === p ? "" : p)}
                >{p}</button>
              ))}
            </div>
          </div>

          {/* Party Mode: Use existing event */}
          {orderType === "Party" && (
            <div className="rounded-lg border border-pink-200 bg-pink-50/50 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-pink-700 cursor-pointer">
                <Checkbox checked={useExistingParty} onCheckedChange={(v) => setUseExistingParty(!!v)} />
                Add to existing party event
              </label>
              {useExistingParty && (
                <Select value={partyEventId} onValueChange={setPartyEventId}>
                  <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Select party event..." /></SelectTrigger>
                  <SelectContent>
                    {existingPartyEvents.map((eid) => (
                      <SelectItem key={eid} value={eid}>{eid}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground">Notes</label>
            <Textarea placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-16 resize-none" />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 h-10" disabled={submitting}>
              {submitting ? "Saving..." : "Save Order"}
            </Button>
            <Button type="button" variant="outline" className="h-10" disabled={submitting}
              onClick={(e) => handleSubmit(e as any, true)}>
              <Plus className="w-4 h-4 mr-1" />Save & Add Another
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
