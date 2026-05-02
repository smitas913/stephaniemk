import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchCustomers, fetchOrders, fetchEvents, createOrder, createCustomer } from "@/lib/queries";
import { applyPostOrderFollowUp } from "@/lib/postOrderFollowUp";
import { getOrCreateNonCustomerBucket } from "@/lib/nonCustomerBucket";
import { useAuth } from "@/hooks/useAuth";
import { PAYMENT_TYPES } from "@/lib/types";
import { toLocalDateKey } from "@/lib/dateOnly";
import { generateEventId } from "@/lib/eventId";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Plus, ShoppingBag, RotateCcw, PartyPopper, Sparkles, Share2, Megaphone, CheckCircle2, AlertTriangle, UserPlus, ChevronDown, Users, Store } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AddEventDialog from "@/components/AddEventDialog";
import NewCustomerFollowUpDialog from "@/components/NewCustomerFollowUpDialog";
import { useQuery as useRQ } from "@tanstack/react-query";
import { fetchFinancialSettings, computeOrderFinancials } from "@/lib/financialSettings";

const ORDER_TYPE_OPTIONS = [
  { value: "Party", label: "Party", icon: PartyPopper, eventBased: true },
  { value: "Facial", label: "Facial", icon: Sparkles, eventBased: true },
  { value: "Sharing Appointment", label: "Sharing", icon: Share2, eventBased: true },
  { value: "Lead Generating Event", label: "Lead Gen", icon: Megaphone, eventBased: true },
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
  const { data: financialSettings } = useRQ({ queryKey: ["financial-settings"], queryFn: fetchFinancialSettings });

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
  const [paymentStatus, setPaymentStatus] = useState<"Paid" | "Unpaid">("Paid");
  const [paymentType, setPaymentType] = useState("");
  const [retailAmount, setRetailAmount] = useState("");
  const [wholesaleAmount, setWholesaleAmount] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountMode, setDiscountMode] = useState<"$" | "%">("$");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bulkMode, setBulkMode] = useState(!!preselectedEvent);
  const [savedCount, setSavedCount] = useState(0);
  const [followUpPrompt, setFollowUpPrompt] = useState<{ id: string; name: string; pendingNav: boolean } | null>(null);
  const [needsCatalog, setNeedsCatalog] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // New customer inline form
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustCity, setNewCustCity] = useState("");
  const [newCustState, setNewCustState] = useState("");
  const [newCustPostal, setNewCustPostal] = useState("");
  const [newCustBirthday, setNewCustBirthday] = useState("");
  const [showAdditional, setShowAdditional] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<typeof customers[0] | null>(null);

  // Non-customer / one-time order mode
  const { user } = useAuth();
  const [isNonCustomer, setIsNonCustomer] = useState(false);
  const [nonCustomerLabel, setNonCustomerLabel] = useState("");

  const isEventBased = ORDER_TYPE_OPTIONS.find(o => o.value === orderType)?.eventBased ?? false;
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
        // Show all events for event-based order types
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

  // Duplicate detection for new customer
  useEffect(() => {
    if (!isNewCustomer || !newCustName.trim()) { setDuplicateMatch(null); return; }
    const q = newCustName.trim().toLowerCase();
    const match = customers.find(c => c.full_name.toLowerCase() === q);
    setDuplicateMatch(match || null);
  }, [newCustName, isNewCustomer, customers]);

  // --- Validation ---
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!orderType) errors.push("Select an order type");
    if (!isNonCustomer && !customerId && !(isNewCustomer && newCustName.trim())) errors.push("Select or add a customer");
    if (!retailAmount || Number(retailAmount) <= 0) errors.push("Retail amount must be > $0");
    if (paymentStatus === "Paid" && !paymentType) errors.push("Select a payment type");
    if (isEventBased && !selectedEventId) errors.push("Select an event");
    return errors;
  }, [orderType, customerId, isNewCustomer, newCustName, retailAmount, paymentStatus, paymentType, isEventBased, selectedEventId, isNonCustomer]);

  // --- Auto financial calc ---
  const financials = useMemo(() => {
    const orderTotal = Number(retailAmount) || 0;
    const dRaw = Number(discountValue) || 0;
    const discount = discountMode === "%" ? +(orderTotal * dRaw / 100).toFixed(2) : dRaw;
    return computeOrderFinancials({
      orderTotal,
      discount,
      taxRate: financialSettings?.tax_rate ?? 0,
      ccFeeRate: financialSettings?.cc_fee_rate ?? 0,
      isCreditCard: paymentStatus === "Paid" && paymentType === "Credit Card",
    });
  }, [retailAmount, discountValue, discountMode, financialSettings, paymentStatus, paymentType]);

  const canSubmit = validationErrors.length === 0 && !submitting;

  // --- Submit ---
  const handleSubmit = useCallback(async (addAnother = false) => {
    setAttempted(true);
    if (!canSubmit) {
      toast.error(validationErrors[0]);
      return;
    }

    setSubmitting(true);
    try {
      let resolvedCustomerId = customerId;
      let resolvedCustomerName = customerName;

      if (isNonCustomer) {
        // Route the order to the per-owner archived "Non-Customer Orders" bucket.
        // Bucket is is_active=false + archived → excluded from customer lists,
        // follow-ups, and customer metrics. The free-text label below is shown
        // as the buyer name on the order itself.
        resolvedCustomerId = await getOrCreateNonCustomerBucket(user?.id ?? null);
        resolvedCustomerName = nonCustomerLabel.trim() || "One-Time Order";
      } else if (isNewCustomer && newCustName.trim() && !customerId) {
        // Create new customer if needed
        const birthdayMMDD = newCustBirthday ? (() => {
          const parts = newCustBirthday.split("-");
          return parts.length === 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : null;
        })() : null;

        const newCust = await createCustomer({
          full_name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          email: newCustEmail.trim() || null,
          address_line_1: newCustAddress.trim() || null,
          city: newCustCity.trim() || null,
          state_territory: newCustState.trim() || null,
          postal_code: newCustPostal.trim() || null,
          birthday: newCustBirthday || null,
          birthday_mmdd: birthdayMMDD,
        } as any);
        resolvedCustomerId = newCust.id;
        resolvedCustomerName = newCust.full_name;
        // Trigger 2+2+2 follow-up prompt for newly-created customers
        setFollowUpPrompt({ id: newCust.id, name: newCust.full_name, pendingNav: !(addAnother || bulkMode) });
      }

      let eventId: string | null = null;

      if (isEventBased && selectedEventId) {
        eventId = selectedEventId;
      }

      await createOrder({
        customer_id: resolvedCustomerId,
        customer_name: resolvedCustomerName,
        order_date: orderDate,
        event_id: eventId || undefined,
        order_type: orderType,
        face_type: isNonCustomer ? "Non-Customer" : undefined,
        payment_status: paymentStatus,
        payment_type: paymentStatus === "Unpaid" ? null : paymentType,
        retail_amount: Number(retailAmount) || 0,
        wholesale_amount: wholesaleAmount ? Number(wholesaleAmount) : null,
        discount_amount: financials.discount,
        tax_amount: financials.tax,
        cc_fee_amount: financials.ccFee,
        net_received: paymentStatus === "Paid" ? financials.netReceived : null,
        notes: notes || undefined,
        parent_event_id: isEventBased ? selectedEventId : null,
      });

      // Auto-schedule post-order follow-up — SKIP for non-customer orders so
      // one-time/online buyers do not enter the follow-up system.
      if (!isNonCustomer) {
        try {
          await applyPostOrderFollowUp({
            customerId: resolvedCustomerId,
            orderDate,
            needsCatalog,
          });
        } catch (e) {
          console.error("Post-order follow-up failed", e);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-orders", resolvedCustomerId] });

      setSavedCount(prev => prev + 1);
      toast.success(`Order saved for ${resolvedCustomerName}`);

      if (addAnother || bulkMode) {
        setCustomerId("");
        setCustomerName("");
        setCustomerSearch("");
        setIsNewCustomer(false);
        setIsNonCustomer(false);
        setNonCustomerLabel("");
        setNewCustName(""); setNewCustPhone(""); setNewCustEmail("");
        setNewCustAddress(""); setNewCustCity(""); setNewCustState(""); setNewCustPostal("");
        setNewCustBirthday(""); setShowAdditional(false); setDuplicateMatch(null);
        setRetailAmount("");
        setWholesaleAmount("");
        setNotes("");
        setPaymentType("");
        setPaymentStatus("Paid");
        setNeedsCatalog(false);
        setAttempted(false);
      } else if (!isNewCustomer) {
        // For existing-customer orders, navigate immediately. New-customer
        // orders defer navigation until the 2+2+2 follow-up prompt closes.
        navigate("/orders");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, validationErrors, isEventBased, selectedEventId, customerId, customerName, orderDate, orderType, paymentType, paymentStatus, retailAmount, wholesaleAmount, notes, bulkMode, queryClient, navigate, isNewCustomer, newCustName, newCustPhone, newCustEmail, newCustAddress, newCustCity, newCustState, newCustPostal, newCustBirthday, needsCatalog, isNonCustomer, nonCustomerLabel, user]);

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
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Customer *</label>
            {!selectedCustomer && !isNewCustomer && (
              <button
                type="button"
                onClick={() => {
                  setIsNonCustomer(!isNonCustomer);
                  setCustomerId(""); setCustomerName(""); setCustomerSearch("");
                  setIsNewCustomer(false);
                }}
                className={cn(
                  "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border transition-colors",
                  isNonCustomer
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Store className="w-3 h-3" />
                Non-Customer / One-Time Order
              </button>
            )}
          </div>

          {isNonCustomer ? (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-primary" /> One-Time / Support Order
                </span>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setIsNonCustomer(false); setNonCustomerLabel(""); }}>
                  Cancel
                </Button>
              </div>
              <Input
                placeholder="Buyer label (optional, e.g. 'MyShop online', 'Goal support')"
                value={nonCustomerLabel}
                onChange={e => setNonCustomerLabel(e.target.value)}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground leading-snug">
                This order will be tracked but the buyer will not be added to follow-up lists or customer metrics.
              </p>
            </div>
          ) : selectedCustomer ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div>
                <span className="font-medium text-sm">{selectedCustomer.full_name}</span>
                {selectedCustomer.phone && <span className="text-xs text-muted-foreground ml-2">{selectedCustomer.phone}</span>}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setCustomerId(""); setCustomerName(""); setCustomerSearch(""); setIsNewCustomer(false); }}>Change</Button>
            </div>
          ) : isNewCustomer ? (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-primary" /> New Customer
                </span>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setIsNewCustomer(false); setNewCustName(""); setNewCustPhone(""); setNewCustEmail(""); setDuplicateMatch(null); }}>
                  Cancel
                </Button>
              </div>

              {/* Duplicate match warning */}
              {duplicateMatch && (
                <div className="flex items-center justify-between p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Existing customer found</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">{duplicateMatch.full_name}{duplicateMatch.phone ? ` · ${duplicateMatch.phone}` : ""}</p>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => {
                    setCustomerId(duplicateMatch.id);
                    setCustomerName(duplicateMatch.full_name);
                    setIsNewCustomer(false);
                    setDuplicateMatch(null);
                  }}>
                    Use this one
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <Input placeholder="Name *" value={newCustName} onChange={e => setNewCustName(e.target.value)} className="h-9" autoFocus />
                </div>
                <Input placeholder="Phone" value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} className="h-9" />
                <Input placeholder="Email" value={newCustEmail} onChange={e => setNewCustEmail(e.target.value)} className="h-9" />
              </div>

              <Collapsible open={showAdditional} onOpenChange={setShowAdditional}>
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdditional && "rotate-180")} />
                    Additional Details (optional)
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-2">
                  <Input placeholder="Address" value={newCustAddress} onChange={e => setNewCustAddress(e.target.value)} className="h-9" />
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="City" value={newCustCity} onChange={e => setNewCustCity(e.target.value)} className="h-9" />
                    <Input placeholder="State" value={newCustState} onChange={e => setNewCustState(e.target.value)} className="h-9" />
                    <Input placeholder="Zip" value={newCustPostal} onChange={e => setNewCustPostal(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">Birthday</label>
                    <Input type="date" value={newCustBirthday} onChange={e => setNewCustBirthday(e.target.value)} className="h-9" />
                  </div>
                </CollapsibleContent>
              </Collapsible>
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
              <Button type="button" variant="ghost" size="sm" className="text-xs text-primary h-7 gap-1" onClick={() => { setIsNewCustomer(true); setCustomerSearch(""); }}>
                <UserPlus className="w-3.5 h-3.5" /> Add New Customer
              </Button>
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

        {/* Payment Status */}
        <div>
          <label className="text-sm font-medium text-foreground">Payment Status</label>
          <div className="flex gap-1.5 mt-1">
            {(["Paid", "Unpaid"] as const).map(s => (
              <button key={s} type="button"
                className={cn("h-8 px-4 rounded-md text-xs font-medium border transition-colors",
                  paymentStatus === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
                onClick={() => { setPaymentStatus(s); if (s === "Unpaid") setPaymentType(""); }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Payment Type — button pills (only when Paid) */}
        {paymentStatus === "Paid" && (
          <div>
            <label className="text-sm font-medium text-foreground">Payment Method *</label>
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
        )}

        {paymentStatus === "Unpaid" && (
          <p className="text-xs text-muted-foreground">Payment method is optional for unpaid orders and will be saved blank.</p>
        )}

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-foreground">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Textarea placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} className="h-16 resize-none" />
        </div>

        {/* Catalog follow-up option */}
        <label className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={needsCatalog}
            onChange={e => setNeedsCatalog(e.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <span className="text-sm">
            <span className="font-medium text-foreground">Needs new catalog follow-up</span>
            <span className="block text-xs text-muted-foreground">
              Schedules follow-up at order date + 25 days instead of the default + 14 days.
            </span>
          </span>
        </label>

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

        {/* Validation hints — always visible when errors exist and user has started filling the form */}
        {validationErrors.length > 0 && (attempted || retailAmount || customerId || isNewCustomer) && (
          <div className="text-xs text-destructive space-y-0.5 pt-1 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <p className="font-medium text-destructive mb-1">Please fix the following to save:</p>
            {validationErrors.map((e, i) => (
              <p key={i} className="flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" /> {e}
              </p>
            ))}
          </div>
        )}
      </div>
      <NewCustomerFollowUpDialog
        customerId={followUpPrompt?.id ?? null}
        customerName={followUpPrompt?.name ?? ""}
        open={!!followUpPrompt}
        onClose={() => {
          const shouldNav = followUpPrompt?.pendingNav;
          setFollowUpPrompt(null);
          if (shouldNav) navigate("/orders");
        }}
      />
    </Layout>
  );
}
