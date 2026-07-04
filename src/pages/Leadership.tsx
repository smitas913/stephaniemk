import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchTeamConsultants, createTeamConsultant, updateTeamConsultant, deleteTeamConsultant,
  fetchLeadershipMembers, createLeadershipMember, updateLeadershipMember, deleteLeadershipMember,
  convertConsultantToCustomer,
} from "@/lib/queries";
import { LEADERSHIP_GOALS, ONBOARDING_STAGES, COACHING_FOCUS_OPTIONS, FOCUS_GROUPS, RELATIONSHIP_TYPES } from "@/lib/types";
import type { TeamConsultant, LeadershipMember } from "@/lib/types";
import Prospects from "./Prospects";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatDateOnly, compareDateOnly, toLocalDateKey } from "@/lib/dateOnly";
import { differenceInDays, parseISO } from "date-fns";
import { formatPhone, phoneForLink, stripPhone, normalizeEmail } from "@/lib/phoneUtils";
import { Plus, Trash2, Pencil, CalendarDays, Users, Crown, UserPlus, Upload, Search, ArrowUpDown, Phone, MessageSquare, StickyNote, CheckCircle, X, MapPin, Mail, User, ArrowRightLeft, AlertTriangle, GitMerge } from "lucide-react";
import { openEmail } from "@/lib/emailPreference";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import ImportConsultantsDialog from "@/components/ImportConsultantsDialog";
import ConsultantActivityLogger from "@/components/ConsultantActivityLogger";
import OnboardingTrackerPanel from "@/components/OnboardingTrackerPanel";
import TextActionButton from "@/components/TextActionButton";
import MergePickerDialog from "@/components/MergePickerDialog";
import { toast } from "sonner";


const ONBOARDING_STAGE_COLORS: Record<string, string> = {
  "New": "bg-blue-100 text-blue-700",
  "Started": "bg-cyan-100 text-cyan-700",
  "First Order": "bg-emerald-100 text-emerald-700",
  "First Party": "bg-violet-100 text-violet-700",
  "First Team Member": "bg-amber-100 text-amber-700",
  "Active Builder": "bg-green-100 text-green-700",
};

export default function Leadership() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as any;
  const [tab, setTab] = useState(locationState?.tab || "prospects");

  // Auto-navigate to consultant tab if directed from drill-down
  useEffect(() => {
    if (locationState?.tab) {
      setTab(locationState.tab);
    }
  }, [locationState?.tab]);

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Leadership</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your team, prospects, and coaching</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="prospects" className="gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />Prospects
            </TabsTrigger>
            <TabsTrigger value="consultants" className="gap-1.5">
              <Users className="w-3.5 h-3.5" />Consultants
            </TabsTrigger>
            <TabsTrigger value="leadership" className="gap-1.5">
              <Crown className="w-3.5 h-3.5" />Leadership
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prospects" className="mt-4">
            <Prospects embedded />
          </TabsContent>

          <TabsContent value="consultants" className="mt-4">
            <ConsultantsTab autoOpenId={locationState?.consultantId || null} />
          </TabsContent>

          <TabsContent value="leadership" className="mt-4">
            <LeadershipTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

/* ─── Consultants Tab ─── */
function ConsultantsTab({ autoOpenId }: { autoOpenId?: string | null }) {
  const queryClient = useQueryClient();
  const { data: consultants = [], isLoading } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamConsultant | null>(null);
  const [convertTarget, setConvertTarget] = useState<TeamConsultant | null>(null);
  const [viewConsultant, setViewConsultant] = useState<TeamConsultant | null>(null);
  const [mergeTarget, setMergeTarget] = useState<TeamConsultant | null>(null);

  // Auto-open consultant panel when navigated from drill-down (only once)
  const autoOpenHandled = useRef(false);
  useEffect(() => {
    if (autoOpenId && consultants.length > 0 && !autoOpenHandled.current) {
      const found = consultants.find(c => c.id === autoOpenId);
      if (found) {
        setViewConsultant(found);
        autoOpenHandled.current = true;
      }
    }
  }, [autoOpenId, consultants]);
  const [focusFilter, setFocusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("coaching");
  const [coachingFilter, setCoachingFilter] = useState<string>("all");

  const emptyForm = {
    first_name: "", last_name: "", name: "", phone: "", email: "",
    consultant_id: "", join_date: toLocalDateKey(), birthday: "",
    address_line_1: "", city: "", state_territory: "", postal_code: "",
    focus_group: "General", onboarding_stage: "New", coaching_focus: "",
    next_coaching_date: "", notes: "",
    relationship_type: "Personal Recruit" as 'Personal Recruit' | 'Unit Member',
  };
  const [form, setForm] = useState(emptyForm);
  const resetForm = () => setForm(emptyForm);
  const [relationshipFilter, setRelationshipFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const todayKey = toLocalDateKey();
    let list = [...consultants];

    // Focus group filter
    if (focusFilter === "New+Key") {
      list = list.filter((c) => {
        const fg = c.focus_group || "General";
        return fg === "New Consultant" || fg === "Key Consultant";
      });
    } else if (focusFilter !== "all") {
      list = list.filter((c) => (c.focus_group || "General") === focusFilter);
    }

    // Relationship type filter
    if (relationshipFilter !== "all") {
      list = list.filter((c) => (c.relationship_type ?? "Personal Recruit") === relationshipFilter);
    }

    // Coaching status filter
    if (coachingFilter !== "all") {
      list = list.filter((c) => {
        if (!c.next_coaching_date) return false;
        const cmp = compareDateOnly(c.next_coaching_date, todayKey);
        if (coachingFilter === "today") return cmp === 0;
        if (coachingFilter === "overdue") return cmp === -1;
        if (coachingFilter === "upcoming") return cmp === 1;
        return true;
      });
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.first_name || "").toLowerCase().includes(q) ||
        (c.last_name || "").toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "name-az") return a.name.localeCompare(b.name);
      if (sortBy === "name-za") return b.name.localeCompare(a.name);
      if (sortBy === "newest") return (b.join_date || "").localeCompare(a.join_date || "");
      if (sortBy === "oldest") return (a.join_date || "").localeCompare(b.join_date || "");
      const aD = a.next_coaching_date || "9999";
      const bD = b.next_coaching_date || "9999";
      return aD.localeCompare(bD);
    });

    return list;
  }, [consultants, focusFilter, coachingFilter, search, sortBy, relationshipFilter]);

  const buildPayload = () => {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(form)) cleaned[k] = v === "" ? null : v;
    // Auto-generate full name from first + last
    const first = (form.first_name || "").trim();
    const last = (form.last_name || "").trim();
    cleaned.name = [first, last].filter(Boolean).join(" ") || "Unnamed";
    cleaned.first_name = first || null;
    cleaned.last_name = last || null;
    if (!cleaned.status) cleaned.status = "Active";
    return cleaned;
  };

  const duplicateMatch = useMemo(() => {
    if (editId) return null;
    const p = stripPhone(form.phone);
    const e = normalizeEmail(form.email);
    const fullName = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ").toLowerCase();
    if (!p && !e && !fullName) return null;
    return consultants.find((c: TeamConsultant) => {
      const cp = stripPhone(c.phone);
      const ce = normalizeEmail(c.email);
      const cn = (c.name || "").trim().toLowerCase();
      if (p && p.length >= 7 && cp === p) return true;
      if (e && ce && ce === e) return true;
      if (fullName && cn && cn === fullName) return true;
      return false;
    }) || null;
  }, [form.phone, form.email, form.first_name, form.last_name, consultants, editId]);

  const createMut = useMutation({
    mutationFn: () => createTeamConsultant(buildPayload() as any),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["team-consultants"] }); setShowAdd(false); resetForm(); toast.success("Consultant added!"); },
  });

  const updateMut = useMutation({
    mutationFn: () => updateTeamConsultant(editId!, buildPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["team-consultants"] }); setEditId(null); resetForm(); toast.success("Updated!"); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTeamConsultant(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["team-consultants"] }); setDeleteTarget(null); toast.success("Deleted"); },
  });

  const convertToCustomerMut = useMutation({
    mutationFn: (consultant: TeamConsultant) => convertConsultantToCustomer(consultant),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setConvertTarget(null);
      setViewConsultant(null);
      toast.success("Converted to customer");
    },
    onError: (err: any) => toast.error(err.message || "Failed to convert"),
  });

  const openEdit = (c: TeamConsultant) => {
    setForm({
      first_name: c.first_name || "", last_name: c.last_name || "",
      name: c.name, phone: c.phone || "", email: c.email || "",
      consultant_id: c.consultant_id || "", join_date: c.join_date || "", birthday: c.birthday || "",
      address_line_1: c.address_line_1 || "", city: c.city || "",
      state_territory: c.state_territory || "", postal_code: c.postal_code || "",
      focus_group: c.focus_group || "General", onboarding_stage: c.onboarding_stage || "New",
      coaching_focus: c.coaching_focus || "", next_coaching_date: c.next_coaching_date || "",
      notes: c.notes || "",
      relationship_type: (c.relationship_type ?? "Personal Recruit") as 'Personal Recruit' | 'Unit Member',
    });
    setEditId(c.id);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search consultants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {/* Filters Row */}
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={focusFilter} onValueChange={setFocusFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Consultants</SelectItem>
              <SelectItem value="New+Key">New + Key</SelectItem>
              {FOCUS_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={coachingFilter} onValueChange={setCoachingFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Coaching</SelectItem>
              <SelectItem value="today">Due Today</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
            </SelectContent>
          </Select>
          <Select value={relationshipFilter} onValueChange={setRelationshipFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Relationships</SelectItem>
              {RELATIONSHIP_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <ArrowUpDown className="w-3 h-3 mr-1" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="coaching">Coaching Date (Soonest)</SelectItem>
              <SelectItem value="name-az">Name (A–Z)</SelectItem>
              <SelectItem value="name-za">Name (Z–A)</SelectItem>
              <SelectItem value="newest">Newest (Start Date)</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{filtered.length} consultant{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}><Plus className="w-4 h-4 mr-1" />Add Consultant</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{consultants.length === 0 ? "No consultants yet. Convert a prospect or add one manually." : "No consultants match this filter."}</p>
      ) : (() => {
        const newConsultants = filtered.filter(c => {
          if (c.onboarding_exit_status) return false;
          if (!c.join_date) return false;
          const daysSinceJoin = differenceInDays(new Date(), parseISO(c.join_date));
          return daysSinceJoin <= 90;
        });
        const newSet = new Set(newConsultants.map(c => c.id));
        const otherConsultants = filtered.filter(c => !newSet.has(c.id));

        const renderCard = (c: TeamConsultant) => {
          const overdue = c.next_coaching_date && compareDateOnly(c.next_coaching_date) === -1;
          const today = c.next_coaching_date && compareDateOnly(c.next_coaching_date) === 0;
          return (
            <Card key={c.id} className={cn("border-border/50 shadow-sm cursor-pointer hover:shadow-md transition-shadow", overdue && "border-destructive/40 bg-destructive/5", today && "border-primary/40 bg-primary/5")} onClick={() => setViewConsultant(c)}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                    {c.consultant_id && <span className="text-[10px] text-muted-foreground">#{c.consultant_id}</span>}
                    {c.onboarding_stage && (
                      <Badge variant="secondary" className={cn("text-[10px]", ONBOARDING_STAGE_COLORS[c.onboarding_stage] || "")}>
                        {c.onboarding_stage}
                      </Badge>
                    )}
                    {c.focus_group && c.focus_group !== "General" && (
                      <Badge variant="outline" className="text-[10px]">{c.focus_group}</Badge>
                    )}
                    <Badge variant="outline" className={cn("text-[10px]", (c.relationship_type ?? "Personal Recruit") === "Unit Member" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-pink-50 text-pink-700 border-pink-200")}>
                      {(c.relationship_type ?? "Personal Recruit") === "Unit Member" ? "Unit" : "Personal"}
                    </Badge>
                  </div>
                  {c.coaching_focus && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Focus: {c.coaching_focus}
                      {c.next_coaching_date && ` • ${formatDateOnly(c.next_coaching_date)}`}
                      {overdue && <span className="text-destructive font-medium"> · Overdue</span>}
                      {today && <span className="text-primary font-medium"> · Today</span>}
                    </p>
                  )}
                  {!c.coaching_focus && c.next_coaching_date && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <CalendarDays className="w-3 h-3 text-muted-foreground" />
                      <span className={cn("text-xs", overdue ? "text-destructive font-medium" : today ? "text-primary font-medium" : "text-muted-foreground")}>
                        Coaching: {formatDateOnly(c.next_coaching_date)}
                        {overdue && " · Overdue"}
                        {today && " · Today"}
                      </span>
                    </div>
                  )}
                  {c.join_date && <p className="text-[10px] text-muted-foreground mt-0.5">Joined {formatDateOnly(c.join_date)}</p>}
                </div>
              </CardContent>
            </Card>
          );
        };

        return (
          <div className="space-y-4">
            {newConsultants.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold text-pink-700 uppercase tracking-wider">🌟 New Consultants (First 90 Days)</p>
                  <Badge variant="secondary" className="text-[10px] bg-pink-100 text-pink-700">{newConsultants.length}</Badge>
                </div>
                <div className="space-y-2">{newConsultants.map(renderCard)}</div>
              </div>
            )}
            {otherConsultants.length > 0 && (
              <div className="space-y-2">
                {newConsultants.length > 0 && (
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">All Consultants</p>
                )}
                <div className="space-y-2">{otherConsultants.map(renderCard)}</div>
              </div>
            )}
          </div>
        );
      })()}


      {/* Add/Edit Dialog */}
      <Dialog open={showAdd || !!editId} onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editId ? "Edit Consultant" : "Add Consultant"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Info</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="First Name *" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                <Input placeholder="Last Name *" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>

            {/* Consultant Details */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consultant Details</p>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Consultant ID" value={form.consultant_id} onChange={(e) => setForm({ ...form, consultant_id: e.target.value })} />
                <div>
                  <label className="text-xs text-muted-foreground">Start Date</label>
                  <Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Birthday</label>
                  <Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Relationship Type *</label>
                <Select value={form.relationship_type} onValueChange={(v) => setForm({ ...form, relationship_type: v as 'Personal Recruit' | 'Unit Member' })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mailing Address</p>
              <Input placeholder="Address" value={form.address_line_1} onChange={(e) => setForm({ ...form, address_line_1: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <Input placeholder="State" value={form.state_territory} onChange={(e) => setForm({ ...form, state_territory: e.target.value })} />
                <Input placeholder="Zip" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
              </div>
            </div>

            {/* Coaching */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coaching</p>
              <div className={cn("grid gap-2", form.focus_group && form.focus_group !== "General" ? "grid-cols-3" : "grid-cols-2")}>
                <Select value={form.focus_group} onValueChange={(v) => setForm({ ...form, focus_group: v, onboarding_stage: v === "General" ? "" : form.onboarding_stage })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Focus Group" /></SelectTrigger>
                  <SelectContent>{FOCUS_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
                {form.focus_group && form.focus_group !== "General" && (
                  <Select value={form.onboarding_stage} onValueChange={(v) => setForm({ ...form, onboarding_stage: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Growth Stage" /></SelectTrigger>
                    <SelectContent>{ONBOARDING_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Select value={form.coaching_focus || "none"} onValueChange={(v) => setForm({ ...form, coaching_focus: v === "none" ? "" : v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Coaching Focus" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {COACHING_FOCUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Next Coaching Date</label>
                <Input type="date" value={form.next_coaching_date} onChange={(e) => setForm({ ...form, next_coaching_date: e.target.value })} />
              </div>
              <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-[60px]" />
            </div>

            {duplicateMatch && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs font-semibold text-destructive">
                    A consultant already exists: {duplicateMatch.name}
                    {duplicateMatch.phone ? ` · ${formatPhone(duplicateMatch.phone)}` : ""}
                  </p>
                </div>
              </div>
            )}
            <Button className="w-full" onClick={() => editId ? updateMut.mutate() : createMut.mutate()} disabled={(!form.first_name.trim() && !form.last_name.trim()) || createMut.isPending || updateMut.isPending || !!duplicateMatch}>
              {(createMut.isPending || updateMut.isPending) ? "Saving..." : editId ? "Save Changes" : "Add Consultant"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Consultant?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove {deleteTarget?.name}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Consultant Sheet */}
      <Sheet open={!!viewConsultant} onOpenChange={(open) => !open && setViewConsultant(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {viewConsultant && (() => {
            const vc = viewConsultant;
            const address = [vc.address_line_1, vc.city, vc.state_territory, vc.postal_code].filter(Boolean).join(", ");
            return (
              <>
                <SheetHeader className="pb-0">
                  <SheetTitle className="text-lg">{vc.name}</SheetTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {vc.consultant_id && <Badge variant="outline" className="text-[10px]">#{vc.consultant_id}</Badge>}
                    {vc.focus_group && <Badge variant="secondary" className="text-[10px]">{vc.focus_group}</Badge>}
                    {vc.onboarding_stage && vc.focus_group !== "General" && (
                      <Badge variant="secondary" className={cn("text-[10px]", ONBOARDING_STAGE_COLORS[vc.onboarding_stage] || "")}>
                        {vc.onboarding_stage}
                      </Badge>
                    )}
                  </div>
                </SheetHeader>

                {/* Quick Actions */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  {vc.phone && (
                    <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" asChild>
                      <a href={`tel:${phoneForLink(vc.phone)}`}><Phone className="w-3 h-3" />Call</a>
                    </Button>
                  )}
                  {vc.phone && (
                    <TextActionButton phone={vc.phone} trigger="labeled" className="gap-1 h-7 text-xs" />
                  )}
                  {vc.email && (
                    <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" asChild>
                      <a href={`mailto:${vc.email}`} onClick={(e) => openEmail(vc.email!, e)}><Mail className="w-3 h-3" />Email</a>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => { setViewConsultant(null); openEdit(vc); }}>
                    <Pencil className="w-3 h-3" />Edit
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-destructive hover:text-destructive" onClick={() => { setViewConsultant(null); setDeleteTarget(vc); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => setConvertTarget(vc)}>
                    <ArrowRightLeft className="w-3 h-3" />Customer
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => { setMergeTarget(vc); }}>
                    <GitMerge className="w-3 h-3" />Merge
                  </Button>
                </div>

                <Separator className="my-3" />

                {/* Coaching Info - condensed */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Coaching Focus</p>
                    <p className="font-medium text-xs">{vc.coaching_focus || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Next Coaching</p>
                    <p className={cn("font-medium text-xs", vc.next_coaching_date && compareDateOnly(vc.next_coaching_date) === -1 && "text-destructive", vc.next_coaching_date && compareDateOnly(vc.next_coaching_date) === 0 && "text-primary")}>
                      {vc.next_coaching_date ? formatDateOnly(vc.next_coaching_date) : "—"}
                      {vc.next_coaching_date && compareDateOnly(vc.next_coaching_date) === -1 && " · Overdue"}
                      {vc.next_coaching_date && compareDateOnly(vc.next_coaching_date) === 0 && " · Today"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Start Date</p>
                    <p className="font-medium text-xs">{vc.join_date ? formatDateOnly(vc.join_date) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Birthday</p>
                    <p className="font-medium text-xs">{vc.birthday ? formatDateOnly(vc.birthday) : "—"}</p>
                  </div>
                </div>

                <Separator className="my-3" />

                {/* Onboarding Tracker - only for active new consultants */}
                {(() => {
                  if (vc.onboarding_exit_status) return null;
                  if (!vc.join_date) return null;
                  const daysSinceJoin = differenceInDays(new Date(), parseISO(vc.join_date));
                  if (daysSinceJoin > 90) return null;
                  return (
                    <>
                      <OnboardingTrackerPanel
                        consultant={vc}
                        onUpdate={(fields) => {
                          updateTeamConsultant(vc.id, fields)
                            .then(() => {
                              queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
                              setViewConsultant({ ...vc, ...fields } as TeamConsultant);
                              if (fields.onboarding_exit_status) {
                                toast.success(`Marked as ${fields.onboarding_exit_status}`);
                              }
                            })
                            .catch((err) => toast.error(err.message || "Failed to save"));
                        }}
                      />
                      <Separator className="my-3" />
                    </>
                  );
                })()}

                {/* Activity Logger - prioritized above contact info */}
                <ConsultantActivityLogger consultantId={vc.id} consultantName={vc.name} />

                {/* Contact & address details - condensed at bottom */}
                {(vc.phone || vc.email || address) && (
                  <>
                    <Separator className="my-3" />
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Contact Info</p>
                      <div className="space-y-1">
                        {vc.phone && (
                          <div className="flex items-center gap-2 text-xs">
                            <Phone className="w-3 h-3 text-muted-foreground" />
                            <a href={`tel:${phoneForLink(vc.phone)}`} className="text-primary hover:underline">{formatPhone(vc.phone)}</a>
                          </div>
                        )}
                        {vc.email && (
                          <div className="flex items-center gap-2 text-xs">
                            <Mail className="w-3 h-3 text-muted-foreground" />
                            <a href={`mailto:${vc.email}`} onClick={(e) => openEmail(vc.email!, e)} className="text-primary hover:underline">{vc.email}</a>
                          </div>
                        )}
                        {address && (
                          <div className="flex items-start gap-2 text-xs">
                            <MapPin className="w-3 h-3 text-muted-foreground mt-0.5" />
                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{address}</a>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <ImportConsultantsDialog open={showImport} onOpenChange={setShowImport} />

      {/* Convert to Customer Confirmation */}
      <AlertDialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              {convertTarget?.name} will be moved to the Customers list with a "Former Consultant" status. Their coaching data will be removed but all customer history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => convertTarget && convertToCustomerMut.mutate(convertTarget)} disabled={convertToCustomerMut.isPending}>
              {convertToCustomerMut.isPending ? "Converting..." : "Convert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
/* ─── Leadership Tab ─── */
function LeadershipTab() {
  const queryClient = useQueryClient();
  const { data: members = [], isLoading } = useQuery({ queryKey: ["leadership-members"], queryFn: fetchLeadershipMembers });

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadershipMember | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", current_title: "", goal: "", unit_members: "", personal_production: "", unit_production: "", next_coaching_date: "", notes: "" });

  const resetForm = () => setForm({ name: "", phone: "", email: "", current_title: "", goal: "", unit_members: "", personal_production: "", unit_production: "", next_coaching_date: "", notes: "" });

  const buildPayload = () => ({
    name: form.name,
    phone: form.phone || null,
    email: form.email || null,
    current_title: form.current_title || null,
    goal: form.goal || null,
    unit_members: parseInt(form.unit_members) || 0,
    personal_production: parseFloat(form.personal_production) || 0,
    unit_production: parseFloat(form.unit_production) || 0,
    next_coaching_date: form.next_coaching_date || null,
    notes: form.notes || null,
  });

  const createMut = useMutation({
    mutationFn: () => createLeadershipMember(buildPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["leadership-members"] }); setShowAdd(false); resetForm(); toast.success("Leader added!"); },
  });

  const updateMut = useMutation({
    mutationFn: () => updateLeadershipMember(editId!, buildPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["leadership-members"] }); setEditId(null); resetForm(); toast.success("Updated!"); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteLeadershipMember(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["leadership-members"] }); setDeleteTarget(null); toast.success("Deleted"); },
  });

  const openEdit = (m: LeadershipMember) => {
    setForm({
      name: m.name, phone: m.phone || "", email: m.email || "",
      current_title: m.current_title || "", goal: m.goal || "",
      unit_members: String(m.unit_members || ""), personal_production: String(m.personal_production || ""),
      unit_production: String(m.unit_production || ""),
      next_coaching_date: m.next_coaching_date || "", notes: m.notes || "",
    });
    setEditId(m.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{members.length} leaders</p>
        <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}><Plus className="w-4 h-4 mr-1" />Add Leader</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : members.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No leadership members yet.</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const overdue = m.next_coaching_date && compareDateOnly(m.next_coaching_date) === -1;
            const today = m.next_coaching_date && compareDateOnly(m.next_coaching_date) === 0;
            return (
              <Card key={m.id} className={cn("border-border/50 shadow-sm", overdue && "border-destructive/40 bg-destructive/5", today && "border-primary/40 bg-primary/5")}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                      {m.current_title && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{m.current_title}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {m.goal && <span>Goal: {m.goal}</span>}
                      {m.unit_members > 0 && <span>{m.unit_members} members</span>}
                    </div>
                    {m.next_coaching_date && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <CalendarDays className="w-3 h-3 text-muted-foreground" />
                        <span className={cn("text-xs", overdue ? "text-destructive font-medium" : today ? "text-primary font-medium" : "text-muted-foreground")}>
                          Coaching: {formatDateOnly(m.next_coaching_date)}
                          {overdue && " · Overdue"}
                          {today && " · Today"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(m)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd || !!editId} onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditId(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{editId ? "Edit Leader" : "Add Leader"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Current Title" value={form.current_title} onChange={(e) => setForm({ ...form, current_title: e.target.value })} />
              <Select value={form.goal || "none"} onValueChange={(v) => setForm({ ...form, goal: v === "none" ? "" : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Goal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No goal set</SelectItem>
                  {LEADERSHIP_GOALS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Unit Members</label>
                <Input type="number" min={0} value={form.unit_members} onChange={(e) => setForm({ ...form, unit_members: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Personal Prod.</label>
                <Input type="number" min={0} step="0.01" value={form.personal_production} onChange={(e) => setForm({ ...form, personal_production: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Unit Prod.</label>
                <Input type="number" min={0} step="0.01" value={form.unit_production} onChange={(e) => setForm({ ...form, unit_production: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Next Coaching Date</label>
              <Input type="date" value={form.next_coaching_date} min={toLocalDateKey()} onChange={(e) => setForm({ ...form, next_coaching_date: e.target.value })} />
            </div>
            <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-[60px]" />
            <Button className="w-full" onClick={() => editId ? updateMut.mutate() : createMut.mutate()} disabled={!form.name.trim() || createMut.isPending || updateMut.isPending}>
              {(createMut.isPending || updateMut.isPending) ? "Saving..." : editId ? "Save Changes" : "Add Leader"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leader?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove {deleteTarget?.name}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Merge duplicate consultant */}
      <MergePickerDialog
        open={!!mergeTarget}
        onOpenChange={(v) => { if (!v) setMergeTarget(null); }}
        currentId={mergeTarget?.id || ""}
        currentName={mergeTarget?.name || ""}
        kind="consultant"
        onMerged={(keepId) => { setMergeTarget(null); setViewConsultant(null); if (keepId) { /* refresh handled by invalidate */ } }}
      />
    </div>
  );
}
