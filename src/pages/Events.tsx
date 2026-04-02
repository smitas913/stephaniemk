import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEvents, fetchOrders } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Calendar, Users, DollarSign, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import AddEventDialog from "@/components/AddEventDialog";

export default function Events() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: events = [], isLoading } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  // Calculate totals per event from orders
  const eventSales = useMemo(() => {
    const map = new Map<string, { total: number; orderCount: number }>();
    for (const o of orders) {
      const eid = o.event_id || o.parent_event_id;
      if (!eid) continue;
      const existing = map.get(eid) || { total: 0, orderCount: 0 };
      existing.total += Number(o.retail_amount || 0);
      existing.orderCount += 1;
      map.set(eid, existing);
    }
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    if (!search) return events;
    const q = search.toLowerCase();
    return events.filter((e) =>
      (e.hostess_name || "").toLowerCase().includes(q) ||
      (e.event_id || "").toLowerCase().includes(q) ||
      (e.event_type || "").toLowerCase().includes(q)
    );
  }, [events, search]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => (b.event_date || "").localeCompare(a.event_date || "")),
    [filtered]
  );

  const totalEvents = sorted.length;
  const totalSales = sorted.reduce((s, e) => s + (eventSales.get(e.event_id)?.total || 0), 0);
  const totalGuests = sorted.reduce((s, e) => s + (e.guest_count || 0), 0);

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Events</h2>
            <p className="text-sm text-muted-foreground">{totalEvents} events</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Events</span>
              </div>
              <p className="text-lg font-bold text-blue-600">{totalEvents}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Sales</span>
              </div>
              <p className="text-lg font-bold text-green-600">${totalSales.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Guests</span>
              </div>
              <p className="text-lg font-bold text-purple-600">{totalGuests}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search hostess, event ID, type..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No events found.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Event ID</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Hostess</TableHead>
                  <TableHead className="text-xs text-center">Guests</TableHead>
                  <TableHead className="text-xs text-center">Ordering</TableHead>
                  <TableHead className="text-xs text-right">Total Sales</TableHead>
                  <TableHead className="text-xs text-center">Bookings</TableHead>
                  <TableHead className="text-xs text-center">Sharings</TableHead>
                  <TableHead className="text-xs text-center">Conv %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((e) => {
                  const sales = eventSales.get(e.event_id);
                  const orderCount = sales?.orderCount || 0;
                  const totalSales = sales?.total || 0;
                  const guestCount = e.guest_count || 0;
                  const convRate = guestCount > 0 ? ((orderCount / guestCount) * 100).toFixed(0) : "—";

                  return (
                    <TableRow
                      key={e.id}
                      className="hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/events/${e.event_id}`)}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {e.event_date ? new Date(e.event_date).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[140px] truncate" title={e.event_id}>
                        {e.event_id}
                      </TableCell>
                      <TableCell className="text-xs">{e.event_type || "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{e.hostess_name || "—"}</TableCell>
                      <TableCell className="text-center text-sm">{guestCount || "—"}</TableCell>
                      <TableCell className="text-center text-sm">{e.ordering_guest_count || orderCount || "—"}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {totalSales > 0 ? `$${totalSales.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">{e.future_bookings_count || "—"}</TableCell>
                      <TableCell className="text-center text-sm">{e.sharing_appointments_count || "—"}</TableCell>
                      <TableCell className="text-center">
                        {convRate !== "—" ? (
                          <span className={cn("text-xs font-semibold",
                            Number(convRate) >= 50 ? "text-green-600" : "text-amber-600"
                          )}>{convRate}%</span>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
