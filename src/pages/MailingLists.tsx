import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers } from "@/lib/queries";
import type { Customer } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { Download, Mail, Printer, Users, MapPin } from "lucide-react";
import { MONTHS } from "@/hooks/usePeriodFilter";

const CAMPAIGN_TYPES = ["Spring", "Summer", "Fall", "Winter", "Holiday"] as const;

type ListMode = "birthday" | "campaign" | "all-with-address";

interface MailingRecord {
  id: string;
  full_name: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_territory: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  tag?: string;
}

export default function MailingLists() {
  const [mode, setMode] = useState<ListMode>("birthday");
  const [birthdayMonth, setBirthdayMonth] = useState<number>(new Date().getMonth());
  const [campaignType, setCampaignType] = useState<string>("Spring");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [addressOnly, setAddressOnly] = useState(true);
  const [showExtra, setShowExtra] = useState(false);

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["catalog-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_campaigns" as any)
        .select("*")
        .order("mailing_date", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: campaignCustomerIds = [] } = useQuery({
    queryKey: ["campaign-customer-ids", campaignId, campaignType],
    queryFn: async () => {
      if (mode !== "campaign") return [];
      let query = supabase.from("catalog_campaign_customers" as any).select("customer_id, campaign_id");
      if (campaignId !== "all") {
        query = query.eq("campaign_id", campaignId);
      }
      const { data, error } = await query;
      if (error) throw error;

      if (campaignId === "all") {
        const campaignIds = new Set(
          campaigns.filter((c: any) => c.campaign_type === campaignType).map((c: any) => c.id)
        );
        return (data as any[]).filter((r: any) => campaignIds.has(r.campaign_id)).map((r: any) => r.customer_id);
      }
      return (data as any[]).map((r: any) => r.customer_id);
    },
    enabled: mode === "campaign",
  });

  const filteredCampaigns = useMemo(
    () => campaigns.filter((c: any) => c.campaign_type === campaignType),
    [campaigns, campaignType]
  );

  const records: MailingRecord[] = useMemo(() => {
    let list: Customer[] = [];

    if (mode === "birthday") {
      const mm = String(birthdayMonth + 1).padStart(2, "0");
      list = customers.filter((c) => c.is_active && c.birthday_mmdd?.startsWith(mm));
    } else if (mode === "campaign") {
      const idSet = new Set(campaignCustomerIds);
      list = customers.filter((c) => idSet.has(c.id));
    } else {
      list = customers.filter((c) => c.is_active);
    }

    if (addressOnly) {
      list = list.filter((c) =>
        c.address_line_1?.trim() &&
        c.city?.trim() &&
        c.state_territory?.trim() &&
        c.postal_code?.trim()
      );
    }

    return list
      .map((c) => ({
        id: c.id,
        full_name: c.full_name,
        address_line_1: c.address_line_1,
        address_line_2: c.address_line_2,
        city: c.city,
        state_territory: c.state_territory,
        postal_code: c.postal_code,
        phone: c.phone,
        email: c.email,
        tag: mode === "birthday" ? `${MONTHS[birthdayMonth]} Birthday` : mode === "campaign" ? `${campaignType} Catalog` : undefined,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [customers, mode, birthdayMonth, campaignCustomerIds, campaignType, addressOnly]);

  const exportCsv = () => {
    if (records.length === 0) return toast.error("No records to export");
    const headers = ["Full Name", "Address Line 1", "Address Line 2", "City", "State", "ZIP"];
    if (showExtra) headers.push("Phone", "Email");
    const rows = records.map((r) => {
      const row = [r.full_name, r.address_line_1 || "", r.address_line_2 || "", r.city || "", r.state_territory || "", r.postal_code || ""];
      if (showExtra) row.push(r.phone || "", r.email || "");
      return row.map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mailing-list-${mode}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${records.length} records`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Layout>
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Mailing Lists</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Generate label-ready mailing lists</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="w-4 h-4" />Print
            </Button>
            <Button size="sm" className="gap-1.5" onClick={exportCsv}>
              <Download className="w-4 h-4" />Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">List Type</label>
                <Select value={mode} onValueChange={(v) => setMode(v as ListMode)}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="birthday">Birthday Mailing</SelectItem>
                    <SelectItem value="campaign">Catalog Campaign</SelectItem>
                    <SelectItem value="all-with-address">All Customers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === "birthday" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Month</label>
                  <Select value={String(birthdayMonth)} onValueChange={(v) => setBirthdayMonth(Number(v))}>
                    <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {mode === "campaign" && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Campaign Type</label>
                    <Select value={campaignType} onValueChange={(v) => { setCampaignType(v); setCampaignId("all"); }}>
                      <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Specific Mailing</label>
                    <Select value={campaignId} onValueChange={setCampaignId}>
                      <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {campaignType} Mailings</SelectItem>
                        {filteredCampaigns.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {format(new Date(c.mailing_date + "T00:00:00"), "MMM d, yyyy")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <label className="text-xs text-muted-foreground">Complete address</label>
                <Switch checked={addressOnly} onCheckedChange={setAddressOnly} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Phone/Email</label>
                <Switch checked={showExtra} onCheckedChange={setShowExtra} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1">
            <Users className="w-3 h-3" />{records.length} record{records.length !== 1 ? "s" : ""}
          </Badge>
          {records[0]?.tag && <Badge variant="outline" className="text-xs">{records[0].tag}</Badge>}
          {addressOnly && (
            <Badge variant="outline" className="text-xs gap-1">
              <MapPin className="w-3 h-3" />Complete address
            </Badge>
          )}
        </div>

        {/* Table */}
        {records.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Mail className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No matching records</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {addressOnly ? "Try turning off the 'Address only' filter" : "Adjust your filters to find customers"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="print:shadow-none">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="w-[120px]">City</TableHead>
                  <TableHead className="w-[60px]">State</TableHead>
                  <TableHead className="w-[80px]">ZIP</TableHead>
                  {showExtra && <TableHead className="w-[120px]">Phone</TableHead>}
                  {showExtra && <TableHead className="w-[160px]">Email</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">{r.full_name}</TableCell>
                    <TableCell className="text-sm">
                      {r.address_line_1 || "—"}
                      {r.address_line_2 && <span className="text-muted-foreground"> {r.address_line_2}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{r.city || "—"}</TableCell>
                    <TableCell className="text-sm">{r.state_territory || "—"}</TableCell>
                    <TableCell className="text-sm">{r.postal_code || "—"}</TableCell>
                    {showExtra && <TableCell className="text-sm">{r.phone || "—"}</TableCell>}
                    {showExtra && <TableCell className="text-sm">{r.email || "—"}</TableCell>}
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
