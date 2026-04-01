import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fetchCustomers, fetchProducts, createOrder, createOrderItem, createCustomer, createPayment } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus, X, CalendarIcon, UserPlus, Check, ChevronDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface LineItem {
  product_name: string;
  quantity: number;
  price: number;
}

const ORDER_SOURCES = ["Online", "Phone", "Text", "Event", "Other"] as const;
const PAYMENT_STATUSES = ["Paid", "Unpaid", "Partial"] as const;
const PAYMENT_METHODS = ["Cash", "Check", "Venmo", "Zelle", "Card", "Other"] as const;

function QuickSelect({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "px-3 py-2 rounded-lg text-sm font-medium transition-all active:scale-95",
              value === opt
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });

  const preselectedCustomerId = searchParams.get("customer") || "";
  const preselectedCustomer = customers.find((c) => c.id === preselectedCustomerId);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(
    preselectedCustomer ? { id: preselectedCustomer.id, name: preselectedCustomer.name } : null
  );
  const [showResults, setShowResults] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  // Update selected customer when preselected data arrives
  useEffect(() => {
    if (preselectedCustomer && !selectedCustomer) {
      setSelectedCustomer({ id: preselectedCustomer.id, name: preselectedCustomer.name });
    }
  }, [preselectedCustomer, selectedCustomer]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q)
    ).slice(0, 8);
  }, [customerSearch, customers]);

  // Order fields
  const [orderSource, setOrderSource] = useState<string>("Other");
  const [orderDate, setOrderDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");

  // Items
  const [items, setItems] = useState<LineItem[]>([{ product_name: "", quantity: 1, price: 0 }]);

  // Payment
  const [paymentStatus, setPaymentStatus] = useState<string>("Unpaid");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [paymentAmount, setPaymentAmount] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const addItem = () => setItems([...items, { product_name: "", quantity: 1, price: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    const updated = [...items];
    (updated[i] as any)[field] = value;
    setItems(updated);
  };

  const createCustomerMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setSelectedCustomer({ id: data.id, name: data.name });
      setShowNewCustomer(false);
      setCustomerSearch("");
      setNewCustomerName("");
      setNewCustomerPhone("");
      toast.success(`${data.name} added!`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) { toast.error("Select a customer"); return; }
    if (!items.some((i) => i.product_name.trim())) { toast.error("Add at least one item"); return; }
    setSubmitting(true);
    try {
      const order = await createOrder({
        customer_id: selectedCustomer.id,
        order_source: orderSource as any,
        order_date: format(orderDate, "yyyy-MM-dd"),
        payment_status: paymentStatus as any,
        payment_method: paymentMethod as any,
        notes: notes || undefined,
        total_amount: total,
      });

      const validItems = items.filter((i) => i.product_name.trim());
      await Promise.all(validItems.map((item) => createOrderItem({ order_id: order.id, ...item })));

      // Create payment record if amount entered
      const payAmt = parseFloat(paymentAmount);
      if (payAmt > 0 && paymentStatus !== "Unpaid") {
        await createPayment({
          order_id: order.id,
          amount: payAmt,
          payment_method: paymentMethod as any,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
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
      <div className="max-w-lg mx-auto pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">New Order</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Customer Search ── */}
          <section className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer *</label>

            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground">{selectedCustomer.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedCustomer(null); setTimeout(() => searchInputRef.current?.focus(), 50); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  ref={searchInputRef}
                  placeholder="Search by name or phone..."
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                  className="h-12 text-base"
                  autoComplete="off"
                />
                {showResults && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-accent active:bg-accent/80 transition-colors border-b border-border/50 last:border-b-0"
                        onClick={() => {
                          setSelectedCustomer({ id: c.id, name: c.name });
                          setCustomerSearch("");
                          setShowResults(false);
                        }}
                      >
                        <p className="font-medium text-foreground">{c.name}</p>
                        {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && customerSearch.trim() && (
                      <div className="px-4 py-3 text-sm text-muted-foreground">No matches found</div>
                    )}
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 flex items-center gap-2 text-primary font-medium hover:bg-accent active:bg-accent/80 transition-colors"
                      onClick={() => {
                        setShowNewCustomer(true);
                        setShowResults(false);
                        setNewCustomerName(customerSearch);
                      }}
                    >
                      <UserPlus className="w-4 h-4" />
                      Create new customer
                    </button>
                  </div>
                )}

                {/* Click-away */}
                {showResults && (
                  <div className="fixed inset-0 z-10" onClick={() => setShowResults(false)} />
                )}
              </div>
            )}

            {/* Inline new customer form */}
            {showNewCustomer && (
              <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
                <p className="text-sm font-semibold text-foreground">Quick Add Customer</p>
                <Input
                  placeholder="Name *"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="h-11 text-base"
                  autoFocus
                />
                <Input
                  placeholder="Phone (optional)"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="h-11 text-base"
                  type="tel"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={!newCustomerName.trim() || createCustomerMutation.isPending}
                    onClick={() => createCustomerMutation.mutate({ name: newCustomerName.trim(), phone: newCustomerPhone || undefined })}
                  >
                    {createCustomerMutation.isPending ? "Adding..." : "Add & Select"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowNewCustomer(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </section>

          {/* ── Order Source + Date ── */}
          <section className="space-y-4">
            <QuickSelect label="Source" options={ORDER_SOURCES} value={orderSource} onChange={setOrderSource} />

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-11 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {format(orderDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={orderDate}
                    onSelect={(d) => d && setOrderDate(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </section>

          {/* ── Line Items ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</label>
              <Button type="button" variant="ghost" size="sm" onClick={addItem} className="text-primary -mr-2">
                <Plus className="w-4 h-4 mr-1" />Add
              </Button>
            </div>

            {items.map((item, i) => {
              const matchedProduct = products.find((p) => p.name.toLowerCase() === item.product_name.toLowerCase());
              const stockAfter = matchedProduct ? matchedProduct.current_stock - item.quantity : null;
              const isLowStock = stockAfter !== null && stockAfter < 5;
              const isOutOfStock = stockAfter !== null && stockAfter < 0;
              const productSuggestions = item.product_name.trim()
                ? products.filter((p) => p.name.toLowerCase().includes(item.product_name.toLowerCase()) && p.name.toLowerCase() !== item.product_name.toLowerCase()).slice(0, 5)
                : [];

              return (
                <div key={i} className={cn(
                  "p-3 rounded-xl border space-y-2",
                  isOutOfStock ? "bg-destructive/5 border-destructive/30" : isLowStock ? "bg-yellow-50 border-yellow-300" : "bg-muted/40 border-border/50"
                )}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Input
                        placeholder="Product name"
                        value={item.product_name}
                        onChange={(e) => updateItem(i, "product_name", e.target.value)}
                        className="h-11 text-base"
                        autoComplete="off"
                      />
                      {productSuggestions.length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                          {productSuggestions.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-accent active:bg-accent/80 transition-colors text-sm border-b border-border/50 last:border-b-0"
                              onClick={() => {
                                updateItem(i, "product_name", p.name);
                                updateItem(i, "price", p.price);
                              }}
                            >
                              <div className="flex justify-between">
                                <span className="font-medium text-foreground">{p.name}</span>
                                <span className="text-muted-foreground">${Number(p.price).toFixed(2)}</span>
                              </div>
                              <span className={cn("text-xs", p.current_stock < 5 ? "text-destructive" : "text-muted-foreground")}>
                                {p.current_stock} in stock
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive p-1">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Stock warning */}
                  {matchedProduct && (
                    <div className="flex items-center gap-1.5 text-xs">
                      {isOutOfStock ? (
                        <><AlertTriangle className="w-3.5 h-3.5 text-destructive" /><span className="text-destructive font-medium">Not enough stock ({matchedProduct.current_stock} available)</span></>
                      ) : isLowStock ? (
                        <><AlertTriangle className="w-3.5 h-3.5 text-yellow-600" /><span className="text-yellow-700 font-medium">Low stock — {stockAfter} will remain</span></>
                      ) : (
                        <span className="text-muted-foreground">{stockAfter} will remain in stock</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase text-muted-foreground">Qty</label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 0)}
                        className="h-10"
                        min={1}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] uppercase text-muted-foreground">Price</label>
                      <Input
                        type="number"
                        value={item.price || ""}
                        onChange={(e) => updateItem(i, "price", parseFloat(e.target.value) || 0)}
                        className="h-10"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="w-20 text-right pt-4">
                      <span className="text-sm font-bold text-foreground">${(item.quantity * item.price).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Running Total */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
              <span className="text-sm font-semibold text-foreground">Order Total</span>
              <span className="text-xl font-bold text-primary">${total.toFixed(2)}</span>
            </div>
          </section>

          {/* ── Payment ── */}
          <section className="space-y-4">
            <QuickSelect label="Payment Status" options={PAYMENT_STATUSES} value={paymentStatus} onChange={setPaymentStatus} />

            {paymentStatus !== "Unpaid" && (
              <>
                <QuickSelect label="Payment Method" options={PAYMENT_METHODS} value={paymentMethod} onChange={setPaymentMethod} />
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount Paid</label>
                  <Input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={total.toFixed(2)}
                    className="h-12 text-lg font-semibold"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                  />
                  {paymentStatus === "Paid" && !paymentAmount && (
                    <button
                      type="button"
                      className="text-xs text-primary font-medium"
                      onClick={() => setPaymentAmount(total.toFixed(2))}
                    >
                      Use full amount (${total.toFixed(2)})
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ── Notes ── */}
          <section className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
            <Textarea
              placeholder="Any notes about this order..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] text-base"
            />
          </section>

          {/* ── Submit ── */}
          <Button
            type="submit"
            className="w-full h-14 text-lg font-bold sticky bottom-4 shadow-lg"
            disabled={submitting || !selectedCustomer}
          >
            {submitting ? "Saving..." : `Save Order · $${total.toFixed(2)}`}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
