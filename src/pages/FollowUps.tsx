import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders, updateCustomer, createCustomerNote, fetchLatestNotes } from "@/lib/queries";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarCheck, Cake, Phone, MessageSquare, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

type Enriched = Customer & CustomerComputed;

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
  const isLoading = cLoading || oLoading;

  const [showUpcoming7, setShowUpcoming7] = useState(false);
  const [actionCustomer, setActionCustomer] = useState<Enriched | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("Call");
  const [followUpDate, setFollowUpDate] = useState("");

  const notesByCustomer = useMemo(() => {
    const map = new Map<string, CustomerNote>();
    for (const n of allNotes) {
      if (!map.has(n.customer_id)) map.set(n.customer_id, n);
    }
    return map;
  }, [allNotes]);

  const { overdue, todayList, birthdaysToday, birthdaysUpcoming } = useMemo(() => {
    const enriched: Enriched[] = customers
      .filter((c) => c.is_active !== false)
      .map((c) => {
        const custOrders = allOrders.filter((o) => o.customer_id === c.id);
        return { ...c, ...computeCustomerFields(c, custOrders) };
      });

    const overdue = enriched
      .filter((c) => c.follow_up_status === "OVERDUE")
      .sort((a, b) => {
        const aDate = a.next_follow_up ? parseISO(a.next_follow_up).getTime() : 0;
        const bDate = b.next_follow_up ? parseISO(b.next_follow_up).getTime() : 0;
        return aDate - bDate; // oldest first
      });

    const todayList = enriched.filter((c) => c.follow_up_status === "TODAY");

    const birthdaysToday: Enriched[] = [];
    const birthdaysUpcoming: (Enriched & { _daysUntil: number })[] = [];

    for (const c of enriched) {
      const days = daysToBirthday(c.birthday_mmdd);
      if (days === null) continue;
      if (days === 0) birthdaysToday.push(c);
      else if (days <= 7) birthdaysUpcoming.push({ ...c, _daysUntil: days });
    }
    birthdaysUpcoming.sort((a, b) => a._daysUntil - b._daysUntil);

    return { overdue, todayList, birthdaysToday, birthdaysUpcoming };
  }, [customers, allOrders]);

  const contactMutation = useMutation({
    mutationFn: async ({ customerId, note, type, nextDate }: { customerId: string; note: string; type: string; nextDate?: string }) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const updates: Record<string, string | null> = { last_contacted: today };
      if (nextDate) updates.last_contacted = today;

      await updateCustomer(customerId, updates as any);

      if (note.trim()) {
        await createCustomerNote({ customer_id: customerId, note_text: note.trim(), note_type: type });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notes"] });
      setActionCustomer(null);
      setNoteText("");
      setNoteType("Call");
      setFollowUpDate("");
      toast.success("Marked as contacted");
    },
  });

  const quickContact = (c: Enriched) => {
    setActionCustomer(c);
    setNoteText("");
    setNoteType("Call");
    setFollowUpDate("");
  };

  const handleSubmitAction = () => {
    if (!actionCustomer) return;
    contactMutation.mutate({
      customerId: actionCustomer.id,
      note: noteText,
      type: noteType,
      nextDate: followUpDate || undefined,
    });
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Follow-Ups</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {overdue.length} overdue · {todayList.length} today · {birthdaysToday.length} birthday{birthdaysToday.length !== 1 ? "s" : ""}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* OVERDUE */}
            <FollowUpSection
              title="Overdue"
              icon={AlertTriangle}
              iconColor="text-red-600"
              iconBg="bg-red-50 dark:bg-red-950/30"
              items={overdue}
              notesByCustomer={notesByCustomer}
              onNavigate={(id) => navigate(`/customers/${id}`)}
              onAction={quickContact}
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
                </div>
              )}
            />

            {/* TODAY */}
            <FollowUpSection
              title="Today"
              icon={CalendarCheck}
              iconColor="text-blue-600"
              iconBg="bg-blue-50 dark:bg-blue-950/30"
              items={todayList}
              notesByCustomer={notesByCustomer}
              onNavigate={(id) => navigate(`/customers/${id}`)}
              onAction={quickContact}
              renderMeta={(c) => (
                <div className="text-right shrink-0">
                  {c.activity_status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                      {c.activity_status}
                    </span>
                  )}
                </div>
              )}
            />

            {/* BIRTHDAYS */}
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
                      <BirthdayRow key={c.id} customer={c} label="Today 🎉" onNavigate={() => navigate(`/customers/${c.id}`)} onAction={() => quickContact(c)} />
                    ))}
                    {showUpcoming7 && birthdaysUpcoming.map((c) => (
                      <BirthdayRow key={c.id} customer={c} label={`in ${c._daysUntil}d`} onNavigate={() => navigate(`/customers/${c.id}`)} onAction={() => quickContact(c)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Dialog */}
        <Dialog open={!!actionCustomer} onOpenChange={(open) => !open && setActionCustomer(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Log Contact — {actionCustomer?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea placeholder="Add a note (optional)..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-[80px]" />
              <div className="flex items-center gap-2">
                <Button className="flex-1" onClick={handleSubmitAction} disabled={contactMutation.isPending}>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {contactMutation.isPending ? "Saving..." : "Mark Contacted"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function FollowUpSection({
  title, icon: Icon, iconColor, iconBg, items, notesByCustomer, onNavigate, onAction, renderMeta,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  items: Enriched[];
  notesByCustomer: Map<string, CustomerNote>;
  onNavigate: (id: string) => void;
  onAction: (c: Enriched) => void;
  renderMeta: (c: Enriched) => React.ReactNode;
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
              const lastNote = notesByCustomer.get(c.id);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onNavigate(c.id)}>
                    <p className="text-sm font-medium text-foreground truncate">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {lastNote
                        ? `${lastNote.note_type} · ${new Date(lastNote.created_at).toLocaleDateString()} — ${lastNote.note_text}`
                        : c.days_since_last_order !== null
                          ? `${c.days_since_last_order}d since last order`
                          : "No orders yet"}
                    </p>
                  </div>
                  {renderMeta(c)}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Log contact" onClick={() => onAction(c)}>
                      <Phone className="w-3.5 h-3.5 text-primary" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BirthdayRow({ customer, label, onNavigate, onAction }: { customer: Enriched; label: string; onNavigate: () => void; onAction: () => void }) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
        <p className="text-sm font-medium text-foreground truncate">{customer.full_name}</p>
        <p className="text-xs text-muted-foreground">
          🎂 {customer.birthday_mmdd} — <span className="font-medium text-pink-600">{label}</span>
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Call" onClick={onAction}>
          <Phone className="w-3.5 h-3.5 text-primary" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Text" onClick={onAction}>
          <MessageSquare className="w-3.5 h-3.5 text-primary" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Add note" onClick={onAction}>
          <FileText className="w-3.5 h-3.5 text-primary" />
        </Button>
      </div>
    </div>
  );
}
