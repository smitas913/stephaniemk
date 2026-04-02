import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProspects, fetchCustomers, createProspect } from "@/lib/queries";
import { OPPORTUNITY_STATUSES } from "@/lib/types";
import type { Prospect } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Plus, Search, UserPlus, Link2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  "New": "bg-blue-100 text-blue-700",
  "Shared": "bg-yellow-100 text-yellow-700",
  "Follow-Up": "bg-orange-100 text-orange-700",
  "Interested": "bg-green-100 text-green-700",
  "Not Interested": "bg-muted text-muted-foreground",
  "Joined": "bg-purple-100 text-purple-700",
};

export default function Prospects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: prospects = [], isLoading } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formStatus, setFormStatus] = useState<string>("New");
  const [formCustomerId, setFormCustomerId] = useState<string>("");

  const filtered = useMemo(() => {
    let list = prospects;
    if (filterStatus !== "all") list = list.filter((p) => p.opportunity_status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.phone?.includes(q) || p.email?.toLowerCase().includes(q));
    }
    return list;
  }, [prospects, filterStatus, search]);

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
      };
      return createProspect(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      setShowAdd(false);
      setFormName(""); setFormPhone(""); setFormEmail(""); setFormStatus("New"); setFormCustomerId("");
      toast.success("Prospect added!");
    },
  });

  // When linking to a customer, prefill name/phone/email
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

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Prospects</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{prospects.length} total</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Prospect</Button>
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search prospects..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
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
            {filtered.map((p) => (
              <Card
                key={p.id}
                className="border-border/50 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => navigate(`/prospects/${p.id}`)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      {p.customer_id && <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[p.phone, p.email].filter(Boolean).join(" · ") || "No contact info"}
                      {p.date_shared && ` · Shared ${formatDateOnly(p.date_shared)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.next_follow_up_date && (
                      <span className={cn("text-[10px] font-medium",
                        new Date(p.next_follow_up_date) < new Date(new Date().toDateString()) ? "text-red-600" : "text-muted-foreground"
                      )}>
                        FU: {new Date(p.next_follow_up_date).toLocaleDateString()}
                      </span>
                    )}
                    <Badge variant="secondary" className={cn("text-[10px] shrink-0", STATUS_COLORS[p.opportunity_status] || "")}>
                      {p.opportunity_status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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
              <Button className="w-full" onClick={() => createMut.mutate()} disabled={!formName.trim() || createMut.isPending}>
                {createMut.isPending ? "Adding..." : "Add Prospect"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
