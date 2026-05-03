import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrders, deleteOrder, updateOrder } from "@/lib/queries";
import { ORDER_TYPES, PAYMENT_TYPES, FACE_TYPES } from "@/lib/types";
import { backfillDefaultDiscountTypes, type DiscountType } from "@/lib/discountTypes";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { OrderWithCustomer } from "@/lib/types";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Trash2, Search, Copy, ShoppingBag,
  DollarSign, RotateCcw, Sparkles, ArrowUpDown, ArrowUp, ArrowDown,
  X, Download, CalendarIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseISO, isWithinInterval } from "date-fns";
import { formatDateOnly } from "@/lib/dateOnly";
import { usePeriodFilter, getDateRange, getShortLabel, MonthYearPicker, MONTHS, type PeriodValue } from "@/hooks/usePeriodFilter";
import FinancialSnapshot from "@/components/FinancialSnapshot";

type SortField = "order_date" | "customer_name" | "retail_amount" | "order_type" | "payment_status" | "face_type";

const SHORT_LABEL: Record<string, string> = {
  "Birthday Discount": "Bday",
  "Half Price Deal": "½ Price",
  "Hostess Credit": "Hostess",
  "Referral Gift": "Referral",
  "Sets Sheet": "Sets Sheet",
  "Other": "Other",
};
const shortLabel = (name: string) => SHORT_LABEL[name] ?? name;
type SortDir = "asc" | "desc" | null;

export default function Orders() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const { period, setPeriod } = usePeriodFilter();
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [filterOrderType, setFilterOrderType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterFaceType, setFilterFaceType] = useState("all");
  const [filterDiscountIds, setFilterDiscountIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>("order_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: orders = [], isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: discountTypes = [] } = useQuery<DiscountType[]>({
    queryKey: ["discount_types"],
    queryFn: backfillDefaultDiscountTypes,
  });
  const discountById = useMemo(() => {
    const m = new Map<string, DiscountType>();
    for (const d of discountTypes) m.set(d.id, d);
    return m;
  }, [discountTypes]);

  const deleteMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order deleted");
    },
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, payment_status, payment_type }: { id: string; payment_status: "Paid" | "Unpaid"; payment_type: string | null }) =>
      updateOrder(id, { payment_status, payment_type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Payment updated");
    },
  });

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      const name = o.customer_name || o.customers?.full_name || "";
      if (name && o.customer_id) map.set(o.customer_id, name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const periodLabel = getShortLabel(period);

  const hasActiveFilters = search || filterCustomer !== "all" || period.type !== "mtd" ||
    filterOrderType !== "all" || filterPayment !== "all" || filterFaceType !== "all" ||
    filterDiscountIds.length > 0;

  const clearFilters = useCallback(() => {
    setSearch(""); setFilterCustomer("all"); setPeriod({ type: "mtd" });
    setFilterOrderType("all"); setFilterPayment("all"); setFilterFaceType("all");
    setFilterDiscountIds([]);
  }, []);

  const filtered = useMemo(() => {
    let result = orders;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) =>
        (o.customer_name || o.customers?.full_name || "").toLowerCase().includes(q) ||
        (o.notes || "").toLowerCase().includes(q) ||
          (o.payment_status || "").toLowerCase().includes(q) ||
        (o.payment_type || "").toLowerCase().includes(q) ||
        (o.order_type || "").toLowerCase().includes(q)
      );
    }

    if (filterCustomer !== "all") result = result.filter((o) => o.customer_id === filterCustomer);

    const { start, end } = getDateRange(period);
    result = result.filter((o) => {
      const d = parseISO(o.order_date);
      return isWithinInterval(d, { start, end });
    });

    if (filterOrderType !== "all") result = result.filter((o) => o.order_type === filterOrderType);
    if (filterPayment === "__unpaid__") result = result.filter((o) => o.payment_status === "Unpaid" || (!o.payment_status && !o.payment_type));
    else if (filterPayment !== "all") result = result.filter((o) => o.payment_type === filterPayment);
    if (filterFaceType !== "all") result = result.filter((o) => o.face_type === filterFaceType);
    if (filterDiscountIds.length > 0) {
      const set = new Set(filterDiscountIds);
      result = result.filter((o) => {
        const ids: string[] = Array.isArray((o as any).discount_type_ids) ? (o as any).discount_type_ids : [];
        // Include legacy boolean flags by mapping to known default names
        const legacy: string[] = [];
        for (const t of discountTypes) {
          if (t.name === "Hostess Credit" && (o as any).hostess) legacy.push(t.id);
          if (t.name === "Half Price Deal" && (o as any).half_price_deal) legacy.push(t.id);
          if (t.name === "Birthday Discount" && (o as any).birthday) legacy.push(t.id);
          if (t.name === "Referral Gift" && (o as any).referral) legacy.push(t.id);
        }
        return [...ids, ...legacy].some((id) => set.has(id));
      });
    }

    if (sortDir === null) return result;

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "order_date": cmp = a.order_date.localeCompare(b.order_date); break;
        case "customer_name": cmp = (a.customer_name || "").localeCompare(b.customer_name || ""); break;
        case "retail_amount": cmp = Number(a.retail_amount) - Number(b.retail_amount); break;
        case "order_type": cmp = (a.order_type || "").localeCompare(b.order_type || ""); break;
        case "payment_status": cmp = (a.payment_status || "").localeCompare(b.payment_status || ""); break;
        case "face_type": cmp = (a.face_type || "").localeCompare(b.face_type || ""); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return sorted;
  }, [orders, search, filterCustomer, period, filterOrderType, filterPayment, filterFaceType, filterDiscountIds, discountTypes, sortField, sortDir]);

  const summary = useMemo(() => {
    const totalOrders = filtered.length;
    const totalRetail = filtered.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    const reorderTotal = filtered.filter((o) => o.order_type === "Reorder").reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    const partyTotal = filtered.filter((o) => o.order_type === "Party").reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    const facialTotal = filtered.filter((o) => o.order_type === "Facial").reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    return { totalOrders, totalRetail, reorderTotal, partyTotal, facialTotal };
  }, [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortField("order_date"); setSortDir("desc"); }
      else setSortDir("asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field || sortDir === null) return <ArrowUpDown className="w-3 h-3 ml-1 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1 text-primary" /> : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  const exportCSV = () => {
    const headers = ["Date", "Customer", "Amount", "Type", "Face", "Hostess", "Half Price", "Birthday", "Referral", "Payment Status", "Payment Method", "Notes"];
    const rows = filtered.map((o) => [
      o.order_date, o.customer_name || o.customers?.full_name || "",
      Number(o.retail_amount).toFixed(2), o.order_type || "", o.face_type || "",
      o.hostess ? "Yes" : "", o.half_price_deal ? "Yes" : "", o.birthday ? "Yes" : "",
      o.referral ? "Yes" : "", o.payment_status || "", o.payment_type || "", (o.notes || "").replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "orders.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const summaryCards = [
    { label: "Total Orders", value: String(summary.totalOrders), icon: ShoppingBag, accent: "text-blue-600" },
    { label: "Total Retail", value: `$${summary.totalRetail.toFixed(2)}`, icon: DollarSign, accent: "text-green-600" },
    { label: "Reorders", value: `$${summary.reorderTotal.toFixed(2)}`, icon: RotateCcw, accent: "text-purple-600" },
    { label: "Event Sales", value: `$${(summary.partyTotal + summary.facialTotal).toFixed(2)}`, icon: Sparkles, accent: "text-pink-600" },
  ];

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Orders</h2>
            <p className="text-sm text-muted-foreground">{orders.length} total · {filtered.length} shown ({periodLabel})</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-1" />CSV
            </Button>
            <Button size="sm" onClick={() => navigate("/orders/new")}>
              <Plus className="w-4 h-4 mr-1" />New Order
            </Button>
          </div>
        </div>

        <FinancialSnapshot range="mtd" />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summaryCards.map((c) => (
            <Card key={c.label} className="border-border/50 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <c.icon className={cn("w-4 h-4", c.accent)} />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{c.label}</span>
                </div>
                <p className={cn("text-lg font-bold", c.accent)}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search name, notes, type..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
          </div>
          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Customer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customerOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1.5">
            <Button variant={period.type === "ytd" ? "default" : "outline"} size="sm" className="h-9 text-xs" onClick={() => setPeriod({ type: "ytd" })}>YTD</Button>
            <Button variant={period.type === "mtd" ? "default" : "outline"} size="sm" className="h-9 text-xs" onClick={() => setPeriod({ type: "mtd" })}>MTD</Button>
            <Button variant={period.type === "last-month" ? "default" : "outline"} size="sm" className="h-9 text-xs" onClick={() => setPeriod({ type: "last-month" })}>Last Month</Button>
            <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant={period.type === "month" ? "default" : "outline"} size="sm" className="h-9 text-xs">
                  <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                  {period.type === "month" ? `${MONTHS[period.month].slice(0, 3)} ${period.year}` : "Month"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <MonthYearPicker onSelect={(year, month) => { setPeriod({ type: "month", year, month }); setMonthPickerOpen(false); }} />
              </PopoverContent>
            </Popover>
          </div>
          <Select value={`${sortField}-${sortDir}`} onValueChange={(v) => { const [f, d] = v.split("-") as [SortField, SortDir]; setSortField(f); setSortDir(d); }}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="order_date-desc">Newest First</SelectItem>
              <SelectItem value="order_date-asc">Oldest First</SelectItem>
              <SelectItem value="retail_amount-desc">Highest Amount</SelectItem>
              <SelectItem value="retail_amount-asc">Lowest Amount</SelectItem>
              <SelectItem value="customer_name-asc">Customer A-Z</SelectItem>
              <SelectItem value="customer_name-desc">Customer Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filterOrderType} onValueChange={setFilterOrderType}>
            <SelectTrigger className="h-9 w-[120px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ORDER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPayment} onValueChange={setFilterPayment}>
            <SelectTrigger className="h-9 w-[120px]"><SelectValue placeholder="Payment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="__unpaid__">Unpaid</SelectItem>
              {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterFaceType} onValueChange={setFilterFaceType}>
            <SelectTrigger className="h-9 w-[110px]"><SelectValue placeholder="Face" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Faces</SelectItem>
              {FACE_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs">
                Discount Tags{filterDiscountIds.length > 0 ? ` (${filterDiscountIds.length})` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1 max-h-64 overflow-auto">
                {discountTypes.filter((d) => !d.is_archived).map((d) => {
                  const checked = filterDiscountIds.includes(d.id);
                  return (
                    <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted px-2 py-1 rounded">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setFilterDiscountIds((prev) =>
                            v ? [...prev, d.id] : prev.filter((id) => id !== d.id),
                          )
                        }
                      />
                      {shortLabel(d.name)}
                    </label>
                  );
                })}
                {filterDiscountIds.length > 0 && (
                  <button type="button" className="text-[11px] text-primary hover:underline px-2 pt-1" onClick={() => setFilterDiscountIds([])}>
                    Clear
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={clearFilters}>
              <X className="w-3 h-3 mr-1" />Clear
            </Button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No orders found.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs w-[90px] cursor-pointer select-none" onClick={() => toggleSort("order_date")}>
                    <span className="flex items-center">Date<SortIcon field="order_date" /></span>
                  </TableHead>
                  <TableHead className="text-xs cursor-pointer select-none" onClick={() => toggleSort("customer_name")}>
                    <span className="flex items-center">Customer<SortIcon field="customer_name" /></span>
                  </TableHead>
                  <TableHead className="text-xs text-right w-[90px] cursor-pointer select-none" onClick={() => toggleSort("retail_amount")}>
                    <span className="flex items-center justify-end">Amount<SortIcon field="retail_amount" /></span>
                  </TableHead>
                  <TableHead className="text-xs w-[80px] cursor-pointer select-none" onClick={() => toggleSort("order_type")}>
                    <span className="flex items-center">Type<SortIcon field="order_type" /></span>
                  </TableHead>
                  <TableHead className="text-xs w-[60px] cursor-pointer select-none" onClick={() => toggleSort("face_type")}>
                    <span className="flex items-center">Face<SortIcon field="face_type" /></span>
                  </TableHead>
                  <TableHead className="text-xs w-[180px]">Discount Tags</TableHead>
                  <TableHead className="text-xs w-[90px] cursor-pointer select-none" onClick={() => toggleSort("payment_status")}>
                    <span className="flex items-center">Pay<SortIcon field="payment_status" /></span>
                  </TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                  <TableHead className="text-xs w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/orders/${o.id}/edit`)}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateOnly(o.order_date)}</TableCell>
                    <TableCell className="text-sm font-medium">{o.customer_name || o.customers?.full_name || "—"}</TableCell>
                    <TableCell className="text-sm font-semibold text-right">${Number(o.retail_amount).toFixed(2)}</TableCell>
                    <TableCell>
                      {o.order_type && (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                          o.order_type === "Reorder" ? "bg-purple-100 text-purple-700" :
                          o.order_type === "Party" ? "bg-pink-100 text-pink-700" :
                          "bg-amber-100 text-amber-700"
                        )}>{o.order_type}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{o.face_type || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        const tags: string[] = [];
                        const ids: string[] = Array.isArray((o as any).discount_type_ids) ? (o as any).discount_type_ids : [];
                        for (const id of ids) {
                          const t = discountById.get(id);
                          if (t) tags.push(shortLabel(t.name));
                        }
                        // Add legacy boolean flags if not already represented
                        const has = (name: string) => tags.includes(shortLabel(name));
                        if ((o as any).hostess && !has("Hostess Credit")) tags.push("Hostess");
                        if ((o as any).half_price_deal && !has("Half Price Deal")) tags.push("½ Price");
                        if ((o as any).birthday && !has("Birthday Discount")) tags.push("Bday");
                        if ((o as any).referral && !has("Referral Gift")) tags.push("Referral");
                        if (tags.length === 0) return <span className="text-muted-foreground">—</span>;
                        const visible = tags.slice(0, 2);
                        const extra = tags.length - visible.length;
                        return (
                          <div className="flex flex-wrap items-center gap-1">
                            {visible.map((t) => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/80 font-medium">{t}</span>
                            ))}
                            {extra > 0 && (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground cursor-default">+{extra}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">{tags.join(", ")}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="p-0.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {(o.payment_status === "Unpaid" || (!o.payment_status && !o.payment_type)) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-destructive/10 text-destructive whitespace-nowrap">Unpaid</span>
                        )}
                        <Select
                          value={o.payment_type || "__blank__"}
                          onValueChange={(v) => paymentMutation.mutate({
                            id: o.id,
                            payment_status: v === "__blank__" ? "Unpaid" : "Paid",
                            payment_type: v === "__blank__" ? null : v,
                          })}
                        >
                          <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1.5 w-[80px] focus:ring-1">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__blank__">— None</SelectItem>
                            {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate" title={o.notes || ""}>{o.notes || ""}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Duplicate"
                          onClick={() => navigate(`/orders/new?duplicate=${o.id}`)}>
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => deleteMutation.mutate(o.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
