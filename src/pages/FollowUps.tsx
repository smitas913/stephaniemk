import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders, updateCustomer, createCustomerNote, fetchLatestNotes, fetchProspects, updateProspect, createProspectNote, bulkUpdateCustomerFollowUps } from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import { NOTE_TYPES } from "@/lib/types";
import type { Customer, CustomerComputed, CustomerNote } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarCheck, Cake, Phone, MessageSquare, Mail, FileText, CheckCircle2, UserPlus, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, addDays } from "date-fns";

type Enriched = Customer & CustomerComputed;

// Unified item for follow-up lists
type FollowUpItem = {
  id: string;
  itemType: "customer" | "prospect";
  name: string;
  phone: string | null;
  email: string | null;
  vip?: string;
  next_follow_up: string | null;
  follow_up_status: string;
  activity_status?: string;
  days_since_last_order?: number | null;
  opportunity_status?: string;
  new_follow_up_stage?: string | null;
  // birthday fields (only for customers)
  birthday_mmdd?: string | null;
};

function parseBirthdayMMDD(mmdd: string | null): { month: number; day: number } | null {
  if (!mmdd) return null;
  const cleaned = mmdd.replace(/[^0-9]/g, "");
  if (cleaned.length < 3) return null;
  const month = parseInt(cleaned.slice(0, cleaned.length === 3 ? 1 : 2), 10);
  const day = parseInt(cleaned.slice(cleaned.length === 3 ? 1 : 2), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function daysToBirthday(mmdd: string | null): number | null {
  const parsed = parseBirthdayMMDD(mmdd);
  if (!parsed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let bday = new Date(today.getFullYear(), parsed.month - 1, parsed.day);
  bday.setHours(0, 0, 0, 0);
  if (bday < today) {
    bday = new Date(today.getFullYear() + 1, parsed.month - 1, parsed.day);
  }
  return Math.round((bday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function FollowUps() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading: cLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [], isLoading: oLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: allNotes = [] } = useQuery({ queryKey: ["all-notes"], queryFn: fetchLatestNotes });
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const isLoading = cLoading || oLoading;

  const [showUpcoming7, setShowUpcoming7] = useState(false);
  const [actionItem, setActionItem] = useState<FollowUpItem | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("Call");
  const [followUpDate, setFollowUpDate] = useState("");

  // Bulk distribution state
  const [showDistribute, setShowDistribute] = useState(false);
  const [distributeDays, setDistributeDays] = useState("60");
  const [distributeFilter, setDistributeFilter] = useState<"overdue-today" | "no-date" | "dormant-warm">("overdue-today");
  const [distributeSelectedIds, setDistributeSelectedIds] = useState<Set<string>>(new Set());
  const [distributeStep, setDistributeStep] = useState<"configure" | "preview">("configure");

  const notesByCustomer = useMemo(() => {
    const map = new Map<string, CustomerNote>();
    for (const n of allNotes) {
      if (!map.has(n.customer_id)) map.set(n.customer_id, n);
    }
    return map;
  }, [allNotes]);

  // Enriched customers for distribution
  const enrichedCustomers = useMemo(() => {
    return customers
      .filter((c) => c.is_active !== false)
      .map((c) => {
        const custOrders = allOrders.filter((o) => o.customer_id === c.id);
        const computed = computeCustomerFields(c, custOrders);
        return { ...c, ...computed };
      });
  }, [customers, allOrders]);

  // Distribution candidates based on filter
  const distributeCandidates = useMemo(() => {
    switch (distributeFilter) {
      case "overdue-today":
        return enrichedCustomers.filter((c) => c.follow_up_status === "OVERDUE" || c.follow_up_status === "TODAY");
      case "no-date":
        return enrichedCustomers.filter((c) => !c.next_follow_up);
      case "dormant-warm":
        return enrichedCustomers.filter((c) => c.activity_status === "Dormant" || c.activity_status === "Warm");
      default:
        return [];
    }
  }, [enrichedCustomers, distributeFilter]);

  // When filter changes, auto-select all candidates
  const openDistributeDialog = () => {
    setDistributeStep("configure");
    setShowDistribute(true);
  };

  const handleDistributeFilterChange = (filter: typeof distributeFilter) => {
    setDistributeFilter(filter);
    setDistributeSelectedIds(new Set());
    setDistributeStep("configure");
  };

  const toggleDistributeId = (id: string) => {
    setDistributeSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCandidates = () => {
    setDistributeSelectedIds(new Set(distributeCandidates.map((c) => c.id)));
  };

  const deselectAllCandidates = () => {
    setDistributeSelectedIds(new Set());
  };

  // Preview assignments — cap at 10 per day
  const MAX_PER_DAY = 10;

  const distributePreview = useMemo(() => {
    const maxDays = Math.max(1, parseInt(distributeDays) || 60);
    const selected = distributeCandidates
      .filter((c) => distributeSelectedIds.has(c.id))
      .sort((a, b) => {
        const aDate = a.next_follow_up ? parseISO(a.next_follow_up).getTime() : Infinity;
        const bDate = b.next_follow_up ? parseISO(b.next_follow_up).getTime() : Infinity;
        return aDate - bDate;
      });
    const tomorrow = addDays(new Date(), 1);
    // Distribute evenly but never exceed MAX_PER_DAY
    const daysNeeded = Math.max(maxDays, Math.ceil(selected.length / MAX_PER_DAY));
    return selected.map((c, i) => ({
      id: c.id,
      name: c.full_name,
      date: format(addDays(tomorrow, i % daysNeeded), "yyyy-MM-dd"),
    }));
  }, [distributeCandidates, distributeSelectedIds, distributeDays]);

  const perDay = useMemo(() => {
    const maxDays = Math.max(1, parseInt(distributeDays) || 60);
    const count = distributeSelectedIds.size;
    const daysNeeded = Math.max(maxDays, Math.ceil(count / MAX_PER_DAY));
    return Math.ceil(count / daysNeeded);
  }, [distributeSelectedIds, distributeDays]);

  const distributeMutation = useMutation({
    mutationFn: () => bulkUpdateCustomerFollowUps(distributePreview.map((p) => ({ id: p.id, next_follow_up_date: p.date }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowDistribute(false);
      setDistributeSelectedIds(new Set());
      toast.success(`Distributed ${distributePreview.length} follow-ups across ${distributeDays} days`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { callsForToday, birthdaysToday, birthdaysUpcoming } = useMemo(() => {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    // Customer follow-up items
    const customerItems: FollowUpItem[] = enrichedCustomers.map((c) => {
      let daysOverdue: number | null = null;
      if (c.follow_up_status === "OVERDUE" && c.next_follow_up) {
        const nf = parseISO(c.next_follow_up);
        daysOverdue = Math.floor((todayDate.getTime() - nf.getTime()) / (1000 * 60 * 60 * 24));
      }
      return {
        id: c.id,
        itemType: "customer" as const,
        name: c.full_name,
        phone: c.phone,
        email: c.email,
        vip: c.vip,
        next_follow_up: c.next_follow_up,
        follow_up_status: c.follow_up_status,
        activity_status: c.activity_status,
        days_since_last_order: c.days_since_last_order,
        new_follow_up_stage: c.new_follow_up_stage,
        birthday_mmdd: c.birthday_mmdd,
        daysOverdue,
      };
    });

    // Prospect follow-up items
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const prospectItems: FollowUpItem[] = prospects
      .filter((p) => p.next_follow_up_date && p.opportunity_status !== "Not Interested" && p.opportunity_status !== "Joined")
      .map((p) => {
        let status = "UPCOMING";
        let daysOverdue: number | null = null;
        if (p.next_follow_up_date! < todayStr) {
          status = "OVERDUE";
          daysOverdue = Math.floor((todayDate.getTime() - parseISO(p.next_follow_up_date!).getTime()) / (1000 * 60 * 60 * 24));
        } else if (p.next_follow_up_date === todayStr) {
          status = "TODAY";
        }
        return {
          id: p.id,
          itemType: "prospect" as const,
          name: p.name,
          phone: p.phone,
          email: p.email,
          next_follow_up: p.next_follow_up_date,
          follow_up_status: status,
          opportunity_status: p.opportunity_status,
          daysOverdue,
        };
      });

    const allItems = [...customerItems, ...prospectItems];

    // Unified call list: overdue + today, sorted overdue-first (oldest first)
    const callsForToday = allItems
      .filter((c) => c.follow_up_status === "OVERDUE" || c.follow_up_status === "TODAY")
      .sort((a, b) => {
        // Overdue before today
        if (a.follow_up_status === "OVERDUE" && b.follow_up_status !== "OVERDUE") return -1;
        if (a.follow_up_status !== "OVERDUE" && b.follow_up_status === "OVERDUE") return 1;
        // Within same status, sort by date (oldest first)
        const aDate = a.next_follow_up ? parseISO(a.next_follow_up).getTime() : 0;
        const bDate = b.next_follow_up ? parseISO(b.next_follow_up).getTime() : 0;
        return aDate - bDate;
      });

    // Birthdays (customers only)
    const birthdaysToday: (FollowUpItem & { _daysUntil?: number })[] = [];
    const birthdaysUpcoming: (FollowUpItem & { _daysUntil: number })[] = [];
    for (const c of customerItems) {
      const days = daysToBirthday(c.birthday_mmdd || null);
      if (days === null) continue;
      if (days === 0) birthdaysToday.push(c);
      else if (days <= 7) birthdaysUpcoming.push({ ...c, _daysUntil: days });
    }
    birthdaysUpcoming.sort((a, b) => a._daysUntil - b._daysUntil);

    return { callsForToday, birthdaysToday, birthdaysUpcoming };
  }, [enrichedCustomers, prospects]);

  const contactMutation = useMutation({
    mutationFn: async ({ item, note, type, nextDate }: { item: FollowUpItem; note: string; type: string; nextDate?: string }) => {
      const today = format(new Date(), "yyyy-MM-dd");

      if (item.itemType === "customer") {
        const updates: Record<string, string | null> = { last_contacted: today };
        await updateCustomer(item.id, updates as any);
        if (note.trim()) {
          await createCustomerNote({ customer_id: item.id, note_text: note.trim(), note_type: type });
        }
      } else {
        const updates: Record<string, string | null> = { last_contact_date: today };
        if (nextDate) updates.next_follow_up_date = nextDate;
        await updateProspect(item.id, updates as any);
        if (note.trim()) {
          await createProspectNote({ prospect_id: item.id, note_text: note.trim() });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-notes"] });
      setActionItem(null);
      setNoteText("");
      setNoteType("Call");
      setFollowUpDate("");
      toast.success("Marked as contacted");
    },
  });

  const openContactDialog = (item: FollowUpItem, defaultType = "Call") => {
    setActionItem(item);
    setNoteText("");
    setNoteType(defaultType);
    setFollowUpDate("");
  };

  const handleSubmitAction = () => {
    if (!actionItem) return;
    contactMutation.mutate({
      item: actionItem,
      note: noteText,
      type: noteType,
      nextDate: followUpDate || undefined,
    });
  };

  const navigateToItem = (item: FollowUpItem) => {
    navigate(item.itemType === "customer" ? `/customers/${item.id}` : `/prospects/${item.id}`);
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Follow-Ups</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {overdue.length} overdue · {todayList.length} today · {birthdaysToday.length} birthday{birthdaysToday.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openDistributeDialog}>
            <CalendarRange className="w-4 h-4 mr-1" />Distribute
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Birthdays */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-50 dark:bg-pink-950/30">
                      <Cake className="w-4 h-4 text-pink-600" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-foreground">Birthdays</CardTitle>
                    <Badge variant="secondary" className="text-xs">{birthdaysToday.length}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground cursor-pointer" htmlFor="upcoming-toggle">Show next 7 days</label>
                    <Switch id="upcoming-toggle" checked={showUpcoming7} onCheckedChange={setShowUpcoming7} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {birthdaysToday.length === 0 && (!showUpcoming7 || birthdaysUpcoming.length === 0) ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No birthdays {showUpcoming7 ? "this week" : "today"} 🎂</p>
                ) : (
                  <div className="space-y-1">
                    {birthdaysToday.map((c) => (
                      <BirthdayRow key={c.id} item={c} label="Today 🎉" onNavigate={() => navigateToItem(c)} onAction={(type) => openContactDialog(c, type)} />
                    ))}
                    {showUpcoming7 && birthdaysUpcoming.map((c) => (
                      <BirthdayRow key={c.id} item={c} label={`in ${c._daysUntil}d`} onNavigate={() => navigateToItem(c)} onAction={(type) => openContactDialog(c, type)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Overdue */}
            <FollowUpSection
              title="Overdue"
              icon={AlertTriangle}
              iconColor="text-red-600"
              iconBg="bg-red-50 dark:bg-red-950/30"
              items={overdue}
              notesByCustomer={notesByCustomer}
              onNavigate={navigateToItem}
              onAction={openContactDialog}
              renderMeta={(c) => (
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-red-600 font-medium">
                    Since {c.next_follow_up ? new Date(c.next_follow_up).toLocaleDateString() : "—"}
                  </p>
                  {c.activity_status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                      {c.activity_status}
                    </span>
                  )}
                  {c.opportunity_status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                      {c.opportunity_status}
                    </span>
                  )}
                </div>
              )}
            />

            {/* 3. Today */}
            <FollowUpSection
              title="Today"
              icon={CalendarCheck}
              iconColor="text-blue-600"
              iconBg="bg-blue-50 dark:bg-blue-950/30"
              items={todayList}
              notesByCustomer={notesByCustomer}
              onNavigate={navigateToItem}
              onAction={openContactDialog}
              renderMeta={(c) => (
                <div className="text-right shrink-0">
                  {c.activity_status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                      {c.activity_status}
                    </span>
                  )}
                  {c.opportunity_status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                      {c.opportunity_status}
                    </span>
                  )}
                </div>
              )}
            />
          </div>
        )}

        {/* Action Dialog */}
        <Dialog open={!!actionItem} onOpenChange={(open) => !open && setActionItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">
                Log Contact — {actionItem?.name}
                {actionItem?.itemType === "prospect" && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium align-middle">Prospect</span>
                )}
              </DialogTitle>
            </DialogHeader>

            {actionItem && (
              <div className="flex gap-2">
                {actionItem.phone && (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${actionItem.phone}`}><Phone className="w-3.5 h-3.5 mr-1" />Call</a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`sms:${actionItem.phone}`}><MessageSquare className="w-3.5 h-3.5 mr-1" />Text</a>
                    </Button>
                  </>
                )}
                {actionItem.email && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`mailto:${actionItem.email}`}><Mail className="w-3.5 h-3.5 mr-1" />Email</a>
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-3">
              {actionItem?.itemType === "customer" && (
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Textarea placeholder="Add a note (optional)..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-[80px]" />
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Next Follow-Up Date</label>
                <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="h-9" />
              </div>
              <div className="flex items-center gap-2">
                <Button className="flex-1" onClick={handleSubmitAction} disabled={contactMutation.isPending}>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {contactMutation.isPending ? "Saving..." : "Mark Contacted"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Distribute Dialog */}
        <Dialog open={showDistribute} onOpenChange={(open) => { setShowDistribute(open); if (!open) { setDistributeStep("configure"); setDistributeSelectedIds(new Set()); } }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">Distribute Follow-Ups</DialogTitle>
            </DialogHeader>

            {distributeStep === "configure" ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select group</label>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { value: "overdue-today" as const, label: "Overdue + Today" },
                      { value: "no-date" as const, label: "No follow-up date" },
                      { value: "dormant-warm" as const, label: "Dormant + Warm" },
                    ]).map((opt) => (
                      <Button
                        key={opt.value}
                        variant={distributeFilter === opt.value ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleDistributeFilterChange(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Spread across how many days?
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={distributeDays}
                    onChange={(e) => setDistributeDays(e.target.value)}
                    className="h-9 w-32"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {distributeCandidates.length} customers found · {distributeSelectedIds.size} selected
                    </span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={selectAllCandidates}>Select All</Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={deselectAllCandidates}>Clear</Button>
                    </div>
                  </div>
                  <div className="border border-border rounded-md max-h-48 overflow-y-auto">
                    {distributeCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4 text-center">No customers match this filter</p>
                    ) : (
                      distributeCandidates.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer">
                          <Checkbox
                            checked={distributeSelectedIds.has(c.id)}
                            onCheckedChange={() => toggleDistributeId(c.id)}
                          />
                          <span className="text-sm text-foreground truncate">{c.full_name}</span>
                          {c.activity_status && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium ml-auto shrink-0">
                              {c.activity_status}
                            </span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {distributeSelectedIds.size > 0 && (
                  <div className="bg-muted/50 rounded-md p-3">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{distributeSelectedIds.size}</span> customers will be spread across{" "}
                      <span className="font-semibold">{distributeDays}</span> days = ~<span className="font-semibold">{perDay}</span> per day
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Starting tomorrow</p>
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={distributeSelectedIds.size === 0}
                  onClick={() => setDistributeStep("preview")}
                >
                  Preview Distribution
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-md p-3">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{distributePreview.length}</span> follow-ups across{" "}
                    <span className="font-semibold">{distributeDays}</span> days (~{perDay}/day)
                  </p>
                </div>

                <div className="border border-border rounded-md max-h-60 overflow-y-auto">
                  {distributePreview.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-sm border-b border-border/50 last:border-b-0">
                      <span className="text-foreground truncate">{p.name}</span>
                      <span className="text-muted-foreground text-xs shrink-0 ml-2">
                        {new Date(p.date).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDistributeStep("configure")}>
                    Back
                  </Button>
                  <Button className="flex-1" onClick={() => distributeMutation.mutate()} disabled={distributeMutation.isPending}>
                    {distributeMutation.isPending ? "Distributing..." : "Apply Distribution"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function QuickActions({ item, onAction }: { item: FollowUpItem; onAction: (type: string) => void }) {
  return (
    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
      {item.phone && (
        <>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a href={`tel:${item.phone}`}><Phone className="w-3.5 h-3.5 text-primary" /></a>
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a href={`sms:${item.phone}`}><MessageSquare className="w-3.5 h-3.5 text-primary" /></a>
          </Button>
        </>
      )}
      {item.email && (
        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
          <a href={`mailto:${item.email}`}><Mail className="w-3.5 h-3.5 text-primary" /></a>
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAction("General")}>
        <FileText className="w-3.5 h-3.5 text-primary" />
      </Button>
    </div>
  );
}

function FollowUpSection({
  title, icon: Icon, iconColor, iconBg, items, notesByCustomer, onNavigate, onAction, renderMeta,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  items: FollowUpItem[];
  notesByCustomer: Map<string, CustomerNote>;
  onNavigate: (item: FollowUpItem) => void;
  onAction: (item: FollowUpItem, type?: string) => void;
  renderMeta: (c: FollowUpItem) => React.ReactNode;
}) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-md", iconBg)}>
              <Icon className={cn("w-4 h-4", iconColor)} />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">All caught up! 🎉</p>
        ) : (
          <div className="space-y-1 max-h-[420px] overflow-y-auto">
            {items.map((c) => {
              const lastNote = c.itemType === "customer" ? notesByCustomer.get(c.id) : undefined;
              return (
                <div
                  key={`${c.itemType}-${c.id}`}
                  className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onNavigate(c)}>
                    <p className="text-sm font-medium text-foreground truncate">
                      {c.name}
                      {c.vip === "VIP" && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium align-middle">VIP</span>}
                      {c.itemType === "prospect" && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium align-middle">Prospect</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.itemType === "prospect"
                        ? c.opportunity_status || "Prospect"
                        : lastNote
                          ? `${lastNote.note_type} · ${new Date(lastNote.created_at).toLocaleDateString()} — ${lastNote.note_text}`
                          : c.days_since_last_order !== null
                            ? `${c.days_since_last_order}d since last order`
                            : "No orders yet"}
                    </p>
                  </div>
                  {renderMeta(c)}
                  <QuickActions item={c} onAction={(type) => onAction(c, type)} />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BirthdayRow({ item, label, onNavigate, onAction }: { item: FollowUpItem; label: string; onNavigate: () => void; onAction: (type: string) => void }) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
        <p className="text-sm font-medium text-foreground truncate">
          {item.name}
          {item.vip === "VIP" && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium align-middle">VIP</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          🎂 {item.birthday_mmdd} — <span className="font-medium text-pink-600">{label}</span>
        </p>
      </div>
      <QuickActions item={item} onAction={onAction} />
    </div>
  );
}
