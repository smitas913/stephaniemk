import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOriginPath } from "@/hooks/usePreviousLocation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCustomer, fetchCustomers, fetchTeamConsultants } from "@/lib/queries";
import { toLocalDateKey } from "@/lib/dateOnly";
import { RELATIONSHIP_STATUSES } from "@/lib/types";
import { stripPhone, normalizeEmail, formatPhone } from "@/lib/phoneUtils";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle, ExternalLink, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import NewCustomerFollowUpDialog from "@/components/NewCustomerFollowUpDialog";
import BeautyProfileFields from "@/components/BeautyProfileFields";
import { cleanBeautyProfile, isBeautyProfileEmpty, type BeautyProfile } from "@/lib/beautyProfile";

export default function AddCustomer() {
  const navigate = useNavigate();
  const originPath = useOriginPath("/customers");
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal, setPostal] = useState("");
  const [birthday, setBirthday] = useState("");
  const [relationship, setRelationship] = useState("Customer");
  const [firstOrderDate, setFirstOrderDate] = useState("");
  const [notes, setNotes] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState(toLocalDateKey());
  const [dateAdded, setDateAdded] = useState(toLocalDateKey());
  const [becameCustomerDate, setBecameCustomerDate] = useState<string>(toLocalDateKey());
  const [assignedConsultantId, setAssignedConsultantId] = useState<string>("__me__");
  const [followUpPrompt, setFollowUpPrompt] = useState<{ id: string; name: string } | null>(null);
  // Beauty Profile — expanded by default so the full card is visible; still collapsible for a quick add.
  const [beautyOpen, setBeautyOpen] = useState(true);
  const [beautyProfile, setBeautyProfile] = useState<BeautyProfile>({});

  // Duplicate-name detection (never blocks creation — informational only)
  const { data: existingCustomers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const nameMatches = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 2) return [];
    return existingCustomers
      .filter((c: any) => (c.full_name || "").toLowerCase().includes(q))
      .slice(0, 5);
  }, [name, existingCustomers]);

  // Hard duplicate match by normalized phone or email — scans BOTH customers and consultants.
  const contactDuplicate = useMemo<{ id: string; name: string; phone: string | null; email: string | null; kind: "customer" | "consultant" } | null>(() => {
    const p = stripPhone(phone);
    const e = normalizeEmail(email);
    if (!p && !e) return null;
    for (const c of existingCustomers as any[]) {
      const cp = stripPhone(c.phone);
      const ce = normalizeEmail(c.email);
      if ((p && p.length >= 7 && cp === p) || (e && ce && ce === e)) {
        return { id: c.id, name: c.full_name, phone: c.phone, email: c.email, kind: "customer" };
      }
    }
    for (const c of consultants as any[]) {
      const cp = stripPhone(c.phone);
      const ce = normalizeEmail(c.email);
      if ((p && p.length >= 7 && cp === p) || (e && ce && ce === e)) {
        return { id: c.id, name: c.name, phone: c.phone, email: c.email, kind: "consultant" };
      }
    }
    return null;
  }, [phone, email, existingCustomers, consultants]);

  const mutation = useMutation({
    mutationFn: () =>
      createCustomer({
        full_name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address_line_1: address1.trim() || null,
        address_line_2: address2.trim() || null,
        city: city.trim() || null,
        state_territory: state.trim() || null,
        postal_code: postal.trim() || null,
        birthday: birthday || null,
        relationship_status: relationship,
        profile_date_first_order_date: firstOrderDate || null,
        notes: notes.trim() || null,
        next_follow_up_date: nextFollowUp || null,
        date_added: dateAdded || toLocalDateKey(),
        assigned_consultant_id: assignedConsultantId === "__me__" ? null : assignedConsultantId,
        beauty_notes: cleanBeautyProfile(beautyProfile),
        became_customer_date:
          relationship === "Customer"
            ? (becameCustomerDate || firstOrderDate || null)
            : null,
      } as any, { allowDuplicate: true }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
      if (relationship === "Customer") {
        // Show 2+2+2 prompt before navigating
        setFollowUpPrompt({ id: data.id, name: name.trim() });
      } else {
        navigate(`/customers/${data.id}`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const hasContact = phone.trim() || email.trim();
  const canSubmit = name.trim() && hasContact && !contactDuplicate && !mutation.isPending;

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(originPath)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Add Customer</h2>
            <p className="text-sm text-muted-foreground">Create a new customer with full details</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name *</label>
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
              {nameMatches.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        {nameMatches.length === 1 ? "1 person" : `${nameMatches.length} people`} with a similar name already exist
                      </p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        Open one of the matches below, or continue to create a new separate record.
                      </p>
                      <div className="mt-2 space-y-1">
                        {nameMatches.map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => navigate(`/customers/${m.id}`)}
                            className="w-full text-left px-2 py-1.5 rounded bg-background hover:bg-muted border border-border flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-foreground truncate">{m.full_name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {[m.phone, m.email].filter(Boolean).join(" · ") || "No contact info"}
                              </div>
                            </div>
                            <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Phone {!email.trim() ? "*" : ""}</label>
                <Input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Email {!phone.trim() ? "*" : ""}</label>
                <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
              </div>
            </div>
            {!hasContact && name.trim() && (
              <p className="text-xs text-destructive">At least one contact method (phone or email) is required.</p>
            )}
            {contactDuplicate && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-destructive">
                      A {contactDuplicate.kind} with this {stripPhone(phone) ? "phone" : "email"} already exists
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(contactDuplicate.kind === "consultant" ? `/leadership` : `/customers/${contactDuplicate.id}`)}
                      className="mt-1 w-full text-left px-2 py-1.5 rounded bg-background hover:bg-muted border border-border flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-foreground truncate">{contactDuplicate.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {[formatPhone(contactDuplicate.phone), contactDuplicate.email].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Address */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Address</label>
              <AddressAutocomplete
                value={address1}
                onChange={setAddress1}
                onAddressSelect={(parsed) => {
                  setAddress1(parsed.street_address);
                  setCity(parsed.city);
                  setState(parsed.state);
                  setPostal(parsed.zip_code);
                }}
                placeholder="Street address"
              />
              <Input placeholder="Apt, Suite, etc. (optional)" value={address2} onChange={(e) => setAddress2(e.target.value)} className="h-10 mt-2" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">City</label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">State</label>
                <Input value={state} onChange={(e) => setState(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Zip</label>
                <Input value={postal} onChange={(e) => setPostal(e.target.value)} className="h-10" />
              </div>
            </div>

            {/* Birthday & Relationship */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <BirthdayInput value={birthday} onChange={setBirthday} />
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Relationship</label>
                <Select value={relationship} onValueChange={setRelationship}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* First Order & Follow-Up */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">First Order Date</label>
                <Input type="date" value={firstOrderDate} onChange={(e) => setFirstOrderDate(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Next Follow-Up</label>
                <Input type="date" value={nextFollowUp} min={toLocalDateKey()} onChange={(e) => setNextFollowUp(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Date Added</label>
                <Input type="date" value={dateAdded} onChange={(e) => setDateAdded(e.target.value)} className="h-10" />
                <p className="text-xs text-muted-foreground mt-1">Defaults to today. Adjust if backdating.</p>
              </div>
              {relationship === "Customer" && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Became Customer Date</label>
                  <Input type="date" value={becameCustomerDate} onChange={(e) => setBecameCustomerDate(e.target.value)} className="h-10" />
                  <p className="text-xs text-muted-foreground mt-1">When they became a customer.</p>
                </div>
              )}
            </div>

            {/* Assigned Consultant */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Assigned To</label>
              <Select value={assignedConsultantId} onValueChange={setAssignedConsultantId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__me__">Me (director)</SelectItem>
                  {(consultants as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Who owns this customer relationship.</p>
            </div>

            {/* Beauty Profile — collapsible */}
            <div className="rounded-lg border border-border/60">
              <button
                type="button"
                onClick={() => setBeautyOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors rounded-lg"
              >
                {beautyOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Add Beauty Profile info</span>
                {!beautyOpen && !isBeautyProfileEmpty(beautyProfile) && (
                  <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">filled in</span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">Optional</span>
              </button>
              {beautyOpen && (
                <div className="px-3 pb-4 pt-1 border-t border-border/60">
                  <p className="text-xs text-muted-foreground mb-3">
                    Matches the printed Beauty Profile card — fill in whatever you have.
                  </p>
                  <BeautyProfileFields value={beautyProfile} onChange={setBeautyProfile} />
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Notes</label>
              <Textarea placeholder="Any notes about this customer..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px]" />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button className="h-11 px-8" disabled={!canSubmit} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Creating..." : "Create Customer"}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => navigate(originPath)}>Cancel</Button>
            </div>
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