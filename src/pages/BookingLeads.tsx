import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBookingLeads, createBookingLead, updateBookingLead, deleteBookingLead, convertBookingLeadToCustomer, fetchEvents, createTeamConsultant } from "@/lib/queries";
import { BOOKING_LEAD_STATUSES, BOOKING_LEAD_SOURCES, LEAD_ACTIVITIES, NEXT_STEP_TYPES } from "@/lib/types";
import { formatDateOnly, toLocalDateKey } from "@/lib/dateOnly";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import type { BookingLead } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, MessageSquare, Mail, Plus, UserCheck, Trash2, Search, Clock, Users, Briefcase } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Contacted: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Booked: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "Not Interested": "bg-muted text-muted-foreground",
};

function getDefaultFollowUp(): string {
  return format(addDays(new Date(), 2), "yyyy-MM-dd");
}

export default function BookingLeads() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["booking-leads"], queryFn: fetchBookingLeads });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editLead, setEditLead] = useState<BookingLead | null>(null);
  const [deleteLead, setDeleteLead] = useState<BookingLead | null>(null);
  const [convertLead, setConvertLead] = useState<BookingLead | null>(null);
  const [convertType, setConvertType] = useState<"customer" | "consultant">("customer");

  // Quick Add form state
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    lead_source: "",
    next_step: "",
    next_follow_up_date: getDefaultFollowUp(),
  });

  const resetForm = () => setForm({
    name: "",
    phone: "",
    email: "",
    lead_source: "",
    next_step: "",
    next_follow_up_date: getDefaultFollowUp(),
  });

  // Edit form state (full fields)
  const [editForm, setEditForm] = useState({
    name: "", phone: "", email: "", lead_source: "",
    lead_activity: "No Activity Yet", notes: "", next_follow_up_date: "",
  });

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter === "all" && l.converted_customer_id) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (activityFilter !== "all" && (l.lead_activity || "No Activity Yet") !== activityFilter) return false;
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [leads, search, statusFilter, activityFilter]);

  // Quick Add validation
  const hasContact = form.phone.trim() || form.email.trim();
  const canCreate = form.name.trim() && hasContact && form.next_step.trim() && form.next_follow_up_date;

  const createMut = useMutation({
    mutationFn: () => createBookingLead({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      lead_source: form.lead_source || null,
      lead_activity: "No Activity Yet",
      notes: form.next_step.trim() ? `Next Step: ${form.next_step.trim()}` : null,
      next_follow_up_date: form.next_follow_up_date || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      setShowAdd(false);
      resetForm();
      toast.success("Lead added — follow-up scheduled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (updates: Partial<BookingLead>) => updateBookingLead(editLead!.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      setEditLead(null);
      toast.success("Lead updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteBookingLead(deleteLead!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      setDeleteLead(null);
      toast.success("Lead deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertToCustomerMut = useMutation({
    mutationFn: () => convertBookingLeadToCustomer(convertLead!, events.map(e => e.event_id)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setConvertLead(null);
      toast.success("Lead converted to customer!");
      if (result.customer?.id) {
        navigate(`/customers/${result.customer.id}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertToConsultantMut = useMutation({
    mutationFn: async () => {
      const lead = convertLead!;
      const parts = lead.name.trim().split(/\s+/);
      const consultant = await createTeamConsultant({
        name: lead.name,
        first_name: parts[0] || null,
        last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
        phone: lead.phone,
        email: lead.email,
        notes: lead.notes ? `Converted from lead. ${lead.notes}` : "Converted from lead.",
        status: "Active",
        onboarding_stage: "New",
        focus_group: "New Consultant",
      });
      await updateBookingLead(lead.id, { converted_customer_id: consultant.id, status: "Booked" } as any);
      return consultant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      setConvertLead(null);
      toast.success("Lead converted to consultant!");
      navigate("/leadership");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (lead: BookingLead) => {
    setEditLead(lead);
    setEditForm({
      name: lead.name,
      phone: lead.phone || "",
      email: lead.email || "",
      lead_source: lead.lead_source || "",
      lead_activity: lead.lead_activity || "No Activity Yet",
      notes: lead.notes || "",
      next_follow_up_date: lead.next_follow_up_date || "",
    });
  };

  const handleSaveEdit = () => {
    if (!editLead) return;
    updateMut.mutate({
      name: editForm.name.trim(),
      phone: editForm.phone.trim() || null,
      email: editForm.email.trim() || null,
      lead_source: editForm.lead_source || null,
      lead_activity: editForm.lead_activity || "No Activity Yet",
      notes: editForm.notes.trim() || null,
      next_follow_up_date: editForm.next_follow_up_date || null,
    });
  };

  const activeLeads = useMemo(() => leads.filter((l) => !l.converted_customer_id), [leads]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { New: 0, Contacted: 0, Booked: 0, "Not Interested": 0 };
    activeLeads.forEach((l) => { c[l.status] = (c[l.status] || 0) + 1; });
    return c;
  }, [activeLeads]);

  const isConverting = convertToCustomerMut.isPending || convertToConsultantMut.isPending;

  return (
    <Layout>
      <div className="space-y-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Leads</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeLeads.length} active · {counts.New} new · {counts.Contacted} contacted · {counts.Booked} booked
            </p>
          </div>
          <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
            <Plus className="w-4 h-4 mr-1" />Quick Add
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["all", ...BOOKING_LEAD_STATUSES].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : s}
                {s !== "all" && <span className="ml-1 text-[10px] opacity-70">({counts[s] || 0})</span>}
              </Button>
            ))}
          </div>
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="h-9 w-[180px] text-xs">
              <SelectValue placeholder="All Activities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              {LEAD_ACTIVITIES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Leads list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No leads found</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((lead) => (
              <Card key={lead.id} className="border-border/50 shadow-sm hover:shadow transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(lead)}>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-foreground truncate">{lead.name}</p>
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", STATUS_COLORS[lead.status] || "bg-muted text-muted-foreground")}>
                          {lead.status}
                        </span>
                         {lead.lead_source && (
                           <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">{lead.lead_source}</span>
                         )}
                         {lead.lead_activity && lead.lead_activity !== "No Activity Yet" && (
                           <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{lead.lead_activity}</span>
                         )}
                         {lead.converted_customer_id && (
                           <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-medium">Converted</span>
                         )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {lead.phone && <span>{formatPhone(lead.phone)}</span>}
                        {lead.email && <span>{lead.email}</span>}
                        {lead.last_contact_date && <span>Last contact: {formatDateOnly(lead.last_contact_date)}</span>}
                        {lead.next_follow_up_date && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />FU: {formatDateOnly(lead.next_follow_up_date)}
                          </span>
                        )}
                      </div>
                      {lead.notes && (
                        <p className="text-[11px] text-muted-foreground truncate mt-1 italic">📝 {lead.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {lead.phone && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={`tel:${phoneForLink(lead.phone)}`}><Phone className="w-3.5 h-3.5 text-primary" /></a>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={`sms:${phoneForLink(lead.phone)}`}><MessageSquare className="w-3.5 h-3.5 text-primary" /></a>
                          </Button>
                        </>
                      )}
                      {!lead.converted_customer_id && lead.status !== "Not Interested" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setConvertType("customer"); setConvertLead(lead); }} title="Convert">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteLead(lead)} title="Delete">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ═══ Quick Add Lead Dialog ═══ */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Quick Add Lead</DialogTitle>
              <DialogDescription>Fast lead capture — details can be added later.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div>
                <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder={`Phone${!form.email.trim() ? " *" : ""}`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10" />
                <Input placeholder={`Email${!form.phone.trim() ? " *" : ""}`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10" />
              </div>
              {form.name.trim() && !hasContact && (
                <p className="text-xs text-destructive">Phone or email is required.</p>
              )}
              <Select value={form.lead_source} onValueChange={(v) => setForm({ ...form, lead_source: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Lead Source (optional)" /></SelectTrigger>
                <SelectContent>
                  {BOOKING_LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Follow-Up Plan</p>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Next Step *</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {NEXT_STEP_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, next_step: t })}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                          form.next_step === t
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Follow-Up Date *</label>
                  <Input
                    type="date"
                    value={form.next_follow_up_date}
                    min={toLocalDateKey()}
                    onChange={(e) => setForm({ ...form, next_follow_up_date: e.target.value })}
                    className="h-10 max-w-[200px]"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Default: 2 days from now</p>
                </div>
              </div>

              <Button
                className="w-full h-11"
                onClick={() => createMut.mutate()}
                disabled={!canCreate || createMut.isPending}
              >
                {createMut.isPending ? "Adding..." : "Add Lead"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ═══ Edit Lead Sheet ═══ */}
        <Sheet open={!!editLead} onOpenChange={(open) => !open && setEditLead(null)}>
          <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
            <SheetHeader className="p-6 pb-4 border-b border-border">
              <SheetTitle className="text-lg">{editLead?.name}</SheetTitle>
              {editLead && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", STATUS_COLORS[editLead.status])}>
                    {editLead.status}
                  </span>
                  {editLead.lead_activity && editLead.lead_activity !== "No Activity Yet" && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{editLead.lead_activity}</span>
                  )}
                  {editLead.lead_source && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">{editLead.lead_source}</span>
                  )}
                </div>
              )}
              {editLead && (
                <div className="flex gap-2 mt-3">
                  {editLead.phone && (
                    <>
                      <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                        <a href={`tel:${phoneForLink(editLead.phone)}`}><Phone className="w-3 h-3 mr-1" />Call</a>
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                        <a href={`sms:${phoneForLink(editLead.phone)}`}><MessageSquare className="w-3 h-3 mr-1" />Text</a>
                      </Button>
                    </>
                  )}
                  {editLead.email && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                      <a href={`mailto:${editLead.email}`}><Mail className="w-3 h-3 mr-1" />Email</a>
                    </Button>
                  )}
                  {!editLead.converted_customer_id && editLead.status !== "Not Interested" && (
                    <Button variant="outline" size="sm" className="h-8 text-xs text-emerald-600 border-emerald-200" onClick={() => { setEditLead(null); setConvertType("customer"); setConvertLead(editLead); }}>
                      <UserCheck className="w-3 h-3 mr-1" />Convert
                    </Button>
                  )}
                </div>
              )}
            </SheetHeader>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={editLead?.status || "New"} onValueChange={(v) => updateMut.mutate({ status: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BOOKING_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Lead Activity */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Lead Activity</label>
                  <Select value={editForm.lead_activity} onValueChange={(v) => setEditForm({ ...editForm, lead_activity: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_ACTIVITIES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mark Contacted */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => updateMut.mutate({ last_contact_date: toLocalDateKey(), status: editLead?.status === "New" ? "Contacted" : editLead?.status })}
                >
                  <Phone className="w-3.5 h-3.5 mr-1" />Mark Contacted Today
                </Button>

                {/* Form fields */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                  <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                  <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Lead Source</label>
                  <Select value={editForm.lead_source} onValueChange={(v) => setEditForm({ ...editForm, lead_source: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {BOOKING_LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Next Follow-Up Date
                  </label>
                  <Input type="date" value={editForm.next_follow_up_date} min={toLocalDateKey()} onChange={(e) => setEditForm({ ...editForm, next_follow_up_date: e.target.value })} className="h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="min-h-[80px]" />
                </div>
                <Button className="w-full" onClick={handleSaveEdit} disabled={!editForm.name.trim() || updateMut.isPending}>
                  {updateMut.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* ═══ Delete Confirmation ═══ */}
        <AlertDialog open={!!deleteLead} onOpenChange={(open) => !open && setDeleteLead(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lead</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {deleteLead?.name}? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteMut.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ═══ Convert Dialog ═══ */}
        <Dialog open={!!convertLead} onOpenChange={(open) => !open && setConvertLead(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Convert Lead</DialogTitle>
              <DialogDescription>
                Choose how to convert <span className="font-medium text-foreground">{convertLead?.name}</span>.
                Contact info and notes will be carried over.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConvertType("customer")}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1.5 p-4 rounded-lg border-2 transition-colors",
                    convertType === "customer"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Users className="w-5 h-5" />
                  <span className="text-sm font-medium">Customer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConvertType("consultant")}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1.5 p-4 rounded-lg border-2 transition-colors",
                    convertType === "consultant"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Briefcase className="w-5 h-5" />
                  <span className="text-sm font-medium">Consultant</span>
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                {convertType === "customer"
                  ? "A new customer record will be created. You can add address, birthday, and other details on the customer profile."
                  : "A new team consultant record will be created with 'New Consultant' focus group. You can add consultant ID, coaching details on the leadership page."}
              </p>

              {(!convertLead?.phone && !convertLead?.email) && (
                <p className="text-xs text-destructive font-medium">⚠️ This lead has no phone or email. Consider adding contact info before converting.</p>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setConvertLead(null)}>Cancel</Button>
                <Button
                  onClick={() => convertType === "customer" ? convertToCustomerMut.mutate() : convertToConsultantMut.mutate()}
                  disabled={isConverting}
                >
                  <UserCheck className="w-4 h-4 mr-1" />
                  {isConverting ? "Converting..." : `Convert to ${convertType === "customer" ? "Customer" : "Consultant"}`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}