import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProspects, fetchCustomers, fetchTeamConsultants, createProspect, deleteProspect } from "@/lib/queries";
import { OPPORTUNITY_STATUSES, NEXT_STEP_TYPES } from "@/lib/types";
import type { Prospect, TeamConsultant } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatDateOnly, compareDateOnly, toLocalDateKey } from "@/lib/dateOnly";
import { Plus, Search, UserPlus, Link2, CalendarDays, Pencil, Trash2, Users, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const STATUS_COLORS: Record<string, string> = {
  "New Contact": "bg-muted text-muted-foreground",
  "Warm": "bg-amber-100 text-amber-700",
  "Booked": "bg-blue-100 text-blue-700",
  "Working": "bg-purple-100 text-purple-700",
  "Converted": "bg-emerald-100 text-emerald-700",
  // Legacy
  "New": "bg-muted text-muted-foreground",
  "Shared": "bg-muted text-muted-foreground",
  "Follow-Up": "bg-muted text-muted-foreground",
  "Interested": "bg-muted text-muted-foreground",
  "Not Interested": "bg-muted text-muted-foreground",
  "Joined": "bg-emerald-100 text-emerald-700",
  "Closed": "bg-muted text-muted-foreground",
};

export default function Prospects({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isDirector = profile?.role === "owner" || profile?.role === "admin";

  const { data: prospects = [], isLoading } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterOwnership, setFilterOwnership] = useState<string>("all");
  const [filterConsultant, setFilterConsultant] = useState<string>("all");
  const [filterDnc, setFilterDnc] = useState<"active" | "dnc">("active");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [sortBy, setSortBy] = useState<"interest" | "last_contact" | "follow_up" | "name">("interest");
  const [showArchived, setShowArchived] = useState(false);

  const archiveMut = useMutation({
    mutationFn: async (id: string) => {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.from("prospects" as any).update({ is_archived: true } as any).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      toast.success("Prospect removed from active list");
    },
  });

  // Add form
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formStatus, setFormStatus] = useState<string>("Shared");
  const [formCustomerId, setFormCustomerId] = useState<string>("");
  const [formNextStepType, setFormNextStepType] = useState<string>("");
  const [formNextStepDate, setFormNextStepDate] = useState("");
  const [formOwnership, setFormOwnership] = useState<string>("personal");
  const [formAssignedConsultant, setFormAssignedConsultant] = useState<string>("");

  const consultantMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of consultants) map[c.id] = c.name;
    return map;
  }, [consultants]);

  const customerDncSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of customers) {
      if (Array.isArray((c as any).tags) && (c as any).tags.includes("DNC")) s.add(c.id);
    }
    return s;
  }, [customers]);

  const filtered = useMemo(() => {
    let list = prospects;
    // Archive filter
    list = list.filter((p) => showArchived ? (p as any).is_archived : !(p as any).is_archived);
    // DNC filter via linked customer
    list = list.filter((p) => {
      const isDnc = !!p.customer_id && customerDncSet.has(p.customer_id);
      return filterDnc === "dnc" ? isDnc : !isDnc;
    });
    if (filterStatus !== "all") list = list.filter((p) => p.opportunity_status === filterStatus);
    if (filterOwnership !== "all") list = list.filter((p) => (p.ownership_type || "personal") === filterOwnership);
    if (filterConsultant !== "all") list = list.filter((p) => p.assigned_consultant_id === filterConsultant);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.phone?.includes(q) || p.email?.toLowerCase().includes(q));
    }
    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === "interest") return ((b as any).interest_level || 0) - ((a as any).interest_level || 0);
      if (sortBy === "last_contact") return (b.last_contact_date || "").localeCompare(a.last_contact_date || "");
      if (sortBy === "follow_up") return (a.next_follow_up_date || "9999").localeCompare(b.next_follow_up_date || "9999");
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });
    return list;
  }, [prospects, filterStatus, filterOwnership, filterConsultant, filterDnc, customerDncSet, search, sortBy, showArchived]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of prospects) counts[p.opportunity_status] = (counts[p.opportunity_status] || 0) + 1;
    return counts;
  }, [prospects]);

  const createMut = useMutation({
    mutationFn: () => {
      const data: Partial<Prospect> & { name: string } = {
        name: formName,
        phone: formPhone || null,
        email: formEmail || null,
        opportunity_status: formStatus,
        customer_id: formCustomerId || null,
        next_step_type: formNextStepType || null,
        next_step_date: formNextStepDate || null,
        ownership_type: formOwnership,
        assigned_consultant_id: formOwnership === "unit" && formAssignedConsultant ? formAssignedConsultant : null,
      };
      return createProspect(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      setShowAdd(false);
      resetForm();
      toast.success("Prospect added!");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProspect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      setDeleteTarget(null);
      toast.success("Prospect deleted");
    },
  });

  const resetForm = () => {
    setFormName(""); setFormPhone(""); setFormEmail(""); setFormStatus("Shared");
    setFormCustomerId(""); setFormNextStepType(""); setFormNextStepDate("");
    setFormOwnership("personal"); setFormAssignedConsultant("");
  };

  const handleCustomerLink = (custId: string) => {
    setFormCustomerId(custId);
    if (custId) {
      const c = customers.find((x) => x.id === custId);
      if (c) {
        setFormName(c.full_name);
        setFormPhone(c.phone || "");
        setFormEmail(c.email || "");
      }
    }
  };

  const content = (
      <div className="space-y-5 pb-8">
        <div className="flex items-center justify-between">
          <div>
            {!embedded && <h2 className="text-2xl font-bold tracking-tight text-foreground">Prospects</h2>}
            <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} active career chats</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Prospect</Button>
        </div>

        {/* Sort + Archive controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          {[
            { value: "interest", label: "Interest Level" },
            { value: "last_contact", label: "Last Contact" },
            { value: "follow_up", label: "Follow-Up Date" },
            { value: "name", label: "Name" },
          ].map(s => (
            <button key={s.value}
              onClick={() => setSortBy(s.value as any)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${sortBy === s.value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted"}`}>
              {s.label}
            </button>
          ))}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`text-xs px-2.5 py-1 rounded-full border ml-auto transition-colors ${showArchived ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border text-muted-foreground hover:bg-muted"}`}>
            {showArchived ? "Hide Archived" : "Show Archived"}
          </button>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={filterStatus === "all" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilterStatus("all")}
          >
            All ({prospects.length})
          </Button>
          {OPPORTUNITY_STATUSES.map((s) => (
            <Button
              key={s}
              variant={filterStatus === s ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilterStatus(s)}
            >
              {s} ({statusCounts[s] || 0})
            </Button>
          ))}
        </div>

        {/* Ownership + consultant filters (directors only) */}
        {isDirector && (
          <div className="flex flex-wrap gap-2">
            <Select value={filterOwnership} onValueChange={setFilterOwnership}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Ownership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ownership</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="unit">Unit</SelectItem>
              </SelectContent>
            </Select>
            {filterOwnership === "unit" && consultants.length > 0 && (
              <Select value={filterConsultant} onValueChange={setFilterConsultant}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue placeholder="Assigned To" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Consultants</SelectItem>
                  {consultants.filter(c => c.status === "Active").map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Search + Active/DNC */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search prospects..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={filterDnc} onValueChange={(v) => setFilterDnc(v as "active" | "dnc")}>
            <SelectTrigger className="w-[170px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (no DNC)</SelectItem>
              <SelectItem value="dnc">Do Not Contact</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No prospects found</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const overdue = p.next_step_date && compareDateOnly(p.next_step_date) === -1;
              const today = p.next_step_date && compareDateOnly(p.next_step_date) === 0;
              const ownershipType = p.ownership_type || "personal";
              const assignedName = p.assigned_consultant_id ? consultantMap[p.assigned_consultant_id] : null;

              return (
                <Card
                  key={p.id}
                  className={cn(
                    "border-border/50 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors",
                    overdue && "border-destructive/40 bg-destructive/5",
                    today && "border-primary/40 bg-primary/5",
                    (p as any).is_archived && "opacity-60"
                  )}
                  onClick={() => navigate(`/prospects/${p.id}`)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    {/* Interest level indicator */}
                    {(p as any).interest_level && (
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        (p as any).interest_level >= 7 ? "bg-green-100 text-green-700" :
                        (p as any).interest_level >= 4 ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      )}>
                        {(p as any).interest_level}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                        {p.customer_id && <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />}
                        <Badge variant="secondary" className={cn("text-[10px] shrink-0", STATUS_COLORS[p.opportunity_status] || "")}>
                          {p.opportunity_status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {p.last_contact_date && (
                          <span className="text-xs text-muted-foreground">Last contact: {formatDateOnly(p.last_contact_date, "MMM d")}</span>
                        )}
                        {p.next_follow_up_date && (() => {
                          const todayKey = toLocalDateKey();
                          const cls = p.next_follow_up_date < todayKey
                            ? "text-destructive font-medium"
                            : p.next_follow_up_date === todayKey
                              ? "text-primary font-medium"
                              : "text-muted-foreground";
                          return (
                            <span className={cn("text-xs", cls)}>
                              Follow-up: {formatDateOnly(p.next_follow_up_date, "MMM d")}
                            </span>
                          );
                        })()}
                        {assignedName && (
                          <span className="text-xs text-muted-foreground">→ {assignedName}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit"
                        onClick={(e) => { e.stopPropagation(); navigate(`/prospects/${p.id}`); }}
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={(p as any).is_archived ? "Restore" : "Remove from active list"}
                        onClick={(e) => { e.stopPropagation(); archiveMut.mutate(p.id); }}
                      >
                        <span className="text-xs text-muted-foreground">{(p as any).is_archived ? "↩" : "✕"}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Delete permanently"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Prospect?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {deleteTarget?.name} and all their notes. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMut.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base"><UserPlus className="w-4 h-4 inline mr-1" />Add Prospect</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Link to existing customer (optional)</label>
                <Select value={formCustomerId || "none"} onValueChange={(v) => handleCustomerLink(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — new lead</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="Name *" value={formName} onChange={(e) => setFormName(e.target.value)} />
              <Input placeholder="Phone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              <Input placeholder="Email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPPORTUNITY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Ownership */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ownership</label>
                <Select value={formOwnership} onValueChange={(v) => { setFormOwnership(v); if (v === "personal") setFormAssignedConsultant(""); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="unit">Unit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formOwnership === "unit" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Assign to Consultant</label>
                  <Select value={formAssignedConsultant || "none"} onValueChange={(v) => setFormAssignedConsultant(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select consultant" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {consultants.filter(c => c.status === "Active").map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Next Step</label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={formNextStepType || "none"} onValueChange={(v) => setFormNextStepType(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {NEXT_STEP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={formNextStepDate} onChange={(e) => setFormNextStepDate(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" onClick={() => createMut.mutate()} disabled={!formName.trim() || createMut.isPending}>
                {createMut.isPending ? "Adding..." : "Add Prospect"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );

  if (embedded) return content;
  return <Layout>{content}</Layout>;
}
