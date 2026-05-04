import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTeamConsultant, fetchTeamConsultants } from "@/lib/queries";
import { toLocalDateKey } from "@/lib/dateOnly";
import { ONBOARDING_STAGES, COACHING_FOCUS_OPTIONS, FOCUS_GROUPS } from "@/lib/types";
import { stripPhone, normalizeEmail, formatPhone } from "@/lib/phoneUtils";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";

export default function AddConsultant() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consultantId, setConsultantId] = useState("");
  const [joinDate, setJoinDate] = useState(toLocalDateKey());
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal, setPostal] = useState("");
  const [birthday, setBirthday] = useState("");
  const [onboardingStage, setOnboardingStage] = useState("New");
  const [coachingFocus, setCoachingFocus] = useState("");
  const [focusGroup, setFocusGroup] = useState("New Consultant");
  const [nextCoachingDate, setNextCoachingDate] = useState("");
  const [notes, setNotes] = useState("");

  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

  const mutation = useMutation({
    mutationFn: () =>
      createTeamConsultant({
        name: fullName,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        consultant_id: consultantId.trim() || null,
        join_date: joinDate || null,
        address_line_1: address1.trim() || null,
        city: city.trim() || null,
        state_territory: state.trim() || null,
        postal_code: postal.trim() || null,
        birthday: birthday || null,
        onboarding_stage: onboardingStage,
        coaching_focus: coachingFocus || null,
        focus_group: focusGroup,
        next_coaching_date: nextCoachingDate || null,
        notes: notes.trim() || null,
        status: "Active",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      toast.success("Consultant added");
      navigate("/leadership");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: existingConsultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const contactDuplicate = useMemo(() => {
    const p = stripPhone(phone);
    const e = normalizeEmail(email);
    if (!p && !e) return null;
    return existingConsultants.find((c: any) => {
      const cp = stripPhone(c.phone);
      const ce = normalizeEmail(c.email);
      if (p && p.length >= 7 && cp === p) return true;
      if (e && ce && ce === e) return true;
      return false;
    }) || null;
  }, [phone, email, existingConsultants]);

  const hasContact = phone.trim() || email.trim();
  const canSubmit = fullName && hasContact && !contactDuplicate && !mutation.isPending;

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/leadership")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Add Consultant</h2>
            <p className="text-sm text-muted-foreground">Add a new team member with full details</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6 space-y-5">
            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">First Name *</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Last Name *</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-10" />
              </div>
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
            {!hasContact && fullName && (
              <p className="text-xs text-destructive">At least one contact method (phone or email) is required.</p>
            )}

            {/* Consultant ID & Join Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Consultant ID</label>
                <Input placeholder="Optional" value={consultantId} onChange={(e) => setConsultantId(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Join Date</label>
                <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className="h-10" />
              </div>
            </div>

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

            {/* Birthday */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Birthday</label>
              <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="h-10 max-w-xs" />
            </div>

            {/* Coaching */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Growth Stage</label>
                <Select value={onboardingStage} onValueChange={setOnboardingStage}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ONBOARDING_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Focus Group</label>
                <Select value={focusGroup} onValueChange={setFocusGroup}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FOCUS_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Coaching Focus</label>
                <Select value={coachingFocus} onValueChange={setCoachingFocus}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {COACHING_FOCUS_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Next Coaching Date</label>
              <Input type="date" value={nextCoachingDate} min={toLocalDateKey()} onChange={(e) => setNextCoachingDate(e.target.value)} className="h-10 max-w-xs" />
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Notes</label>
              <Textarea placeholder="Any notes about this consultant..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px]" />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button className="h-11 px-8" disabled={!canSubmit} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Adding..." : "Add Consultant"}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => navigate("/leadership")}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}