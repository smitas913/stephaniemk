import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrders, deleteOrder, updateOrder } from "@/lib/queries";
import { ORDER_TYPES, PAYMENT_TYPES } from "@/lib/types";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Search, Copy, ChevronDown, ChevronRight, ShoppingBag, DollarSign, RotateCcw, Users, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { OrderWithCustomer } from "@/lib/types";

export default function Orders() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterOrderType, setFilterOrderType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterHostess, setFilterHostess] = useState(false);
  const [filterBirthday, setFilterBirthday] = useState(false);
  const [filterReferral, setFilterReferral] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const { data: orders = [], isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const deleteMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order deleted");
    },
  });

  const filtered = useMemo(() => {
    let result = orders;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) =>
        (o.customer_name || o.customers?.full_name || "").toLowerCase().includes(q) ||
        (o.event_id || "").toLowerCase().includes(q)
      );
    }
    if (dateFrom) result = result.filter((o) => o.order_date >= dateFrom);
    if (dateTo) result = result.filter((o) => o.order_date <= dateTo);
    if (filterOrderType !== "all") result = result.filter((o) => o.order_type === filterOrderType);
    if (filterPayment !== "all") result = result.filter((o) => o.payment_type === filterPayment);
    if (filterHostess) result = result.filter((o) => o.hostess);
    if (filterBirthday) result = result.filter((o) => o.birthday);
    if (filterReferral) result = result.filter((o) => o.referral);
    return result;
  }, [orders, search, dateFrom, dateTo, filterOrderType, filterPayment, filterHostess, filterBirthday, filterReferral]);

  // Summary metrics
  const summary = useMemo(() => {
    const totalOrders = filtered.length;
    const totalRetail = filtered.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    const reorderTotal = filtered.filter((o) => o.order_type === "Reorder").reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    const partyTotal = filtered.filter((o) => o.order_type === "Party").reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    const facialTotal = filtered.filter((o) => o.order_type === "Facial").reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    return { totalOrders, totalRetail, reorderTotal, partyTotal, facialTotal };
  }, [filtered]);

  // Group orders by event_id for party display
  const { grouped, standalone } = useMemo(() => {
    const eventMap = new Map<string, OrderWithCustomer[]>();
    const standaloneOrders: OrderWithCustomer[] = [];

    for (const o of filtered) {
      if (o.parent_event_id) {
        const group = eventMap.get(o.parent_event_id) || [];
        group.push(o);
        eventMap.set(o.parent_event_id, group);
      } else if (o.event_id && filtered.some((x) => x.parent_event_id === o.event_id)) {
        // This is a party parent
        const group = eventMap.get(o.event_id) || [];
        group.unshift(o);
        eventMap.set(o.event_id, group);
      } else {
        standaloneOrders.push(o);
      }
    }
    return { grouped: eventMap, standalone: standaloneOrders };
  }, [filtered]);

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const summaryCards = [
    { label: "Total Orders", value: String(summary.totalOrders), icon: ShoppingBag, accent: "text-blue-600" },
    { label: "Total Retail", value: `$${summary.totalRetail.toFixed(2)}`, icon: DollarSign, accent: "text-green-600" },
    { label: "Reorders", value: `$${summary.reorderTotal.toFixed(2)}`, icon: RotateCcw, accent: "text-purple-600" },
    { label: "Party", value: `$${summary.partyTotal.toFixed(2)}`, icon: Users, accent: "text-pink-600" },
    { label: "Facial", value: `$${summary.facialTotal.toFixed(2)}`, icon: Sparkles, accent: "text-amber-600" },
  ];

  const renderOrderRow = (o: OrderWithCustomer, isChild = false) => (
    <TableRow key={o.id} className={cn("hover:bg-muted/50 transition-colors", isChild && "bg-muted/20")}>
      <TableCell className="text-xs whitespace-nowrap">{new Date(o.order_date).toLocaleDateString()}</TableCell>
      <TableCell className="text-xs font-mono max-w-[140px] truncate" title={o.event_id || ""}>
        {isChild && <span className="text-muted-foreground mr-1">↳</span>}
        {o.event_id || "—"}
      </TableCell>
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
      <TableCell className="text-xs">{o.payment_type || "—"}</TableCell>
      <TableCell className="text-xs max-w-[120px] truncate" title={o.notes || ""}>{o.notes || ""}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Duplicate"
            onClick={(e) => { e.stopPropagation(); navigate(`/orders/new?duplicate=${o.id}`); }}>
            <Copy className="w-3 h-3 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(o.id); }}>
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Orders</h2>
            <p className="text-sm text-muted-foreground">{orders.length} total</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/orders/new?mode=party")}>
              <Users className="w-4 h-4 mr-1" />Party Event
            </Button>
            <Button size="sm" onClick={() => navigate("/orders/new")}>
              <Plus className="w-4 h-4 mr-1" />New Order
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search customer or event ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
          </div>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-[140px]" placeholder="From" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-[140px]" placeholder="To" />
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
                  <TableHead className="text-xs w-[90px]">Date</TableHead>
                  <TableHead className="text-xs w-[140px]">Event ID</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right w-[90px]">Amount</TableHead>
                  <TableHead className="text-xs w-[80px]">Type</TableHead>
                  <TableHead className="text-xs w-[80px]">Face</TableHead>
                  <TableHead className="text-xs text-center w-[50px]">H</TableHead>
                  <TableHead className="text-xs text-center w-[50px]">½</TableHead>
                  <TableHead className="text-xs text-center w-[50px]">BD</TableHead>
                  <TableHead className="text-xs text-center w-[50px]">Ref</TableHead>
                  <TableHead className="text-xs w-[70px]">Pay</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                  <TableHead className="text-xs w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Grouped party events */}
                {Array.from(grouped.entries()).map(([eventId, group]) => {
                  const isExpanded = expandedEvents.has(eventId);
                  const parentOrder = group[0];
                  const childOrders = group.slice(1);
                  const groupTotal = group.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
                  return [
                    <TableRow key={`group-${eventId}`} className="bg-pink-50/50 hover:bg-pink-50 cursor-pointer" onClick={() => toggleEvent(eventId)}>
                      <TableCell colSpan={3} className="text-xs font-medium">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <Users className="w-3.5 h-3.5 text-pink-600" />
                          <span className="font-mono">{eventId}</span>
                          <span className="text-muted-foreground">({group.length} orders)</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-bold text-right">${groupTotal.toFixed(2)}</TableCell>
                      <TableCell colSpan={9}></TableCell>
                    </TableRow>,
                    ...(isExpanded ? [renderOrderRow(parentOrder, false), ...childOrders.map((o) => renderOrderRow(o, true))] : []),
                  ];
                })}
                {/* Standalone orders */}
                {standalone.map((o) => renderOrderRow(o))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
