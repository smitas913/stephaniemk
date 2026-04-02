import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrders, deleteOrder, updateOrder } from "@/lib/queries";
import { ORDER_TYPES, PAYMENT_TYPES, FACE_TYPES } from "@/lib/types";
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
import { usePeriodFilter, getDateRange, getShortLabel, MonthYearPicker, MONTHS, type PeriodValue } from "@/hooks/usePeriodFilter";

type SortField = "order_date" | "customer_name" | "retail_amount" | "order_type" | "payment_type" | "face_type" | "hostess" | "half_price_deal" | "birthday" | "referral";
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
  const [filterHostess, setFilterHostess] = useState(false);
  const [filterBirthday, setFilterBirthday] = useState(false);
  const [filterReferral, setFilterReferral] = useState(false);
  const [sortField, setSortField] = useState<SortField>("order_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: orders = [], isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const deleteMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order deleted");
    },
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, payment_type }: { id: string; payment_type: string | null }) =>
      updateOrder(id, { payment_type }),
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
    filterHostess || filterBirthday || filterReferral;

  const clearFilters = useCallback(() => {
    setSearch(""); setFilterCustomer("all"); setPeriod({ type: "mtd" });
    setFilterOrderType("all"); setFilterPayment("all"); setFilterFaceType("all");
    setFilterHostess(false); setFilterBirthday(false); setFilterReferral(false);
  }, []);

  const filtered = useMemo(() => {
    let result = orders;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) =>
        (o.customer_name || o.customers?.full_name || "").toLowerCase().includes(q) ||
        (o.notes || "").toLowerCase().includes(q) ||
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
    if (filterPayment !== "all") result = result.filter((o) => o.payment_type === filterPayment);
    if (filterFaceType !== "all") result = result.filter((o) => o.face_type === filterFaceType);
    if (filterHostess) result = result.filter((o) => o.hostess);
    if (filterBirthday) result = result.filter((o) => o.birthday);
    if (filterReferral) result = result.filter((o) => o.referral);

    if (sortDir === null) return result;

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "order_date": cmp = a.order_date.localeCompare(b.order_date); break;
        case "customer_name": cmp = (a.customer_name || "").localeCompare(b.customer_name || ""); break;
        case "retail_amount": cmp = Number(a.retail_amount) - Number(b.retail_amount); break;
        case "order_type": cmp = (a.order_type || "").localeCompare(b.order_type || ""); break;
        case "payment_type": cmp = (a.payment_type || "").localeCompare(b.payment_type || ""); break;
        case "face_type": cmp = (a.face_type || "").localeCompare(b.face_type || ""); break;
        case "hostess": cmp = Number(!!a.hostess) - Number(!!b.hostess); break;
        case "half_price_deal": cmp = Number(!!a.half_price_deal) - Number(!!b.half_price_deal); break;
        case "birthday": cmp = Number(!!a.birthday) - Number(!!b.birthday); break;
        case "referral": cmp = Number(!!a.referral) - Number(!!b.referral); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return sorted;
  }, [orders, search, filterCustomer, period, filterOrderType, filterPayment, filterFaceType, filterHostess, filterBirthday, filterReferral, sortField, sortDir]);

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
    const headers = ["Date", "Customer", "Amount", "Type", "Face", "Hostess", "Half Price", "Birthday", "Referral", "Payment", "Notes"];
    const rows = filtered.map((o) => [
      o.order_date, o.customer_name || o.customers?.full_name || "",
      Number(o.retail_amount).toFixed(2), o.order_type || "", o.face_type || "",
      o.hostess ? "Yes" : "", o.half_price_deal ? "Yes" : "", o.birthday ? "Yes" : "",
      o.referral ? "Yes" : "", o.payment_type || "", (o.notes || "").replace(/"/g, '""'),
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
    { label: "Party Sales", value: `$${summary.partyTotal.toFixed(2)}`, icon: Sparkles, accent: "text-pink-600" },
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
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={filterHostess} onCheckedChange={(v) => setFilterHostess(!!v)} /> Hostess
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={filterBirthday} onCheckedChange={(v) => setFilterBirthday(!!v)} /> Birthday
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={filterReferral} onCheckedChange={(v) => setFilterReferral(!!v)} /> Referral
            </label>
          </div>
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
                  <TableHead className="text-xs text-center w-[40px] cursor-pointer select-none" onClick={() => toggleSort("hostess")}>
                    <span className="flex items-center justify-center">H<SortIcon field="hostess" /></span>
                  </TableHead>
                  <TableHead className="text-xs text-center w-[40px] cursor-pointer select-none" onClick={() => toggleSort("half_price_deal")}>
                    <span className="flex items-center justify-center">½<SortIcon field="half_price_deal" /></span>
                  </TableHead>
                  <TableHead className="text-xs text-center w-[40px] cursor-pointer select-none" onClick={() => toggleSort("birthday")}>
                    <span className="flex items-center justify-center">BD<SortIcon field="birthday" /></span>
                  </TableHead>
                  <TableHead className="text-xs text-center w-[40px] cursor-pointer select-none" onClick={() => toggleSort("referral")}>
                    <span className="flex items-center justify-center">Ref<SortIcon field="referral" /></span>
                  </TableHead>
                  <TableHead className="text-xs w-[90px] cursor-pointer select-none" onClick={() => toggleSort("payment_type")}>
                    <span className="flex items-center">Pay<SortIcon field="payment_type" /></span>
                  </TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                  <TableHead className="text-xs w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/orders/${o.id}/edit`)}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(o.order_date).toLocaleDateString()}</TableCell>
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
                    <TableCell className="text-center">{o.hostess ? "✓" : ""}</TableCell>
                    <TableCell className="text-center">{o.half_price_deal ? "✓" : ""}</TableCell>
                    <TableCell className="text-center">{o.birthday ? "✓" : ""}</TableCell>
                    <TableCell className="text-center">{o.referral ? "✓" : ""}</TableCell>
                    <TableCell className="p-0.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={o.payment_type || "__blank__"}
                        onValueChange={(v) => paymentMutation.mutate({ id: o.id, payment_type: v === "__blank__" ? null : v })}
                      >
                        <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1.5 w-[90px] focus:ring-1">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__blank__">— Unpaid</SelectItem>
                          {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
