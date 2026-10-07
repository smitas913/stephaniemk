import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { parseISO, isWithinInterval } from "date-fns";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DollarSign, CalendarIcon, ArrowUpDown, BarChart3, ListOrdered, TrendingUp } from "lucide-react";
import { fetchCustomers, fetchOrders, fetchEvents, fetchAllEventGuests } from "@/lib/queries";
import type { EventRecord } from "@/lib/types";
import { personalEvents } from "@/lib/eventScope";
import { toLocalDateKey, formatDateOnly } from "@/lib/dateOnly";
import { cn } from "@/lib/utils";
import {
  usePeriodFilter,
  getDateRange,
  getPeriodLabel,
  MonthYearPicker,
  MONTHS,
} from "@/hooks/usePeriodFilter";

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;

function inRange(d: string | null | undefined, start: Date, end: Date) {
  if (!d) return false;
  try {
    return isWithinInterval(parseISO(d.slice(0, 10)), { start, end });
  } catch {
    return false;
  }
}

const isHeld = (e: EventRecord) =>
  e.event_status === "Held" ||
  (e.event_status === "Booked" && !!e.event_date && e.event_date.slice(0, 10) < toLocalDateKey());

export function orderProfit(o: any): number {
  if (o.net_profit !== null && o.net_profit !== undefined) return Number(o.net_profit) || 0;
  return (Number(o.retail_amount) || 0) - (Number(o.discount_amount) || 0) - (Number(o.wholesale_amount) || 0);
}

type Row = {
  ev: EventRecord;
  faces: number;
  orders: number;
  orderingGuests: number;
  sales: number;
  profit: number;
  perFace: number;
  futureBookings: number;
};

type SortKey = "date" | "sales" | "profit";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xl sm:text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
        <p className="text-[11px] font-semibold text-muted-foreground mt-1 uppercase tracking-wider">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// Event types averaged separately, so a strong party month doesn't skew
// facial or guest-event averages.
const AVERAGE_GROUPS = [
  { key: "Party", label: "Parties" },
  { key: "Facial", label: "Facials" },
  { key: "Guest Event", label: "Guest Events" },
] as const;

function AvgRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

export default function EventResults() {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriodFilter();
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: orders = [], isLoading: oLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: allEvents = [], isLoading: eLoading } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: allGuests = [], isLoading: gLoading } = useQuery({
    queryKey: ["all-event-guests"],
    queryFn: fetchAllEventGuests,
  });

  const data = useMemo(() => {
    const { start, end } = getDateRange(period);
    const consultantIds = new Set(
      (customers as any[])
        .filter((c) => c.relationship_status === "Consultant" || c.relationship_status === "Former Consultant")
        .map((c) => c.id),
    );
    const events = personalEvents(allEvents).filter(
      (e) => !e.is_archived && e.event_status !== "Cancelled" && isHeld(e) && inRange(e.event_date, start, end),
    );

    // Index orders by event_id (each order counted once even if both fields match)
    const byEvent = new Map<string, any[]>();
    for (const o of orders as any[]) {
      if (consultantIds.has(o.customer_id)) continue;
      const keys = new Set([o.event_id, o.parent_event_id].filter(Boolean) as string[]);
      for (const k of keys) {
        if (!byEvent.has(k)) byEvent.set(k, []);
        byEvent.get(k)!.push(o);
      }
    }

    // Actual attendance per event: guests marked attending; fall back to the
    // event's planned guest_count when there's no attended guest list.
    const attendingByEvent = new Map<string, number>();
    for (const g of allGuests as any[]) {
      if (g.attending === true && g.event_id) {
        attendingByEvent.set(g.event_id, (attendingByEvent.get(g.event_id) || 0) + 1);
      }
    }

    const rows: Row[] = events.map((ev) => {
      const list = byEvent.get(ev.event_id) || [];
      const sales = round2(list.reduce((s, o) => s + (Number(o.retail_amount) || 0), 0));
      const profit = round2(list.reduce((s, o) => s + orderProfit(o), 0));
      const attended = attendingByEvent.get(ev.event_id) || 0;
      const faces = attended > 0 ? attended : Number(ev.guest_count || 0);
      return {
        ev,
        faces,
        orders: list.length,
        orderingGuests: new Set(list.map((o) => o.customer_id).filter(Boolean)).size,
        sales,
        profit,
        perFace: faces > 0 ? sales / faces : 0,
        futureBookings: Number(ev.future_bookings_count || 0),
      };
    });

    const n = rows.length;
    const totalSales = round2(rows.reduce((s, r) => s + r.sales, 0));
    const totalProfit = round2(rows.reduce((s, r) => s + r.profit, 0));
    const totalFaces = rows.reduce((s, r) => s + r.faces, 0);
    const totalOrders = rows.reduce((s, r) => s + r.orders, 0);

    const types = new Map<string, { count: number; sales: number; profit: number }>();
    for (const r of rows) {
      const t = r.ev.event_type || "Other";
      const cur = types.get(t) || { count: 0, sales: 0, profit: 0 };
      cur.count += 1;
      cur.sales += r.sales;
      cur.profit += r.profit;
      types.set(t, cur);
    }

    const averages = AVERAGE_GROUPS.map(({ key, label }) => {
      const list = rows.filter((r) => (r.ev.event_type || "") === key);
      return {
        key,
        label,
        count: list.length,
        sales: round2(list.reduce((s, r) => s + r.sales, 0)),
        profit: round2(list.reduce((s, r) => s + r.profit, 0)),
        faces: list.reduce((s, r) => s + r.faces, 0),
        orders: list.reduce((s, r) => s + r.orders, 0),
      };
    });

    return {
      rows,
      n,
      totalSales,
      totalProfit,
      totalFaces,
      totalOrders,
      averages,
      types: [...types.entries()].sort((a, b) => b[1].sales - a[1].sales),
    };
  }, [customers, orders, allEvents, period]);

  const sortedRows = useMemo(() => {
    const mult = sort.dir === "asc" ? 1 : -1;
    return [...data.rows].sort((a, b) => {
      if (sort.key === "sales") return (a.sales - b.sales) * mult;
      if (sort.key === "profit") return (a.profit - b.profit) * mult;
      return (a.ev.event_date || "").localeCompare(b.ev.event_date || "") * mult;
    });
  }, [data.rows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const { n, totalSales, totalProfit, totalFaces, totalOrders } = data;
  const title = (e: EventRecord) => e.event_title || e.hostess_name || e.event_id;
  const open = (e: EventRecord) => navigate(`/events/${e.event_id}`, { state: { from: "/event-results" } });

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      className={cn("inline-flex items-center gap-1 hover:text-primary", sort.key === k && "text-primary")}
      onClick={() => toggleSort(k)}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <Card className="border-primary/20 shadow-sm bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <DollarSign className="w-4 h-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Event Results</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Sales &amp; profit from your events</h2>
            <p className="text-xs text-muted-foreground">
              Held personal events only. Orders count toward an event when they're linked to it directly or as a party
              order.
            </p>
          </CardContent>
        </Card>

        {/* Period filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="flex-1 text-sm text-muted-foreground">{getPeriodLabel(period)}</p>
          <div className="flex flex-wrap gap-1.5">
            {(["ytd", "mtd", "last-month"] as const).map((t) => (
              <Button
                key={t}
                variant={period.type === t ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setPeriod({ type: t })}
              >
                {t === "ytd" ? "YTD" : t === "mtd" ? "MTD" : "Last Month"}
              </Button>
            ))}
            <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant={period.type === "month" ? "default" : "outline"} size="sm" className="h-8 text-xs">
                  <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                  {period.type === "month" ? `${MONTHS[period.month].slice(0, 3)} ${period.year}` : "Select Month..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <MonthYearPicker
                  onSelect={(year, month) => {
                    setPeriod({ type: "month", year, month });
                    setMonthPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {oLoading || eLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Tile label="Total Event Sales" value={money(totalSales)} />
              <Tile label="Total Event Profit" value={money(totalProfit)} />
              <Tile label="Events Held" value={String(n)} />
              <Tile label="Total Faces" value={String(totalFaces)} />
              <Tile label="Profit Margin" value={totalSales > 0 ? `${((totalProfit / totalSales) * 100).toFixed(1)}%` : "—"} />
              <Tile label="Avg Sales / Face" value={money(totalFaces ? totalSales / totalFaces : 0)} />
              <Tile label="Avg Order Size" value={money(totalOrders ? totalSales / totalOrders : 0)} sub={`${totalOrders} orders`} />
            </div>

            {/* Averages by type */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">Averages by Event Type</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Parties, facials and guest events averaged separately, so one type doesn't skew another.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  {data.averages.map((a) => (
                    <div key={a.key} className="rounded-lg border border-border/50 bg-muted/20 p-4">
                      <p className="text-sm font-semibold text-foreground mb-3">{a.label}</p>
                      <dl className="space-y-1.5 tabular-nums">
                        <AvgRow label="Events" value={String(a.count)} />
                        <AvgRow label="Avg Sales / Event" value={a.count ? money(a.sales / a.count) : "—"} />
                        <AvgRow label="Avg Profit / Event" value={a.count ? money(a.profit / a.count) : "—"} />
                        <AvgRow label="Avg Faces / Event" value={a.count ? (a.faces / a.count).toFixed(1) : "—"} />
                        <AvgRow label="Avg Sales / Face" value={a.faces ? money(a.sales / a.faces) : "—"} />
                        <AvgRow label="Avg Order Size" value={a.orders ? money(a.sales / a.orders) : "—"} />
                      </dl>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By type */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">By Event Type</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {data.types.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No held events in this period.</p>
                ) : (
                  <table className="w-full text-sm tabular-nums min-w-[520px]">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground text-left border-b border-border">
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 px-3 text-right">Events</th>
                        <th className="py-2 px-3 text-right">Sales</th>
                        <th className="py-2 px-3 text-right">Profit</th>
                        <th className="py-2 px-3 text-right">Avg Sales</th>
                        <th className="py-2 pl-3 text-right">Avg Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.types.map(([t, v]) => (
                        <tr key={t} className="border-b border-border/40 last:border-0">
                          <td className="py-2 pr-3 font-medium text-foreground">{t}</td>
                          <td className="py-2 px-3 text-right">{v.count}</td>
                          <td className="py-2 px-3 text-right">{money(v.sales)}</td>
                          <td className="py-2 px-3 text-right">{money(v.profit)}</td>
                          <td className="py-2 px-3 text-right">{money(v.sales / v.count)}</td>
                          <td className="py-2 pl-3 text-right">{money(v.profit / v.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Events */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <ListOrdered className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">Events ({n})</CardTitle>
                  <div className="ml-auto flex gap-3 text-xs text-muted-foreground md:hidden">
                    <SortBtn k="date" label="Date" />
                    <SortBtn k="sales" label="Sales" />
                    <SortBtn k="profit" label="Profit" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sortedRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No held events in this period.</p>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm tabular-nums">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground text-left border-b border-border">
                            <th className="py-2 pr-3"><SortBtn k="date" label="Date" /></th>
                            <th className="py-2 px-3">Event</th>
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3 text-right">Faces</th>
                            <th className="py-2 px-3 text-right">Ordering</th>
                            <th className="py-2 px-3 text-right">Orders</th>
                            <th className="py-2 px-3 text-right"><SortBtn k="sales" label="Sales" /></th>
                            <th className="py-2 px-3 text-right"><SortBtn k="profit" label="Profit" /></th>
                            <th className="py-2 px-3 text-right">$/Face</th>
                            <th className="py-2 pl-3 text-right">Bookings</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRows.map((r) => (
                            <tr
                              key={r.ev.id}
                              onClick={() => open(r.ev)}
                              className="border-b border-border/40 last:border-0 cursor-pointer hover:bg-muted/40"
                            >
                              <td className="py-2 pr-3 whitespace-nowrap">{r.ev.event_date ? formatDateOnly(r.ev.event_date) : "—"}</td>
                              <td className="py-2 px-3 font-medium text-foreground">{title(r.ev)}</td>
                              <td className="py-2 px-3 text-muted-foreground">{r.ev.event_type || "—"}</td>
                              <td className="py-2 px-3 text-right">{r.faces}</td>
                              <td className="py-2 px-3 text-right">{r.orderingGuests}</td>
                              <td className="py-2 px-3 text-right">
                                {r.orders === 0 ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">No orders</span>
                                ) : r.orders}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-foreground">{money(r.sales)}</td>
                              <td className="py-2 px-3 text-right">{money(r.profit)}</td>
                              <td className="py-2 px-3 text-right">{money(r.perFace)}</td>
                              <td className="py-2 pl-3 text-right">{r.futureBookings}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-2">
                      {sortedRows.map((r) => (
                        <button
                          key={r.ev.id}
                          onClick={() => open(r.ev)}
                          className="w-full text-left p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 tabular-nums"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">{title(r.ev)}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.ev.event_date ? formatDateOnly(r.ev.event_date) : "—"} · {r.ev.event_type || "—"}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-sm text-foreground">{money(r.sales)}</p>
                              <p className="text-xs text-primary">{money(r.profit)} profit</p>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1.5">
                            {r.faces} faces · {r.orderingGuests} ordering · {r.orders === 0 ? "no orders yet" : `${r.orders} orders`} · {money(r.perFace)}/face · {r.futureBookings} bookings
                          </p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
