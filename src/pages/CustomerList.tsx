import { useEffect, useState, useMemo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders, createCustomer, deleteCustomer, updateCustomer, archiveCustomer, unarchiveCustomer, fetchLatestNotes, unflagCustomer, fetchTeamConsultants } from "@/lib/queries";
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
import { Plus, Trash2, Search, Archive, ArchiveRestore, Star, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, MessageSquare, Phone, Mail, AlertCircle, Flag, Sparkles, X, FileSpreadsheet, MoreHorizontal, Filter } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import PCPImportDialog from "@/components/PCPImportDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { openEmail } from "@/lib/emailPreference";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateOnly, getFollowUpStatus, parseLocalDate } from "@/lib/dateOnly";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger, SheetClose, SheetFooter } from "@/components/ui/sheet";

import { beautyProfileSearchText } from "@/lib/beautyProfile";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import TextActionButton from "@/components/TextActionButton";

type EnrichedCustomer = Customer & CustomerComputed & {
  latest_note?: CustomerNote;
};

export default function CustomerList({ embedded = false }: { embedded?: boolean }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterVip, setFilterVip] = useState("all");
  const [sortByVip, setSortByVip] = useState<"none" | "vip-first" | "nonvip-first">("none");
  const [filterFollowUp, setFilterFollowUp] = useState("all");
  const [filterArchive, setFilterArchive] = useState<"active" | "archived">("active");
  const [filterDnc, setFilterDnc] = useState<"active" | "dnc">("active");
  const [filterSkincare, setFilterSkincare] = useState<"all" | "yes" | "no">("all");
  const [filterMissing, setFilterMissing] = useState<string[]>([]);
  const [filterAssigned, setFilterAssigned] = useState<string>("all"); // "all" | "me" | consultantId
  const [missingOpen, setMissingOpen] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [filterAttention, setFilterAttention] = useState(false);
  const [attentionView, setAttentionView] = useState<"all" | "followup" | "missing">("all");
  const [form, setForm] = useState({ full_name: "", phone: "", email: "" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pcpImportOpen, setPcpImportOpen] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const bulkSkincareMutation = useMutation({
    mutationFn: async ({ ids, value }: { ids: string[]; value: boolean }) => {
      const { error } = await supabase
        .from("customers")
        .update({ is_skincare_customer: value })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`${vars.value ? "Marked" : "Removed"} skincare on ${vars.ids.length} customer${vars.ids.length === 1 ? "" : "s"}`);
      clearSelection();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [relOpen, setRelOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [actOpen, setActOpen] = useState(false);
  const [fuOpen, setFuOpen] = useState(false);
  const [sortCol, setSortCol] = useState<"last_contacted" | "last_order" | "follow_up" | "date_added" | "became_customer" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Read ?attention=1 (set by Business Reset banner) → enable combined filter
  useEffect(() => {
    if (searchParams.get("attention") === "1") {
      setFilterAttention(true);
      setFilterMissing(["phone", "email", "address"]);
    }
    const v = searchParams.get("view");
    if (v === "followup" || v === "missing" || v === "all") {
      setAttentionView(v);
    }
  }, [searchParams]);

  const toggleSort = (col: "last_contacted" | "last_order" | "follow_up" | "date_added" | "became_customer") => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const { data: customers = [], isLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: teamConsultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: allNotes = [] } = useQuery({ queryKey: ["all-notes"], queryFn: fetchLatestNotes });

  const addMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
      setForm({ full_name: "", phone: "", email: "" });
      navigate(`/customers/${newCustomer.id}`);
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

      const isDnc = Array.isArray((c as any).tags) && (c as any).tags.includes("DNC");
      if (filterDnc === "dnc") {
        if (!isDnc) return false;
      } else {
        if (isDnc) return false;
      }

      const q = search.toLowerCase();
      const beautyText = beautyProfileSearchText((c as any).beauty_notes);
      const matchSearch = !q
        || c.full_name.toLowerCase().includes(q)
        || c.email?.toLowerCase().includes(q)
        || c.phone?.includes(q)
        || beautyText.includes(q);

      const matchStatus = filterStatus === "all" || c.relationship_status === filterStatus;
      const matchCat = filterCategory === "all" || c.activity_status === filterCategory;
      const matchVip = filterVip === "all" || (filterVip === "VIP" ? c.vip === "VIP" : c.vip !== "VIP");
      const matchFU = filterFollowUp === "all" || c.follow_up_status === filterFollowUp;
      const matchSkincare = filterSkincare === "all" || (filterSkincare === "yes" ? (c as any).is_skincare_customer === true : (c as any).is_skincare_customer !== true);
      const cTags: string[] = Array.isArray((c as any).tags) ? (c as any).tags : [];
      const matchTags = filterTags.length === 0 || filterTags.every((t) => cTags.includes(t));

      // Missing info filters (skipped when the combined Attention filter is on)
      let matchMissing = true;
      if (!filterAttention && filterMissing.length > 0) {
        for (const f of filterMissing) {
          if (f === "birthday" && c.birthday) { matchMissing = false; break; }
          if (f === "phone" && c.phone?.trim()) { matchMissing = false; break; }
          if (f === "email" && c.email?.trim()) { matchMissing = false; break; }
          if (f === "address" && c.address_line_1?.trim() && c.city?.trim() && c.state_territory?.trim() && c.postal_code?.trim()) { matchMissing = false; break; }
        }
      }

      // Items-to-Complete combined filter — show if missing contact info OR needs follow-up
      if (filterAttention) {
        const missingContact = !c.phone?.trim() || !c.email?.trim() || !c.address_line_1?.trim() || !(c.birthday || (c as any).birthday_mmdd);
        const needsFollowUp = c.follow_up_status === "OVERDUE" || c.follow_up_status === "TODAY";
        if (attentionView === "followup") {
          if (!needsFollowUp) return false;
        } else if (attentionView === "missing") {
          if (!missingContact) return false;
        } else {
          // all
          if (!missingContact && !needsFollowUp) return false;
        }
      }

      const assignedId = (c as any).assigned_consultant_id || null;
      const matchAssigned =
        filterAssigned === "all" ? true
          : filterAssigned === "me" ? !assignedId
          : assignedId === filterAssigned;

      return matchSearch && matchStatus && matchCat && matchVip && matchFU && matchSkincare && matchMissing && matchTags && matchAssigned;
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
        if (sortCol === "date_added") return (c as any).date_added ?? null;
        if (sortCol === "became_customer") return (c as any).became_customer_date ?? null;
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
  }, [enriched, search, filterStatus, filterCategory, filterVip, filterFollowUp, filterArchive, filterDnc, filterSkincare, sortByVip, sortCol, sortDir, filterMissing, filterTags, filterAttention, attentionView, filterAssigned]);

  const availableTags = useMemo(() => {
    const s = new Set<string>();
    for (const c of customers) {
      const t = (c as any).tags;
      if (Array.isArray(t)) for (const x of t) if (x) s.add(String(x));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterArchive !== "active") count++;
    if (filterDnc !== "active") count++;
    if (filterSkincare !== "all") count++;
    if (filterAssigned !== "all") count++;
    if (filterMissing.length > 0) count++;
    if (filterTags.length > 0) count++;
    return count;
  }, [filterArchive, filterDnc, filterSkincare, filterAssigned, filterMissing, filterTags]);

  const statusBadge = (val: string, colors: string) => val ? <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-medium", colors)}>{val}</span> : null;

  const customerHasOrders = (customerId: string) => allOrders.some((o) => o.customer_id === customerId);

  const content = (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            {!embedded && <h2 className="text-2xl font-bold tracking-tight text-foreground">Customers</h2>}
            <p className="text-sm text-muted-foreground">{enriched.filter(c => filterArchive === "active" ? c.is_active !== false : c.is_active === false).length} total · {filtered.length} shown</p>
          </div>
          <div className="flex items-center gap-2">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Import / Manage <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPcpImportOpen(true)}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Import PCP List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <PCPImportDialog open={pcpImportOpen} onOpenChange={setPcpImportOpen} />
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 sticky top-0 z-10">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <div className="flex flex-wrap gap-1.5 ml-auto">
              <Button
                size="sm"
                variant="default"
                className="h-8"
                disabled={bulkSkincareMutation.isPending}
                onClick={() => bulkSkincareMutation.mutate({ ids: Array.from(selectedIds), value: true })}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                Mark as Skincare
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkSkincareMutation.isPending}
                onClick={() => bulkSkincareMutation.mutate({ ids: Array.from(selectedIds), value: false })}
              >
                Remove Skincare
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={clearSelection}>
                <X className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Search + Archive Toggle */}
        {isMobile ? (
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name, phone, email, skin type, shade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0">
                  <Filter className="w-3.5 h-3.5 shrink-0" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto px-4 py-5">
                <SheetHeader className="text-left pb-2">
                  <SheetTitle className="text-base">Filters</SheetTitle>
                  <SheetDescription>Refine the customer list</SheetDescription>
                </SheetHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Archive status</label>
                    <Select value={filterArchive} onValueChange={(v) => setFilterArchive(v as "active" | "archived")}>
                      <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">DNC status</label>
                    <Select value={filterDnc} onValueChange={(v) => setFilterDnc(v as "active" | "dnc")}>
                      <SelectTrigger className="w-full h-10 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active (no DNC)</SelectItem>
                        <SelectItem value="dnc">Do Not Contact</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Skincare customer</label>
                    <Select value={filterSkincare} onValueChange={(v) => setFilterSkincare(v as "all" | "yes" | "no")}>
                      <SelectTrigger className="w-full h-10 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Skincare</SelectItem>
                        <SelectItem value="yes">Skincare: Yes</SelectItem>
                        <SelectItem value="no">Skincare: No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Assigned to</label>
                    <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                      <SelectTrigger className="w-full h-10 text-xs"><SelectValue placeholder="Assigned to" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Assignments</SelectItem>
                        <SelectItem value="me">Me (director)</SelectItem>
                        {(teamConsultants as any[]).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Missing info</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: "birthday", label: "Birthday" },
                        { key: "phone", label: "Phone" },
                        { key: "email", label: "Email" },
                        { key: "address", label: "Address" },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          className={cn(
                            "text-xs px-3 py-2 rounded-md border transition-colors",
                            filterMissing.includes(key)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          )}
                          onClick={() => {
                            setFilterMissing((prev) =>
                              prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
                            );
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Tags</label>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {availableTags.length === 0 ? (
                        <div className="text-xs text-muted-foreground px-1 py-1.5">No tags yet</div>
                      ) : (
                        availableTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={cn(
                              "text-xs px-3 py-2 rounded-md border transition-colors",
                              filterTags.includes(tag)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card text-foreground border-border hover:bg-muted"
                            )}
                            onClick={() => {
                              setFilterTags((prev) =>
                                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                              );
                            }}
                          >
                            {tag}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <SheetFooter className="flex-row gap-2 pt-4 border-t border-border mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-10"
                    onClick={() => {
                      setFilterArchive("active");
                      setFilterDnc("active");
                      setFilterSkincare("all");
                      setFilterAssigned("all");
                      setFilterMissing([]);
                      setFilterTags([]);
                    }}
                  >
                    Clear all
                  </Button>
                  <SheetClose asChild>
                    <Button size="sm" className="flex-1 h-10">Apply</Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
            <Button
              variant={filterAttention ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1 text-xs shrink-0"
              onClick={() => {
                const next = !filterAttention;
                setFilterAttention(next);
                if (!next) {
                  const sp = new URLSearchParams(searchParams);
                  sp.delete("attention");
                  setSearchParams(sp, { replace: true });
                }
              }}
            >
              <Flag className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Items to Complete</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px] basis-full sm:basis-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name, phone, email, skin type, shade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
            </div>
            <Select value={filterArchive} onValueChange={(v) => setFilterArchive(v as "active" | "archived")}>
              <SelectTrigger className="w-[130px] max-w-full h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDnc} onValueChange={(v) => setFilterDnc(v as "active" | "dnc")}>
              <SelectTrigger className="w-[170px] max-w-full h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active (no DNC)</SelectItem>
                <SelectItem value="dnc">Do Not Contact</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSkincare} onValueChange={(v) => setFilterSkincare(v as "all" | "yes" | "no")}>
              <SelectTrigger className="w-[150px] max-w-full h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Skincare</SelectItem>
                <SelectItem value="yes">Skincare: Yes</SelectItem>
                <SelectItem value="no">Skincare: No</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAssigned} onValueChange={setFilterAssigned}>
              <SelectTrigger className="w-[170px] max-w-full h-9 text-xs"><SelectValue placeholder="Assigned to" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignments</SelectItem>
                <SelectItem value="me">Me (director)</SelectItem>
                {(teamConsultants as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover open={missingOpen} onOpenChange={setMissingOpen}>
              <PopoverTrigger asChild>
                <Button variant={filterMissing.length > 0 ? "default" : "outline"} size="sm" className="h-9 gap-1 text-xs max-w-full">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Missing Info{filterMissing.length > 0 && ` (${filterMissing.length})`}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="start">
                {[
                  { key: "birthday", label: "Missing Birthday" },
                  { key: "phone", label: "Missing Phone" },
                  { key: "email", label: "Missing Email" },
                  { key: "address", label: "Missing Address" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    className={cn(
                      "w-full text-left text-sm px-2.5 py-1.5 rounded-md transition-colors",
                      filterMissing.includes(key)
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-foreground"
                    )}
                    onClick={() => {
                      setFilterMissing((prev) =>
                        prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
                      );
                    }}
                  >
                    {label}
                  </button>
                ))}
                {filterMissing.length > 0 && (
                  <button
                    className="w-full text-left text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:bg-muted mt-1"
                    onClick={() => { setFilterMissing([]); setMissingOpen(false); }}
                  >
                    Clear all
                  </button>
                )}
              </PopoverContent>
            </Popover>
            <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={filterTags.length > 0 ? "default" : "outline"}
                  size="sm"
                  className="h-9 gap-1 text-xs max-w-full"
                  disabled={availableTags.length === 0}
                >
                  <span className="truncate">Tags{filterTags.length > 0 && ` (${filterTags.length})`}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2 max-h-72 overflow-y-auto" align="start">
                {availableTags.length === 0 ? (
                  <div className="text-xs text-muted-foreground px-2 py-1.5">No tags yet</div>
                ) : (
                  availableTags.map((tag) => (
                    <button
                      key={tag}
                      className={cn(
                        "w-full text-left text-sm px-2.5 py-1.5 rounded-md transition-colors",
                        filterTags.includes(tag)
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-foreground"
                      )}
                      onClick={() => {
                        setFilterTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        );
                      }}
                    >
                      {tag}
                    </button>
                  ))
                )}
                {filterTags.length > 0 && (
                  <button
                    className="w-full text-left text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:bg-muted mt-1"
                    onClick={() => { setFilterTags([]); setTagsOpen(false); }}
                  >
                    Clear all
                  </button>
                )}
              </PopoverContent>
            </Popover>
            <Button
              variant={filterAttention ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1 text-xs max-w-full"
              onClick={() => {
                const next = !filterAttention;
                setFilterAttention(next);
                if (!next) {
                  const sp = new URLSearchParams(searchParams);
                  sp.delete("attention");
                  setSearchParams(sp, { replace: true });
                }
              }}
            >
              <Flag className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Items to Complete</span>
            </Button>
          </div>
        )}


        {filterAttention && (
          <div className="flex flex-col gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">
                Showing: Items to Complete ({filtered.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setFilterAttention(false);
                  setAttentionView("all");
                  const sp = new URLSearchParams(searchParams);
                  sp.delete("attention");
                  sp.delete("view");
                  setSearchParams(sp, { replace: true });
                }}
              >
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: "all", label: "All" },
                { key: "missing", label: "Missing Contact Info" },
                { key: "followup", label: "Needs Follow-Up" },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setAttentionView(t.key);
                    const sp = new URLSearchParams(searchParams);
                    if (t.key === "all") sp.delete("view");
                    else sp.set("view", t.key);
                    setSearchParams(sp, { replace: true });
                  }}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    attentionView === t.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

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
                      <TextActionButton phone={c.phone} trigger="icon" iconClassName="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No phone</span>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} onClick={(e) => openEmail(c.email!, e)} className="text-muted-foreground hover:text-primary flex items-center gap-1 truncate">
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
                  <TableHead className="w-8 px-2">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                      onCheckedChange={(v) => {
                        if (v) setSelectedIds(new Set(filtered.map((c) => c.id)));
                        else clearSelection();
                      }}
                      aria-label="Select all"
                    />
                  </TableHead>
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
                  <TableHead className="whitespace-nowrap">
                    <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleSort("date_added")}>
                      Date Added
                      {sortCol === "date_added" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleSort("became_customer")}>
                      Became Customer
                      {sortCol === "became_customer" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">No customers found.</TableCell></TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c.id} className={cn("cursor-pointer hover:bg-muted/50", selectedIds.has(c.id) && "bg-primary/5")} onClick={() => navigate(`/customers/${c.id}`)}>
                    <TableCell className="px-2 w-8" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                        aria-label={`Select ${c.full_name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <a href={`tel:${phoneForLink(c.phone)}`} className="text-primary hover:underline" title="Call">{formatPhone(c.phone)}</a>
                          <TextActionButton phone={c.phone} trigger="icon" />
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
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatDateOnly((c as any).date_added) || "—"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatDateOnly((c as any).became_customer_date) || <span className="text-muted-foreground/60">—</span>}
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
  );

  if (embedded) return content;
  return <Layout>{content}</Layout>;
}
