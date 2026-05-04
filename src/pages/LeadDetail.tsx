import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBookingLead,
  updateBookingLead,
  fetchAllLatestNotes,
  convertBookingLeadToCustomer,
  fetchEvents,
} from "@/lib/queries";
import { BOOKING_LEAD_STATUSES, BOOKING_LEAD_SOURCES } from "@/lib/types";
import type { BookingLead } from "@/lib/types";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import { openEmail } from "@/lib/emailPreference";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Phone, MessageSquare, Mail, MapPin, Calendar,
  Pencil, UserCheck, Save, X, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import TextActionButton from "@/components/TextActionButton";
import NewCustomerFollowUpDialog from "@/components/NewCustomerFollowUpDialog";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Working: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Working: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  Booked: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "Not Interested": "bg-muted text-muted-foreground",
};

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const backTo = (location.state as any)?.from || "/clients?tab=leads";

  const { data: lead, isLoading } = useQuery({
    queryKey: ["booking-lead", id],
    queryFn: () => fetchBookingLead(id!),
    enabled: !!id,
  });

  const { data: allNotes = [] } = useQuery({
    queryKey: ["unified-notes"],
    queryFn: fetchAllLatestNotes,
  });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });

  const leadNotes = useMemo(
    () =>
      (allNotes as any[])
        .filter((n) => n.entity_type === "Lead" && n.person_id === id)
        .sort((a, b) => {
          const aKey = a.created_at || a.note_date || "";
          const bKey = b.created_at || b.note_date || "";
          return bKey.localeCompare(aKey);
        }),
    [allNotes, id]
  );

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", lead_source: "",
    address_line_1: "", city: "", state_territory: "", postal_code: "",
    notes: "", next_follow_up_date: "",
  });

  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name,
        phone: lead.phone || "",
        email: lead.email || "",
        lead_source: lead.lead_source || "",
        address_line_1: (lead as any).address_line_1 || "",
        city: (lead as any).city || "",
        state_territory: (lead as any).state_territory || "",
        postal_code: (lead as any).postal_code || "",
        notes: lead.notes || "",
        next_follow_up_date: lead.next_follow_up_date || "",
      });
    }
  }, [lead]);

  const updateMut = useMutation({
    mutationFn: (updates: Partial<BookingLead>) => updateBookingLead(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-lead", id] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      toast.success("Lead updated");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (status: string) => updateBookingLead(id!, { status } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-lead", id] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      toast.success("Status updated");
    },
  });

  const [followUpPrompt, setFollowUpPrompt] = useState<{ id: string; name: string } | null>(null);

  const convertMut = useMutation({
    mutationFn: () => convertBookingLeadToCustomer(lead!, events.map((e) => e.event_id)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Lead converted to customer");
      if (result.customer?.id) {
        setFollowUpPrompt({ id: result.customer.id, name: lead?.name || "" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    updateMut.mutate({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      lead_source: form.lead_source || null,
      address_line_1: form.address_line_1.trim() || null,
      city: form.city.trim() || null,
      state_territory: form.state_territory.trim() || null,
      postal_code: form.postal_code.trim() || null,
      notes: form.notes.trim() || null,
      next_follow_up_date: form.next_follow_up_date || null,
    } as any);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!lead) {
    return (
      <Layout>
        <p className="text-muted-foreground text-center py-12">Lead not found.</p>
      </Layout>
    );
  }

  const fullAddress = [lead.address_line_1, lead.city, lead.state_territory, lead.postal_code]
    .filter(Boolean)
    .join(", ");

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate(backTo)} className="-ml-2 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                {lead.name}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge className={cn("text-[11px]", STATUS_COLORS[lead.status] || "")}>{lead.status}</Badge>
                {lead.lead_source && (
                  <span className="text-xs text-muted-foreground">· {lead.lead_source}</span>
                )}
                {lead.converted_customer_id && (
                  <Badge variant="secondary" className="text-[11px]">Converted</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {editing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={updateMut.isPending || !form.name.trim()}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            )}
          </div>
        </div>

        {/* Quick contact actions */}
        {!editing && (lead.phone || lead.email) && (
          <div className="flex flex-wrap gap-2">
            {lead.phone && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${phoneForLink(lead.phone)}`}><Phone className="w-3.5 h-3.5 mr-1" />Call</a>
                </Button>
                <TextActionButton phone={lead.phone} trigger="labeled" />
              </>
            )}
            {lead.email && (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${lead.email}`} onClick={(e) => openEmail(lead.email!, e)}>
                  <Mail className="w-3.5 h-3.5 mr-1" />Email
                </a>
              </Button>
            )}
          </div>
        )}

        {/* Contact info card */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Contact Info</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-9" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                    <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Lead Source</label>
                  <Select value={form.lead_source} onValueChange={(v) => setForm({ ...form, lead_source: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {BOOKING_LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Address
                  </label>
                  <AddressAutocomplete
                    value={form.address_line_1}
                    onChange={(v) => setForm({ ...form, address_line_1: v })}
                    onAddressSelect={(p) => setForm({ ...form, address_line_1: p.street_address, city: p.city, state_territory: p.state, postal_code: p.zip_code })}
                    placeholder="Street address"
                    className="h-9 mb-2"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="h-9" />
                    <Input value={form.state_territory} onChange={(e) => setForm({ ...form, state_territory: e.target.value })} placeholder="State" className="h-9" />
                    <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder="Zip" className="h-9" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Used for sending samples and mailing catalogs.</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Next Follow-Up</label>
                  <Input
                    type="date"
                    value={form.next_follow_up_date}
                    onChange={(e) => setForm({ ...form, next_follow_up_date: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="min-h-[80px]"
                  />
                </div>
              </>
            ) : (
              <dl className="text-sm space-y-2">
                <Row icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={lead.phone ? formatPhone(lead.phone) : "—"} />
                <Row icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={lead.email || "—"} />
                <Row icon={<MapPin className="w-3.5 h-3.5" />} label="Address" value={fullAddress ? (<a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{fullAddress}</a>) : "—"} />
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Status / Follow-up */}
        {!editing && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Status & Follow-Up</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Status:</span>
                <Select value={lead.status} onValueChange={(v) => statusMut.mutate(v)}>
                  <SelectTrigger className="h-8 w-auto min-w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOKING_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Row
                icon={<Calendar className="w-3.5 h-3.5" />}
                label="Next Follow-Up"
                value={lead.next_follow_up_date ? formatDateOnly(lead.next_follow_up_date, "EEE, MMM d, yyyy") : "—"}
              />
              <Row
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Last Contact"
                value={lead.last_contact_date ? formatDateOnly(lead.last_contact_date, "MMM d, yyyy") : "—"}
              />
              {!lead.converted_customer_id && (
                <div className="pt-2 border-t border-border/40">
                  <Button size="sm" variant="outline" onClick={() => convertMut.mutate()} disabled={convertMut.isPending}>
                    <UserCheck className="w-3.5 h-3.5 mr-1" />
                    {convertMut.isPending ? "Converting…" : "Convert to Customer"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Activity History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activity History</CardTitle>
          </CardHeader>
          <CardContent>
            {leadNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No activity logged yet.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {leadNotes.map((n: any, idx: number) => (
                  <li key={n.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground">{n.note_type || "Note"}</span>
                        {idx === 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold uppercase tracking-wide">Latest</span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateOnly(n.note_date || n.created_at, "MMM d, yyyy")}
                      </span>
                    </div>
                    {n.note_body && (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{n.note_body}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <NewCustomerFollowUpDialog
        customerId={followUpPrompt?.id ?? null}
        customerName={followUpPrompt?.name ?? ""}
        open={!!followUpPrompt}
        onClose={() => {
          const id = followUpPrompt?.id;
          setFollowUpPrompt(null);
          if (id) navigate(`/customers/${id}`);
        }}
      />
    </Layout>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="text-sm text-foreground break-words">{value}</dd>
      </div>
    </div>
  );
}
