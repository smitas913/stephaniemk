import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchCustomers, fetchOrders, fetchEvents, createOrder } from "@/lib/queries";
import { PAYMENT_TYPES } from "@/lib/types";
import { toLocalDateKey } from "@/lib/dateOnly";
import { generateEventId } from "@/lib/eventId";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, ShoppingBag, PartyPopper, Sparkles, RotateCcw, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AddEventDialog from "@/components/AddEventDialog";

const ORDER_TYPE_OPTIONS = [
  { value: "Party", label: "Party", icon: PartyPopper, eventBased: true },
  { value: "Facial", label: "Facial", icon: Sparkles, eventBased: true },
  { value: "Reorder", label: "Reorder", icon: RotateCcw, eventBased: false },
  { value: "Other", label: "Other", icon: ShoppingBag, eventBased: false },
] as const;

type OrderTypeValue = (typeof ORDER_TYPE_OPTIONS)[number]["value"];

export default function AddOrder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const preselectedCustomer = params.get("customer") || "";
  const preselectedEvent = params.get("event") || "";
  const preselectedType = params.get("type") || "";

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });

  // --- State ---
  const [orderType, setOrderType] = useState<OrderTypeValue | "">(() => {
    if (preselectedType && ORDER_TYPE_OPTIONS.some(o => o.value === preselectedType)) return preselectedType as OrderTypeValue;
    if (preselectedEvent) return "Party";
    return "";
  });
  const [customerId, setCustomerId] = useState(preselectedCustomer);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderDate, setOrderDate] = useState(toLocalDateKey());
  const [selectedEventId, setSelectedEventId] = useState(preselectedEvent);
  const [paymentType, setPaymentType] = useState("");
  const [retailAmount, setRetailAmount] = useState("");
  const [wholesaleAmount, setWholesaleAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bulkMode, setBulkMode] = useState(!!preselectedEvent);
  const [savedCount, setSavedCount] = useState(0);
  const [showCreateEvent, setShowCreateEvent] = useState(false);

  const isEventBased = orderType === "Party" || orderType === "Facial";
  const typeConfig = ORDER_TYPE_OPTIONS.find(o => o.value === orderType);

  // Auto-fill customer name
  useEffect(() => {
    if (customerId) {
      const c = customers.find(c => c.id === customerId);
      if (c) setCustomerName(c.full_name);
    }
  }, [customerId, customers]);

  // Clear event when switching to non-event type
  useEffect(() => {
    if (!isEventBased) {
      setSelectedEventId("");
    }
  }, [isEventBased]);

  // Event options filtered by type
  const eventOptions = useMemo(() => {
    if (!isEventBased) return [];
    return events
      .filter(e => {
        if (orderType === "Party") return !e.event_type || e.event_type === "Party";
        if (orderType === "Facial") return e.event_type === "Facial";
        return true;
      })
      .sort((a, b) => (b.event_date || "").localeCompare(a.event_date || ""));
  }, [events, orderType, isEventBased]);

  const existingEventIds = useMemo(() => events.map(e => e.event_id), [events]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [customers, customerSearch]);

  const selectedCustomer = customers.find(c => c.id === customerId);
  const selectedEvent = events.find(e => e.event_id === selectedEventId);

  // --- Validation ---
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!orderType) errors.push("Select an order type");
    if (!customerId) errors.push("Select a customer");
    if (!retailAmount || Number(retailAmount) <= 0) errors.push("Retail amount must be > $0");
    if (!paymentType) errors.push("Select a payment type");
    if (isEventBased && !selectedEventId) errors.push("Select an event");
    return errors;
  }, [orderType, customerId, retailAmount, paymentType, isEventBased, selectedEventId]);

  const canSubmit = validationErrors.length === 0 && !submitting;

  // --- Submit ---
  const handleSubmit = useCallback(async (addAnother = false) => {
    if (!canSubmit) {
      toast.error(validationErrors[0]);
      return;
    }

    setSubmitting(true);
    try {
      let eventId: string | null = null;

      if (isEventBased && selectedEventId) {
        // Use the selected event's event_id as parent, generate unique order event_id
        eventId = selectedEventId;
      }

      await createOrder({
        customer_id: customerId,
        customer_name: customerName,
        order_date: orderDate,
        event_id: eventId || undefined,
        order_type: orderType,
        payment_type: paymentType,
        retail_amount: Number(retailAmount) || 0,
        wholesale_amount: wholesaleAmount ? Number(wholesaleAmount) : null,
        notes: notes || undefined,
        parent_event_id: isEventBased ? selectedEventId : null,
      });

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-orders", customerId] });

      setSavedCount(prev => prev + 1);
      toast.success(`Order saved for ${customerName}`);

      if (addAnother || bulkMode) {
        // Reset per-order fields, keep event + type + date
        setCustomerId("");
        setCustomerName("");
        setCustomerSearch("");
        setRetailAmount("");
        setWholesaleAmount("");
        setNotes("");
        setPaymentType("");
      } else {
        navigate("/orders");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, validationErrors, isEventBased, selectedEventId, customerId, customerName, orderDate, orderType, paymentType, retailAmount, wholesaleAmount, notes, bulkMode, queryClient, navigate]);

  // --- Step 1: Order Type Selection ---
  if (!orderType) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="-ml-2" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">New Order</h2>
              <p className="text-sm text-muted-foreground">What type of order is this?</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {ORDER_TYPE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setOrderType(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all",
                    "hover:border-primary hover:bg-primary/5",
                    "border-border bg-card text-card-foreground"
                  )}
                >
                  <Icon className="w-8 h-8 text-primary" />
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-xs text-muted-foreground text-center">
                    {opt.eventBased ? "Linked to an event" : "Individual transaction"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Layout>
    );
  }

  // --- Step 2: Order Form ---
  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-4 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => {
            if (bulkMode && savedCount > 0) { navigate("/orders"); return; }
            setOrderType("");
          }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {orderType} Order
            </h2>
            {bulkMode && savedCount > 0 && (
              <p className="text-xs text-primary font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {savedCount} order{savedCount !== 1 ? "s" : ""} saved this session
              </p>
            )}
          </div>
          {/* Type switcher pills */}
          <div className="flex gap-1">
            {ORDER_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setOrderType(opt.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  orderType === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Event selector — only for event-based types */}
        {isEventBased && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Event *
              </label>
              {selectedEvent && (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkMode}
                    onChange={e => setBulkMode(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-muted-foreground">Bulk entry mode</span>
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Select an event..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eventOptions.map(e => (
                      <SelectItem key={e.event_id} value={e.event_id}>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{e.hostess_name || e.event_id}</span>
                          {e.event_date && <span className="text-muted-foreground text-xs">({e.event_date})</span>}
                        </span>
                      </SelectItem>
                    ))}
                    {eventOptions.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No {orderType.toLowerCase()} events found</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => setShowCreateEvent(true)}
                title="Create new event"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {!selectedEventId && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> An event must be selected for {orderType.toLowerCase()} orders
              </p>
            )}
            <AddEventDialog
              open={showCreateEvent}
              onOpenChange={setShowCreateEvent}
              existingEventIds={existingEventIds}
              onCreated={(eventId) => setSelectedEventId(eventId)}
            />
          </div>
        )}

        {/* Customer selection */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Customer *</label>
          {selectedCustomer ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div>
                <span className="font-medium text-sm">{selectedCustomer.full_name}</span>
                {selectedCustomer.phone && <span className="text-xs text-muted-foreground ml-2">{selectedCustomer.phone}</span>}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setCustomerId(""); setCustomerName(""); setCustomerSearch(""); }}>Change</Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input placeholder="Search by name, phone, or email..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} autoFocus className="h-9" />
              {customerSearch && (
                <div className="border border-border rounded-lg max-h-48 overflow-auto">
                  {filteredCustomers.map(c => (
                    <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                      onClick={() => { setCustomerId(c.id); setCustomerSearch(""); }}>
                      <span className="font-medium">{c.full_name}</span>
                      {c.phone && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No customers found</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date + Retail Amount */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground">Date</label>
            <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} required className="h-9" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Retail Amount *</label>
            <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={retailAmount} onChange={e => setRetailAmount(e.target.value)} className="h-9" />
          </div>
        </div>

        {/* Wholesale (optional) */}
        <div>
          <label className="text-sm font-medium text-foreground">Wholesale Cost <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input type="number" step="0.01" min="0" placeholder="0.00" value={wholesaleAmount} onChange={e => setWholesaleAmount(e.target.value)} className="h-9" />
        </div>

        {/* Payment Type — button pills */}
        <div>
          <label className="text-sm font-medium text-foreground">Payment *</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {PAYMENT_TYPES.map(p => (
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

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-foreground">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Textarea placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} className="h-16 resize-none" />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {bulkMode ? (
            <>
              <Button
                type="button"
                className="flex-1 h-11"
                disabled={!canSubmit}
                onClick={() => handleSubmit(true)}
              >
                {submitting ? "Saving..." : "Save & Next"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  if (savedCount > 0) navigate("/orders");
                  else { setBulkMode(false); }
                }}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                className="flex-1 h-11"
                disabled={!canSubmit}
                onClick={() => handleSubmit(false)}
              >
                {submitting ? "Saving..." : "Save Order"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-1"
                disabled={!canSubmit}
                onClick={() => handleSubmit(true)}
              >
                <Plus className="w-4 h-4" /> Save & Add
              </Button>
            </>
          )}
        </div>

        {/* Validation hints */}
        {validationErrors.length > 0 && (retailAmount || customerId) && (
          <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
            {validationErrors.map((e, i) => (
              <p key={i} className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-muted-foreground inline-block" /> {e}
              </p>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
