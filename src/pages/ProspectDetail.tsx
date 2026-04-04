import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProspect, updateProspect, deleteProspect, fetchProspectNotes, createProspectNote, deleteProspectNote, convertProspectToConsultant } from "@/lib/queries";
import { OPPORTUNITY_STATUSES, NEXT_STEP_TYPES, COACHING_FOCUS_OPTIONS } from "@/lib/types";
import type { ProspectNote } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Trash2, Phone, MessageSquare, Mail, FileText, CheckCircle2, UserCheck, CalendarDays } from "lucide-react";
import { formatPhone, phoneForLink } from "@/lib/phoneUtils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { formatDateOnly, compareDateOnly, toLocalDateKey } from "@/lib/dateOnly";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const STATUS_COLORS: Record<string, string> = {
  "Booked": "bg-blue-100 text-blue-700",
  "Shared": "bg-yellow-100 text-yellow-700",
  "Follow-Up": "bg-orange-100 text-orange-700",
  "Interested": "bg-green-100 text-green-700",
  "Not Interested": "bg-muted text-muted-foreground",
  "Joined": "bg-purple-100 text-purple-700",
  "Converted": "bg-emerald-100 text-emerald-700",
  "Closed": "bg-muted text-muted-foreground",
};

export default function ProspectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: prospect } = useQuery({ queryKey: ["prospect", id], queryFn: () => fetchProspect(id!) });
  const { data: notes = [] } = useQuery({ queryKey: ["prospect-notes", id], queryFn: () => fetchProspectNotes(id!) });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [noteText, setNoteText] = useState("");
  const [showConvert, setShowConvert] = useState(false);
  const [convertCoachingDate, setConvertCoachingDate] = useState("");
  const [convertCoachingFocus, setConvertCoachingFocus] = useState("");

  useEffect(() => {
    if (prospect) {
      setForm({
        name: prospect.name || "",
        phone: prospect.phone || "",
        email: prospect.email || "",
        opportunity_status: prospect.opportunity_status || "Shared",
        date_shared: prospect.date_shared || "",
        last_contact_date: prospect.last_contact_date || "",
        next_follow_up_date: prospect.next_follow_up_date || "",
        notes: prospect.notes || "",
        next_step_type: prospect.next_step_type || "",
        next_step_date: prospect.next_step_date || "",
        next_step_notes: prospect.next_step_notes || "",
      });
    }
  }, [prospect]);

  const updateMut = useMutation({
    mutationFn: (data: Record<string, string>) => {
      const cleaned: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(data)) cleaned[k] = v === "" ? null : v;
      if (cleaned.name === null) cleaned.name = prospect!.name;
      return updateProspect(id!, cleaned as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", id] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      setEditing(false);
      toast.success("Prospect updated!");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteProspect(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      navigate("/prospects");
      toast.success("Prospect deleted");
    },
  });

  const addNoteMut = useMutation({
    mutationFn: (text: string) => createProspectNote({ prospect_id: id!, note_text: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect-notes", id] });
      setNoteText("");
      toast.success("Note added");
    },
  });

  const deleteNoteMut = useMutation({
    mutationFn: deleteProspectNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect-notes", id] });
      toast.success("Note deleted");
    },
  });

  const convertMut = useMutation({
    mutationFn: async () => {
      if (!prospect) throw new Error("No prospect");
      await convertProspectToConsultant(prospect, {
        next_coaching_date: convertCoachingDate || null,
        coaching_focus: convertCoachingFocus || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", id] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      setShowConvert(false);
      setConvertCoachingDate("");
      setConvertCoachingFocus("");
      toast.success("Prospect converted! A new consultant record has been created.");
    },
  });

  const markContacted = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      await updateProspect(id!, { last_contact_date: today } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", id] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      toast.success("Marked as contacted");
    },
  });

  if (!prospect) return <Layout><p className="text-muted-foreground text-center py-12">Loading...</p></Layout>;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => navigate("/prospects")}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-foreground truncate">{prospect.name}</h2>
            <div className="flex gap-2 mt-0.5">
              <Badge variant="secondary" className={cn("text-[11px]", STATUS_COLORS[prospect.opportunity_status] || "")}>
                {prospect.opportunity_status}
              </Badge>
              {prospect.customer_id && <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">Linked Customer</span>}
            </div>
          </div>
          <div className="flex gap-1">
            {prospect.phone && (
              <>
                <Button size="sm" variant="outline" asChild title="Call"><a href={`tel:${phoneForLink(prospect.phone)}`}><Phone className="w-4 h-4" /></a></Button>
                <Button size="sm" variant="outline" asChild title="Text"><a href={`sms:${phoneForLink(prospect.phone)}`}><MessageSquare className="w-4 h-4" /></a></Button>
              </>
            )}
            {prospect.email && (
              <Button size="sm" variant="outline" asChild title="Email"><a href={`mailto:${prospect.email}`}><Mail className="w-4 h-4" /></a></Button>
            )}
            <Button size="sm" variant="outline" onClick={() => markContacted.mutate()} disabled={markContacted.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-1" />Contacted
            </Button>
          </div>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{prospect.opportunity_status}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Status</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{formatDateOnly(prospect.date_shared)}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Date Shared</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{formatDateOnly(prospect.last_contact_date)}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Last Contact</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className={cn("text-lg font-bold",
                prospect.next_step_date && compareDateOnly(prospect.next_step_date) === -1 ? "text-destructive" : "text-foreground"
              )}>
                {formatDateOnly(prospect.next_step_date)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Next Step Date</p>
            </CardContent>
          </Card>
        </div>

        {/* Next Step card */}
        {(prospect.next_step_type || prospect.next_step_date) && !editing && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <CalendarDays className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {prospect.next_step_type || "Next Step"}
                    {prospect.next_step_date && (
                      <span className={cn("ml-2 text-xs font-normal",
                        compareDateOnly(prospect.next_step_date) === -1 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {formatDateOnly(prospect.next_step_date)}
                        {compareDateOnly(prospect.next_step_date) === -1 && " (Overdue)"}
                        {compareDateOnly(prospect.next_step_date) === 0 && " (Today)"}
                      </span>
                    )}
                  </p>
                  {prospect.next_step_notes && (
                    <p className="text-xs text-muted-foreground mt-1">{prospect.next_step_notes}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info card */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Prospect Info</CardTitle>
            <div className="flex gap-1">
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-primary text-xs">Edit</Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => updateMut.mutate(form)} disabled={updateMut.isPending}><Save className="w-3 h-3 mr-1" />{updateMut.isPending ? "Saving..." : "Save"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={form.opportunity_status} onValueChange={(v) => setForm({ ...form, opportunity_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OPPORTUNITY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date Shared</label>
                  <Input type="date" value={form.date_shared} onChange={(e) => setForm({ ...form, date_shared: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Contact</label>
                  <Input type="date" value={form.last_contact_date} onChange={(e) => setForm({ ...form, last_contact_date: e.target.value })} />
                </div>
                <div className="sm:col-span-2 p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Next Step</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-0.5 block">Type</label>
                      <Select value={form.next_step_type || "none"} onValueChange={(v) => setForm({ ...form, next_step_type: v === "none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {NEXT_STEP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-0.5 block">Date</label>
                      <Input type="date" value={form.next_step_date} onChange={(e) => setForm({ ...form, next_step_date: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-0.5 block">Notes</label>
                    <Input placeholder="Next step notes (optional)" value={form.next_step_notes} onChange={(e) => setForm({ ...form, next_step_notes: e.target.value })} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">General Notes</label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <InfoRow label="Phone" value={prospect.phone} />
                <InfoRow label="Email" value={prospect.email} />
                <InfoRow label="Date Shared" value={prospect.date_shared ? formatDateOnly(prospect.date_shared) : null} />
                <InfoRow label="Last Contact" value={prospect.last_contact_date ? formatDateOnly(prospect.last_contact_date) : null} />
                {prospect.notes && <div className="sm:col-span-2"><span className="text-muted-foreground">Notes:</span> {prospect.notes}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion */}
        {prospect.opportunity_status !== "Converted" && prospect.opportunity_status !== "Joined" && prospect.opportunity_status !== "Closed" && prospect.opportunity_status !== "Not Interested" && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Convert to Consultant</p>
                <p className="text-xs text-muted-foreground">
                  {prospect.customer_id
                    ? "This will update the linked customer's relationship status to Consultant."
                    : "Link this prospect to a customer first, or convert their status."}
                </p>
              </div>
              <Button size="sm" onClick={() => setShowConvert(true)}>
                <UserCheck className="w-4 h-4 mr-1" />Convert
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Notes Timeline */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes ({notes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Textarea placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-[60px]" />
              <Button size="sm" className="shrink-0 self-end" onClick={() => noteText.trim() && addNoteMut.mutate(noteText.trim())} disabled={!noteText.trim() || addNoteMut.isPending}>
                <FileText className="w-3.5 h-3.5 mr-1" />Save
              </Button>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <NoteItem key={n.id} note={n} onDelete={() => deleteNoteMut.mutate(n.id)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete */}
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5 mr-1" />Delete Prospect</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Prospect?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete {prospect.name} and all their notes.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMut.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Convert Dialog */}
        <Dialog open={showConvert} onOpenChange={(o) => { setShowConvert(o); if (!o) { setConvertCoachingDate(""); setConvertCoachingFocus(""); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Convert to Consultant</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will create a new Consultant record for {prospect.name} with Focus Group = New Consultant
              {prospect.customer_id && " and update their customer relationship status"}.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Coaching Focus (optional)</label>
                <Select value={convertCoachingFocus || "none"} onValueChange={(v) => setConvertCoachingFocus(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select focus" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {COACHING_FOCUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Next Coaching Date (optional)</label>
                <Input type="date" value={convertCoachingDate} onChange={(e) => setConvertCoachingDate(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowConvert(false)}>Cancel</Button>
              <Button onClick={() => convertMut.mutate()} disabled={convertMut.isPending}>
                {convertMut.isPending ? "Converting..." : "Convert"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}

function NoteItem({ note, onDelete }: { note: ProspectNote; onDelete: () => void }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/50 group">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground">{new Date(note.created_at).toLocaleString()}</p>
        <p className="text-sm text-foreground mt-0.5">{note.note_text}</p>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" onClick={onDelete}>
        <Trash2 className="w-3 h-3 text-destructive" />
      </Button>
    </div>
  );
}
