import { useState, useMemo, useCallback } from "react";
import { formatDistanceToNowStrict, parseISO, format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders, createCustomer, deleteCustomer, updateCustomer, archiveCustomer, unarchiveCustomer, fetchLatestNotes } from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import type { Customer, CustomerComputed, CustomerNote } from "@/lib/types";
import { RELATIONSHIP_STATUSES } from "@/lib/types";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Search, Archive, ArchiveRestore, Star, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type EnrichedCustomer = Customer & CustomerComputed & {
  latest_note?: CustomerNote;
};

export default function CustomerList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterVip, setFilterVip] = useState("all");
  const [sortByVip, setSortByVip] = useState<"none" | "vip-first" | "nonvip-first">("none");
  const [filterFollowUp, setFilterFollowUp] = useState("all");
  const [filterNew, setFilterNew] = useState("all");
  const [filterArchive, setFilterArchive] = useState<"active" | "archived">("active");
  const [form, setForm] = useState({ full_name: "", phone: "", email: "" });

  const { data: customers = [], isLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: allNotes = [] } = useQuery({ queryKey: ["all-notes"], queryFn: fetchLatestNotes });

  const addMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
      setForm({ full_name: "", phone: "", email: "" });
      toast.success("Customer added!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Customer deleted permanently");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer archived");
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: unarchiveCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer restored");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, relationship_status }: { id: string; relationship_status: string }) =>
      updateCustomer(id, { relationship_status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Status updated");
    },
  });

  const notesByCustomer = useMemo(() => {
    const map = new Map<string, CustomerNote>();
    for (const n of allNotes) {
      if (!map.has(n.customer_id)) map.set(n.customer_id, n);
    }
    return map;
  }, [allNotes]);

  const enriched: EnrichedCustomer[] = useMemo(() => {
    return customers.map((c) => {
      const custOrders = allOrders.filter((o) => o.customer_id === c.id);
      const computed = computeCustomerFields(c, custOrders);
      const latest_note = notesByCustomer.get(c.id);
      return { ...c, ...computed, latest_note };
    });
  }, [customers, allOrders, notesByCustomer]);

  const filtered = useMemo(() => {
    let result = enriched.filter((c) => {
      const isActive = c.is_active !== false;
      const matchArchive = filterArchive === "active" ? isActive : !isActive;
      if (!matchArchive) return false;

      const q = search.toLowerCase();
      const matchSearch = !q || c.full_name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q);
      const matchStatus = filterStatus === "all" || c.relationship_status === filterStatus;
      const matchCat = filterCategory === "all" || c.activity_status === filterCategory;
      const matchVip = filterVip === "all" || (filterVip === "VIP" ? c.vip === "VIP" : c.vip !== "VIP");
      const matchFU = filterFollowUp === "all" || c.follow_up_status === filterFollowUp;
      const matchNew = filterNew === "all" || (filterNew === "New" ? c.new_first_90_days === "New" : c.new_first_90_days !== "New");
      return matchSearch && matchStatus && matchCat && matchVip && matchFU && matchNew;
    });

    if (sortByVip === "vip-first") {
      result = [...result].sort((a, b) => (b.vip === "VIP" ? 1 : 0) - (a.vip === "VIP" ? 1 : 0));
    } else if (sortByVip === "nonvip-first") {
      result = [...result].sort((a, b) => (a.vip === "VIP" ? 1 : 0) - (b.vip === "VIP" ? 1 : 0));
    }

    return result;
  }, [enriched, search, filterStatus, filterCategory, filterVip, filterFollowUp, filterNew, filterArchive, sortByVip]);

  const statusBadge = (val: string, colors: string) => val ? <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-medium", colors)}>{val}</span> : null;

  const customerHasOrders = (customerId: string) => allOrders.some((o) => o.customer_id === customerId);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Customers</h2>
            <p className="text-sm text-muted-foreground">{enriched.filter(c => filterArchive === "active" ? c.is_active !== false : c.is_active === false).length} total · {filtered.length} shown</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(form); }} className="space-y-3">
                <Input placeholder="Full Name *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required className="h-11" />
                <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} type="tel" className="h-11" />
                <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" className="h-11" />
                <Button type="submit" className="w-full h-11" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Adding..." : "Add Customer"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
          </div>
          <Select value={filterArchive} onValueChange={(v) => setFilterArchive(v as "active" | "archived")}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Relationship" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Relationship</SelectItem>
              {RELATIONSHIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Activity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activity</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Warm">Warm</SelectItem>
              <SelectItem value="Dormant">Dormant</SelectItem>
              <SelectItem value="New">New</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterFollowUp} onValueChange={setFilterFollowUp}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Follow-Up" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Follow-Up</SelectItem>
              <SelectItem value="OVERDUE">Overdue</SelectItem>
              <SelectItem value="TODAY">Today</SelectItem>
              <SelectItem value="UPCOMING">Upcoming</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterNew} onValueChange={setFilterNew}>
            <SelectTrigger className="w-[110px] h-9"><SelectValue placeholder="New?" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="New">New (90d)</SelectItem>
              <SelectItem value="not-new">Not New</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : (
          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                          <Star className="w-3.5 h-3.5" />
                          VIP
                          <ChevronDown className="w-3 h-3" />
                          {filterVip !== "all" && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-1" align="start">
                        <div className="space-y-0.5">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-1">Filter</p>
                          {[
                            { value: "all", label: "All" },
                            { value: "VIP", label: "VIP Only" },
                            { value: "non-vip", label: "Non-VIP" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              className={cn("w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors",
                                filterVip === opt.value && "bg-accent font-medium"
                              )}
                              onClick={() => setFilterVip(opt.value)}
                            >
                              {opt.label}
                            </button>
                          ))}
                          <div className="border-t border-border my-1" />
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-1">Sort</p>
                          {[
                            { value: "none" as const, label: "Default" },
                            { value: "vip-first" as const, label: "VIP First" },
                            { value: "nonvip-first" as const, label: "Non-VIP First" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              className={cn("w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors",
                                sortByVip === opt.value && "bg-accent font-medium"
                              )}
                              onClick={() => setSortByVip(opt.value)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>Follow-Up</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No customers found.</TableCell></TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/customers/${c.id}`)}>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="text-sm">{c.phone || "—"}</TableCell>
                    <TableCell className="p-0.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={c.relationship_status || "Customer"}
                        onValueChange={(v) => statusMutation.mutate({ id: c.id, relationship_status: v })}
                      >
                        <SelectTrigger className="h-7 text-[11px] border-0 bg-transparent shadow-none px-1.5 w-[130px] focus:ring-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {c.vip === "VIP" && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                          <Star className="w-3 h-3 fill-current" />VIP
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(c.activity_status, c.activity_status === "Active" ? "bg-green-100 text-green-700" : c.activity_status === "Warm" ? "bg-yellow-100 text-yellow-700" : c.activity_status === "Dormant" ? "bg-red-100 text-red-700" : c.activity_status === "New" ? "bg-blue-100 text-blue-700" : "")}</TableCell>
                    <TableCell className="text-sm">
                      <div>{c.last_order_effective ? new Date(c.last_order_effective).toLocaleDateString() : "—"}</div>
                      {c.days_since_last_order !== null && (
                        <div className="text-[11px] text-muted-foreground">{c.days_since_last_order}d ago</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{c.next_follow_up ? new Date(c.next_follow_up).toLocaleDateString() : "—"}</div>
                      {c.follow_up_status && statusBadge(c.follow_up_status, c.follow_up_status === "OVERDUE" ? "bg-red-100 text-red-700" : c.follow_up_status === "TODAY" ? "bg-blue-100 text-blue-700" : c.follow_up_status === "UPCOMING" ? "bg-green-100 text-green-700" : "")}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {c.is_active !== false ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Archive"
                            onClick={() => archiveMutation.mutate(c.id)}
                          >
                            <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Restore"
                            onClick={() => unarchiveMutation.mutate(c.id)}
                          >
                            <ArchiveRestore className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete permanently">
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {c.full_name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {customerHasOrders(c.id)
                                  ? "This customer cannot be deleted because they have order history. Use Archive instead to hide them from the active list."
                                  : "This will permanently delete this customer and all their data. This action cannot be undone."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              {!customerHasOrders(c.id) && (
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMutation.mutate(c.id)}
                                >
                                  Delete Permanently
                                </AlertDialogAction>
                              )}
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
