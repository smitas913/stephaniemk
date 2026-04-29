import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers } from "@/lib/queries";
import type { Customer } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { Plus, BookOpen, CalendarDays, Users, Upload, Search, ChevronRight, Trash2, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";

const CAMPAIGN_TYPES = ["Spring", "Summer", "Fall", "Winter", "Holiday"] as const;
type CampaignType = typeof CAMPAIGN_TYPES[number];

const CAMPAIGN_COLORS: Record<string, string> = {
  Spring: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  Summer: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Fall: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  Winter: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Holiday: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

interface Campaign {
  id: string;
  campaign_type: string;
  mailing_date: string;
  notes: string | null;
  created_at: string;
  customer_count?: number;
  completed_count?: number;
}

interface CampaignCustomer {
  id: string;
  campaign_id: string;
  customer_id: string;
  follow_up_date: string | null;
  follow_up_completed: boolean;
  customers?: { full_name: string; phone: string | null; email: string | null } | null;
}

// ─── Queries ───

async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("catalog_campaigns" as any)
    .select("*")
    .order("mailing_date", { ascending: false });
  if (error) throw error;
  const campaigns = (data as any[]) || [];

  // Get counts per campaign
  const { data: counts, error: cErr } = await supabase
    .from("catalog_campaign_customers" as any)
    .select("campaign_id, follow_up_completed");
  if (cErr) throw cErr;

  const countMap = new Map<string, { total: number; completed: number }>();
  for (const row of (counts as any[]) || []) {
    const entry = countMap.get(row.campaign_id) || { total: 0, completed: 0 };
    entry.total++;
    if (row.follow_up_completed) entry.completed++;
    countMap.set(row.campaign_id, entry);
  }

  return campaigns.map((c: any) => ({
    ...c,
    customer_count: countMap.get(c.id)?.total || 0,
    completed_count: countMap.get(c.id)?.completed || 0,
  }));
}

async function fetchCampaignCustomers(campaignId: string): Promise<CampaignCustomer[]> {
  const { data, error } = await supabase
    .from("catalog_campaign_customers" as any)
    .select("*, customers(full_name, phone, email)")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as any[]) || [];
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ─── Page ───

export default function Campaigns() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null);
  const [showAddCustomers, setShowAddCustomers] = useState(false);

  // Create form state
  const [newType, setNewType] = useState<CampaignType>("Spring");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newNotes, setNewNotes] = useState("");

  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ["catalog-campaigns"], queryFn: fetchCampaigns });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const filtered = useMemo(() => {
    if (filterType === "all") return campaigns;
    return campaigns.filter((c) => c.campaign_type === filterType);
  }, [campaigns, filterType]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("catalog_campaigns" as any).insert({
        campaign_type: newType,
        mailing_date: newDate,
        notes: newNotes.trim() || null,
        owner_user_id: userId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog-campaigns"] });
      setShowCreate(false);
      setNewNotes("");
      toast.success("Campaign created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_campaigns" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog-campaigns"] });
      setDetailCampaign(null);
      toast.success("Campaign deleted");
    },
  });

  return (
    <Layout>
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Catalog Campaigns</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</p>
          </div>
          <Button className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />New Campaign
          </Button>
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-1.5">
          <Button variant={filterType === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilterType("all")}>All</Button>
          {CAMPAIGN_TYPES.map((t) => (
            <Button key={t} variant={filterType === t ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilterType(t)}>{t}</Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No campaigns yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Create your first catalog campaign to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((campaign) => (
              <Card key={campaign.id} className="cursor-pointer hover:shadow-md transition-shadow border-border/50" onClick={() => setDetailCampaign(campaign)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={cn("text-xs", CAMPAIGN_COLORS[campaign.campaign_type] || "bg-accent text-accent-foreground")}>
                      {campaign.campaign_type}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                      Mailed {format(new Date(campaign.mailing_date + "T00:00:00"), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Users className="w-3 h-3" />
                      {campaign.customer_count} customer{campaign.customer_count !== 1 ? "s" : ""}
                      {(campaign.customer_count ?? 0) > 0 && (
                        <span className="text-primary font-medium">
                          · {campaign.completed_count}/{campaign.customer_count} followed up
                        </span>
                      )}
                    </p>
                    {campaign.notes && <p className="text-xs text-muted-foreground truncate">{campaign.notes}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Catalog Campaign</DialogTitle>
              <DialogDescription>Select a campaign type and mailing date. Follow-ups will be auto-created for attached customers.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Campaign Type *</label>
                <Select value={newType} onValueChange={(v) => setNewType(v as CampaignType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Mailing Date *</label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
                <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Campaign notes..." className="min-h-[60px]" />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !newDate}>
                {createMutation.isPending ? "Creating..." : "Create Campaign"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Detail Sheet */}
        {detailCampaign && (
          <CampaignDetailSheet
            campaign={detailCampaign}
            customers={customers}
            onClose={() => setDetailCampaign(null)}
            onDelete={() => deleteMutation.mutate(detailCampaign.id)}
            queryClient={queryClient}
          />
        )}
      </div>
    </Layout>
  );
}

// ─── Campaign Detail Sheet ───

function CampaignDetailSheet({
  campaign, customers, onClose, onDelete, queryClient,
}: {
  campaign: Campaign;
  customers: Customer[];
  onClose: () => void;
  onDelete: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [showAddCustomers, setShowAddCustomers] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [csvMode, setCsvMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: campaignCustomers = [], isLoading } = useQuery({
    queryKey: ["campaign-customers", campaign.id],
    queryFn: () => fetchCampaignCustomers(campaign.id),
  });

  const existingCustomerIds = useMemo(() => new Set(campaignCustomers.map((cc) => cc.customer_id)), [campaignCustomers]);

  const availableCustomers = useMemo(() => {
    return customers
      .filter((c) => c.is_active && !existingCustomerIds.has(c.id))
      .filter((c) => !search || c.full_name.toLowerCase().includes(search.toLowerCase()));
  }, [customers, existingCustomerIds, search]);

  const followUpDate = format(addDays(new Date(campaign.mailing_date + "T00:00:00"), 6), "yyyy-MM-dd");

  const addCustomersMutation = useMutation({
    mutationFn: async (customerIds: string[]) => {
      const rows = customerIds.map((customer_id) => ({
        campaign_id: campaign.id,
        customer_id,
        follow_up_date: followUpDate,
      }));
      const { error } = await supabase.from("catalog_campaign_customers" as any).insert(rows as any);
      if (error) throw error;

      // Log "Catalog Sent" note + schedule follow-up for each (sooner-priority preserved)
      const { logCatalogSent } = await import("@/lib/catalogTracking");
      for (const cid of customerIds) {
        try {
          await logCatalogSent({
            customerId: cid,
            campaignType: campaign.campaign_type,
            mailingDate: campaign.mailing_date,
            campaignId: campaign.id,
            scheduleFollowUp: true,
          });
        } catch (e) {
          console.error("logCatalogSent failed", cid, e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-customers", campaign.id] });
      queryClient.invalidateQueries({ queryKey: ["catalog-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      setShowAddCustomers(false);
      setSelectedIds(new Set());
      setSearch("");
      toast.success("Catalog sent — follow-ups scheduled & activity logged");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from("catalog_campaign_customers" as any).update({ follow_up_completed: completed } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-customers", campaign.id] });
      queryClient.invalidateQueries({ queryKey: ["catalog-campaigns"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog_campaign_customers" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-customers", campaign.id] });
      queryClient.invalidateQueries({ queryKey: ["catalog-campaigns"] });
      toast.success("Removed");
    },
  });

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const names = new Set<string>();
        for (const row of results.data as Record<string, string>[]) {
          const name = (row["full_name"] || row["Full Name"] || row["name"] || row["Name"] || "").trim().toLowerCase();
          if (name) names.add(name);
        }
        // Match against existing customers
        const matched = new Set<string>();
        for (const c of customers) {
          if (names.has(c.full_name.toLowerCase()) && !existingCustomerIds.has(c.id)) {
            matched.add(c.id);
          }
        }
        setSelectedIds(matched);
        toast.success(`Matched ${matched.size} of ${names.size} names from CSV`);
        if (fileRef.current) fileRef.current.value = "";
      },
    });
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const completedCount = campaignCustomers.filter((cc) => cc.follow_up_completed).length;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg flex items-center gap-2">
              <Badge className={cn("text-xs", CAMPAIGN_COLORS[campaign.campaign_type])}>{campaign.campaign_type}</Badge>
              Catalog Campaign
            </SheetTitle>
          </div>
          <SheetDescription>
            Mailed {format(new Date(campaign.mailing_date + "T00:00:00"), "MMMM d, yyyy")}
            {" · "}{campaignCustomers.length} customer{campaignCustomers.length !== 1 ? "s" : ""}
            {" · "}{completedCount} followed up
          </SheetDescription>
          {campaign.notes && <p className="text-xs text-muted-foreground mt-1">{campaign.notes}</p>}
          <p className="text-xs text-primary font-medium mt-1">
            Follow-ups scheduled for {format(new Date(followUpDate + "T00:00:00"), "MMM d, yyyy")} (6 days after mailing)
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Customers ({campaignCustomers.length})</h3>
              <Button size="sm" className="gap-1 text-xs" onClick={() => setShowAddCustomers(true)}>
                <Plus className="w-3 h-3" />Add Customers
              </Button>
            </div>

            {campaignCustomers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No customers attached yet</p>
                <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={() => setShowAddCustomers(true)}>
                  <Plus className="w-3 h-3" />Add Customers
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {campaignCustomers.map((cc) => (
                  <div key={cc.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 group">
                    <Checkbox
                      checked={cc.follow_up_completed}
                      onCheckedChange={(checked) => toggleCompleteMutation.mutate({ id: cc.id, completed: !!checked })}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium truncate", cc.follow_up_completed && "line-through text-muted-foreground")}>
                        {(cc.customers as any)?.full_name || "Unknown"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Follow-up: {cc.follow_up_date ? format(new Date(cc.follow_up_date + "T00:00:00"), "MMM d") : "—"}
                        {cc.follow_up_completed && " ✓"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeMutation.mutate(cc.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delete Campaign */}
          <div className="mt-8 pt-4 border-t border-border">
            <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>Delete Campaign</Button>
          </div>
        </ScrollArea>

        {/* Add Customers Dialog */}
        <Dialog open={showAddCustomers} onOpenChange={setShowAddCustomers}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Add Customers to Campaign</DialogTitle>
              <DialogDescription>Select customers manually or upload a CSV with a "full_name" or "Name" column.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
              <div className="flex gap-2">
                <Button variant={csvMode ? "outline" : "default"} size="sm" className="text-xs" onClick={() => setCsvMode(false)}>Select Manually</Button>
                <Button variant={csvMode ? "default" : "outline"} size="sm" className="text-xs gap-1" onClick={() => setCsvMode(true)}>
                  <Upload className="w-3 h-3" />Upload CSV
                </Button>
              </div>

              {csvMode && (
                <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
                  <p className="text-xs text-muted-foreground">Upload a CSV with customer names. The system will match against existing customers.</p>
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvUpload} className="text-xs" />
                  {selectedIds.size > 0 && (
                    <p className="text-xs text-primary font-medium">{selectedIds.size} customer{selectedIds.size !== 1 ? "s" : ""} matched</p>
                  )}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{availableCustomers.length} available · {selectedIds.size} selected</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setSelectedIds(new Set(availableCustomers.map((c) => c.id)))}>All</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setSelectedIds(new Set())}>None</Button>
                </div>
              </div>

              <div className="border border-border rounded-md flex-1 overflow-y-auto max-h-60">
                {availableCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">No matching customers</p>
                ) : availableCustomers.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <span className="text-sm text-foreground truncate">{c.full_name}</span>
                  </label>
                ))}
              </div>

              <Button className="w-full" disabled={selectedIds.size === 0 || addCustomersMutation.isPending} onClick={() => addCustomersMutation.mutate([...selectedIds])}>
                {addCustomersMutation.isPending ? "Adding..." : `Add ${selectedIds.size} Customer${selectedIds.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}