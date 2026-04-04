import { useState, useMemo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
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
import { Plus, Trash2, Search, Archive, ArchiveRestore, Star, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, MessageSquare, Phone, Mail, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateOnly, getFollowUpStatus, parseLocalDate } from "@/lib/dateOnly";
import { useIsMobile } from "@/hooks/use-mobile";

import { formatPhone, phoneForLink } from "@/lib/phoneUtils";

type EnrichedCustomer = Customer & CustomerComputed & {
  latest_note?: CustomerNote;
};

export default function CustomerList() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterVip, setFilterVip] = useState("all");
  const [sortByVip, setSortByVip] = useState<"none" | "vip-first" | "nonvip-first">("none");
  const [filterFollowUp, setFilterFollowUp] = useState("all");
  const [filterArchive, setFilterArchive] = useState<"active" | "archived">("active");
  const [filterMissing, setFilterMissing] = useState<string[]>([]);
  const [missingOpen, setMissingOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "" });
  const [relOpen, setRelOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [actOpen, setActOpen] = useState(false);
  const [fuOpen, setFuOpen] = useState(false);
  const [sortCol, setSortCol] = useState<"last_contacted" | "last_order" | "follow_up" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (col: "last_contacted" | "last_order" | "follow_up") => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

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

      // Missing info filters
      let matchMissing = true;
      if (filterMissing.length > 0) {
        for (const f of filterMissing) {
          if (f === "birthday" && c.birthday) { matchMissing = false; break; }
          if (f === "phone" && c.phone?.trim()) { matchMissing = false; break; }
          if (f === "email" && c.email?.trim()) { matchMissing = false; break; }
          if (f === "address" && c.address_line_1?.trim() && c.city?.trim() && c.state_territory?.trim() && c.postal_code?.trim()) { matchMissing = false; break; }
        }
      }

      return matchSearch && matchStatus && matchCat && matchVip && matchFU && matchMissing;
    });

    if (sortByVip === "vip-first") {
      result = [...result].sort((a, b) => (b.vip === "VIP" ? 1 : 0) - (a.vip === "VIP" ? 1 : 0));
    } else if (sortByVip === "nonvip-first") {
      result = [...result].sort((a, b) => (a.vip === "VIP" ? 1 : 0) - (b.vip === "VIP" ? 1 : 0));
    }

    if (sortCol) {
      const getVal = (c: EnrichedCustomer): string | null => {
        if (sortCol === "last_contacted") return c.last_contacted;
        if (sortCol === "last_order") return c.last_order_effective;
        return c.next_follow_up;
      };
      const dir = sortDir === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        const av = getVal(a);
        const bv = getVal(b);
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        return av < bv ? -dir : av > bv ? dir : 0;
      });
    }

    return result;
  }, [enriched, search, filterStatus, filterCategory, filterVip, filterFollowUp, filterArchive, sortByVip, sortCol, sortDir]);

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

        {/* Search + Archive Toggle */}
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
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : isMobile ? (
          /* Mobile card view */
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No customers found.</p>
            ) : filtered.map((c) => (
              <div
                key={c.id}
                className="border border-border rounded-lg p-3 bg-card active:bg-muted/50 transition-colors"
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-foreground truncate flex-1 mr-2">{c.full_name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.vip === "VIP" && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                        <Star className="w-2.5 h-2.5 fill-current" />VIP
                      </span>
                    )}
                    {c.activity_status && c.relationship_status !== "Consultant" && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        c.activity_status === "Active" ? "bg-green-100 text-green-700" :
                        c.activity_status === "Warm" ? "bg-yellow-100 text-yellow-700" :
                        c.activity_status === "Dormant" ? "bg-red-100 text-red-700" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {c.activity_status}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <a href={`tel:${phoneForLink(c.phone)}`} className="text-primary hover:underline flex items-center gap-1">
                        <Phone className="w-3 h-3" />{formatPhone(c.phone)}
                      </a>
                      <a href={`sms:${phoneForLink(c.phone)}`} className="text-muted-foreground hover:text-primary">
                        <MessageSquare className="w-3 h-3" />
                      </a>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No phone</span>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-muted-foreground hover:text-primary flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Name</TableHead>
                  <TableHead className="whitespace-nowrap min-w-[140px]">Phone</TableHead>
                  <TableHead>
                    <Popover open={relOpen} onOpenChange={setRelOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                          Relationship
                          <ChevronDown className="w-3 h-3" />
                          {filterStatus !== "all" && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-1" align="start">
                        <div className="space-y-0.5">
                          {[
                            { value: "all", label: "All" },
                            ...RELATIONSHIP_STATUSES.map((s) => ({ value: s, label: s })),
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              className={cn("w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors",
                                filterStatus === opt.value && "bg-accent font-medium"
                              )}
                              onClick={() => { setFilterStatus(opt.value); setRelOpen(false); }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableHead>
                  <TableHead>
                    <Popover open={vipOpen} onOpenChange={setVipOpen}>
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
                              onClick={() => { setFilterVip(opt.value); setVipOpen(false); }}
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
                              onClick={() => { setSortByVip(opt.value); setVipOpen(false); }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableHead>
                  <TableHead>
                    <Popover open={actOpen} onOpenChange={setActOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                          Activity
                          <ChevronDown className="w-3 h-3" />
                          {filterCategory !== "all" && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-1" align="start">
                        <div className="space-y-0.5">
                          {[
                            { value: "all", label: "All" },
                            { value: "Active", label: "Active" },
                            { value: "Warm", label: "Warm" },
                            { value: "Dormant", label: "Dormant" },
                            { value: "New", label: "New" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              className={cn("w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors",
                                filterCategory === opt.value && "bg-accent font-medium"
                              )}
                              onClick={() => { setFilterCategory(opt.value); setActOpen(false); }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleSort("last_contacted")}>
                      Last Contacted
                      {sortCol === "last_contacted" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleSort("last_order")}>
                      Last Order
                      {sortCol === "last_order" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Popover open={fuOpen} onOpenChange={setFuOpen}>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                            Follow-Up
                            <ChevronDown className="w-3 h-3" />
                            {filterFollowUp !== "all" && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                          </button>
                        </PopoverTrigger>
                      <PopoverContent className="w-40 p-1" align="start">
                        <div className="space-y-0.5">
                          {[
                            { value: "all", label: "All" },
                            { value: "TODAY", label: "Due Today" },
                            { value: "UPCOMING", label: "Upcoming" },
                            { value: "OVERDUE", label: "Overdue" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              className={cn("w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors",
                                filterFollowUp === opt.value && "bg-accent font-medium"
                              )}
                              onClick={() => { setFilterFollowUp(opt.value); setFuOpen(false); }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                      <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleSort("follow_up")}>
                        {sortCol === "follow_up" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </button>
                    </div>
                  </TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No customers found.</TableCell></TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/customers/${c.id}`)}>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <a href={`tel:${phoneForLink(c.phone)}`} className="text-primary hover:underline" title="Call">{formatPhone(c.phone)}</a>
                          <a href={`sms:${phoneForLink(c.phone)}`} className="text-muted-foreground hover:text-primary transition-colors" title="Text">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </a>
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="p-0.5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={c.relationship_status || "Customer"}
                        onValueChange={(v) => statusMutation.mutate({ id: c.id, relationship_status: v })}
                      >
                        <SelectTrigger className="h-7 text-[11px] border-0 bg-transparent shadow-none px-1 w-[110px] focus:ring-1">
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
                     <TableCell>{c.relationship_status === "Consultant" ? <span className="text-muted-foreground">—</span> : statusBadge(c.activity_status, c.activity_status === "Active" ? "bg-green-100 text-green-700" : c.activity_status === "Warm" ? "bg-yellow-100 text-yellow-700" : c.activity_status === "Dormant" ? "bg-red-100 text-red-700" : c.activity_status === "No Orders" ? "bg-muted text-muted-foreground" : "")}</TableCell>
                     <TableCell className="text-sm">
                       {c.last_contacted ? (
                         <span>
                           {formatDateOnly(c.last_contacted, "MMM d")}{" "}
                           <span className="text-muted-foreground">({formatDistanceToNowStrict(parseLocalDate(c.last_contacted), { addSuffix: false })} ago)</span>
                         </span>
                       ) : (
                         <span className="text-muted-foreground">—</span>
                       )}
                     </TableCell>
                    <TableCell className="text-sm">
                      <div>{formatDateOnly(c.last_order_effective)}</div>
                      {c.days_since_last_order !== null && (
                        <div className="text-[11px] text-muted-foreground">{c.days_since_last_order}d ago</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.relationship_status === "Consultant" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (() => {
                        const effectiveFollowUp = c.next_follow_up_date || c.next_follow_up;
                        const followUpStatus = getFollowUpStatus(effectiveFollowUp) || c.follow_up_status;
                        return (
                          <>
                            <div>{formatDateOnly(effectiveFollowUp)}</div>
                            {followUpStatus && statusBadge(followUpStatus, followUpStatus === "OVERDUE" ? "bg-red-100 text-red-700" : followUpStatus === "TODAY" ? "bg-blue-100 text-blue-700" : followUpStatus === "UPCOMING" ? "bg-green-100 text-green-700" : "")}
                          </>
                        );
                      })()}
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
