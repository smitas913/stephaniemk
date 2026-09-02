import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, ScanLine, Trash2, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { toLocalDateKey } from "@/lib/dateOnly";
import { SKIN_TYPES } from "@/lib/types";
import { createCustomer, createEventGuest, updateEventGuest, fetchEvents } from "@/lib/queries";
import { createFacialContact } from "@/lib/facialContacts";
import NewCustomerFollowUpDialog from "@/components/NewCustomerFollowUpDialog";
import {
  CONTACT_FIELDS,
  type Extracted,
  type OrderDraft,
  runScanExtract,
  orderDraftsFromExtracted,
  contactFieldsForNewCustomer,
  finalizeScanForNewCustomer,
  uploadScanPdfToDrive,
  normalizeSkinType,
  todayISO,
} from "@/lib/scanPhoto";

type Step = "capture-front" | "capture-back" | "review" | "event" | "outcome";

export type ScanCardSeed = {
  /** Pre-known event (text event_id) — skips the event step. */
  eventId?: string | null;
  /** Guest row this scan came from, so both sides get linked. */
  guestId?: string | null;
  name?: string | null;
  phone?: string | null;
};

export default function ScanCardDialog({
  open,
  onOpenChange,
  seed,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seed?: ScanCardSeed;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("capture-front");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);

  // Editable review fields
  const [fields, setFields] = useState<Record<string, string>>({});
  const [skinType, setSkinType] = useState<string>("");
  const [shade, setShade] = useState<string>("");
  const [facialDate, setFacialDate] = useState<string>(toLocalDateKey());
  const [notes, setNotes] = useState<string>("");
  const [orderDrafts, setOrderDrafts] = useState<OrderDraft[]>([]);

  // Event linkage
  const [eventChoice, setEventChoice] = useState<boolean | null>(null);
  const [eventId, setEventId] = useState<string | null>(seed?.eventId ?? null);

  const [followUpFor, setFollowUpFor] = useState<{ id: string; name: string } | null>(null);

  const { data: bookedEvents = [] } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
    enabled: open,
    select: (data: any[]) =>
      data.filter((e) => e.event_status === "Booked" || e.event_status === "Held").slice(0, 15),
  });

  const reset = () => {
    setStep("capture-front");
    setFront(null); setBack(null); setFrontPreview(null); setBackPreview(null);
    setScanning(false); setSaving(false); setExtracted(null);
    setFields({}); setSkinType(""); setShade(""); setNotes("");
    setFacialDate(toLocalDateKey());
    setOrderDrafts([]);
    setEventChoice(seed?.eventId ? false : null);
    setEventId(seed?.eventId ?? null);
    setFollowUpFor(null);
  };

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = (v: boolean) => {
    if (!v && (scanning || saving)) return;
    onOpenChange(v);
  };

  const pick = (which: "front" | "back", f: File) => {
    const url = URL.createObjectURL(f);
    if (which === "front") { setFront(f); setFrontPreview(url); }
    else { setBack(f); setBackPreview(url); }
  };

  const runScan = async () => {
    if (!front) return;
    setScanning(true);
    try {
      const ex = await runScanExtract([front, back]);
      setExtracted(ex);
      const seeded = contactFieldsForNewCustomer(ex);
      if (seed?.name) seeded.full_name = seed.name;
      if (seed?.phone && !seeded.phone) seeded.phone = seed.phone;
      setFields(seeded);
      setSkinType(normalizeSkinType(ex.contact?.skin_type) ?? "");
      setShade((ex.contact?.foundation_shade || "").trim());
      setNotes((ex.raw_notes || "").trim());
      setOrderDrafts(orderDraftsFromExtracted(ex));
      setStep("review");
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const setField = (k: string, v: string) => setFields((prev) => ({ ...prev, [k]: v }));
  const updateOrder = (i: number, patch: Partial<OrderDraft>) =>
    setOrderDrafts((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const removeOrder = (i: number) => setOrderDrafts((prev) => prev.filter((_, idx) => idx !== i));

  const selectedEvent = useMemo(
    () => (bookedEvents as any[]).find((e) => e.event_id === eventId) || null,
    [bookedEvents, eventId],
  );

  const afterReview = () => {
    if (seed?.eventId) setStep("outcome");
    else setStep("event");
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["facial-contacts"] });
    if (eventId) qc.invalidateQueries({ queryKey: ["event-guests", eventId] });
    onCreated?.();
  };

  const flagDrive = (driveError: string | null, needsSetup?: boolean) => {
    if (!driveError) return;
    toast.warning(
      needsSetup
        ? "Saved, but the Drive PDF backup needs a one-time Google authorization."
        : `Saved, but the Drive PDF backup failed: ${driveError}`,
    );
  };

  const saveAsCustomer = async () => {
    const name = (fields.full_name || "").trim();
    if (!name) { toast.error("Full name is required"); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = { ...fields, full_name: name };
      if (skinType) payload.skin_type = skinType;
      if (shade) payload.beauty_notes = { foundation_shade: shade };
      if (notes) payload.notes = notes;
      payload.relationship_status = "Customer";
      payload.became_customer_date = facialDate || toLocalDateKey();

      const created: any = await createCustomer(payload as any, { allowDuplicate: true });

      const result = await finalizeScanForNewCustomer({
        customerId: created.id,
        customerName: name,
        files: [front, back],
        extracted: extracted || {},
        orderDrafts,
        eventId: eventId ?? undefined,
      });
      flagDrive(result.driveError);

      if (eventId) {
        if (seed?.guestId) {
          await updateEventGuest(seed.guestId, { converted_customer_id: created.id } as any);
        } else {
          await createEventGuest({
            event_id: eventId,
            name,
            phone: fields.phone || null,
            email: fields.email || null,
            converted_customer_id: created.id,
            skin_type: skinType || null,
          });
        }
      }

      invalidate();
      toast.success(`${name} added as a customer`);
      setFollowUpFor({ id: created.id, name });
    } catch (e: any) {
      toast.error(e?.message || "Could not create the customer");
    } finally {
      setSaving(false);
    }
  };

  const saveAsFacialContact = async () => {
    const name = (fields.full_name || "").trim();
    if (!name) { toast.error("Full name is required"); return; }
    setSaving(true);
    try {
      const drive = await uploadScanPdfToDrive([front, back], name);
      const contact = await createFacialContact({
        full_name: name,
        phone: fields.phone || null,
        email: fields.email || null,
        address_line_1: fields.address_line_1 || null,
        address_line_2: fields.address_line_2 || null,
        city: fields.city || null,
        state_territory: fields.state_territory || null,
        postal_code: fields.postal_code || null,
        birthday: fields.birthday || null,
        skin_type: skinType || null,
        foundation_shade: shade || null,
        notes: notes || null,
        raw_notes: extracted?.raw_notes || null,
        facial_date: facialDate || toLocalDateKey(),
        scan_pdf_url: drive.url,
        event_id: eventId || null,
        source_guest_id: seed?.guestId || null,
      });
      flagDrive(drive.error, drive.needsSetup);

      if (seed?.guestId) {
        await updateEventGuest(seed.guestId, { converted_facial_contact_id: contact.id } as any);
      }

      invalidate();
      toast.success(`${name} saved as a facial contact`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the facial contact");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-primary" />Scan Card
            </DialogTitle>
            <DialogDescription>
              Snap the front (and back, if there's writing on it) of a handwritten profile card. Nothing is saved until you confirm.
            </DialogDescription>
          </DialogHeader>

          {/* Step 1 — front */}
          {step === "capture-front" && (
            <div className="space-y-3">
              <input ref={frontRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pick("front", f); }} />
              <Button type="button" variant="outline" onClick={() => frontRef.current?.click()} className="w-full gap-2 h-11">
                <Camera className="w-4 h-4" />{front ? "Replace front photo" : "Snap the front of the card"}
              </Button>
              {frontPreview && (
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <img src={frontPreview} alt="Card front preview" className="w-full max-h-64 object-contain" />
                </div>
              )}
              <Button type="button" className="w-full" disabled={!front} onClick={() => setStep("capture-back")}>
                Next — back of the card
              </Button>
            </div>
          )}

          {/* Step 2 — optional back */}
          {step === "capture-back" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Got a back? Snap it too.</p>
              <p className="text-xs text-muted-foreground">Both sides go to the AI in one pass and end up in one PDF backup.</p>
              <input ref={backRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pick("back", f); }} />
              <Button type="button" variant="outline" onClick={() => backRef.current?.click()} className="w-full gap-2 h-11">
                <Camera className="w-4 h-4" />{back ? "Replace back photo" : "Snap the back"}
              </Button>
              {backPreview && (
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <img src={backPreview} alt="Card back preview" className="w-full max-h-64 object-contain" />
                </div>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("capture-front")}>
                  <ArrowLeft className="w-4 h-4 mr-1" />Back
                </Button>
                <Button type="button" className="flex-1 gap-2" disabled={scanning} onClick={runScan}>
                  {scanning ? <><Loader2 className="w-4 h-4 animate-spin" />Extracting…</> : back ? "Extract with AI" : "Skip — extract with AI"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — review */}
          {step === "review" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CONTACT_FIELDS.map((f) => (
                  <div key={f.key} className={f.key === "full_name" ? "sm:col-span-2" : ""}>
                    <Label className="text-xs">{f.label}{f.key === "full_name" ? " *" : ""}</Label>
                    <Input
                      className="h-9"
                      type={f.key === "birthday" ? "date" : "text"}
                      value={fields[f.key as string] || ""}
                      onChange={(e) => setField(f.key as string, e.target.value)}
                    />
                  </div>
                ))}
                <div>
                  <Label className="text-xs">Skin type</Label>
                  <Select value={skinType || "none"} onValueChange={(v) => setSkinType(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Not set" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {SKIN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Foundation shade</Label>
                  <Input className="h-9" placeholder="e.g. Beige 3 (leave blank if not made)"
                    value={shade} onChange={(e) => setShade(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Facial date</Label>
                  <Input className="h-9" type="date" value={facialDate} onChange={(e) => setFacialDate(e.target.value)} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Notes / other handwriting</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm" />
              </div>

              {orderDrafts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Orders detected (only saved if she becomes a customer)</p>
                  {orderDrafts.map((o, i) => (
                    <Card key={i} className={`border-border/60 ${!o.include ? "opacity-50" : ""}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={o.include}
                              onChange={(e) => updateOrder(i, { include: e.target.checked })} />
                            Include this order
                          </label>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeOrder(i)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Date</Label>
                            <Input type="date" className="h-8" value={o.order_date}
                              onChange={(e) => updateOrder(i, { order_date: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-xs">Total ($)</Label>
                            <Input type="number" step="0.01" className="h-8" value={o.total}
                              onChange={(e) => updateOrder(i, { total: e.target.value })} />
                          </div>
                        </div>
                        <Textarea rows={2} className="text-xs" value={o.itemsText}
                          onChange={(e) => updateOrder(i, { itemsText: e.target.value })} />
                      </CardContent>
                    </Card>
                  ))}
                  <Button type="button" size="sm" variant="outline" className="gap-1"
                    onClick={() => setOrderDrafts((p) => [...p, { order_date: todayISO(), itemsText: "", total: "", notes: "", include: true }])}>
                    <Plus className="w-3.5 h-3.5" />Add order
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep("capture-back")}>
                  <ArrowLeft className="w-4 h-4 mr-1" />Back
                </Button>
                <Button type="button" className="flex-1" onClick={afterReview}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 4 — event linkage */}
          {step === "event" && (
            <div className="space-y-3">
              {eventChoice === null ? (
                <>
                  <p className="text-sm font-medium">Was this part of a booked event?</p>
                  <p className="text-xs text-muted-foreground">Linking keeps the guest list and this record in sync.</p>
                  <Button variant="outline" className="w-full h-auto py-3 justify-start gap-3"
                    onClick={() => setEventChoice(true)}>
                    <span className="text-lg">📅</span>
                    <div className="text-left">
                      <div className="text-sm font-semibold">Yes — pick the event</div>
                      <div className="text-[11px] text-muted-foreground">Links the record to that event's guest list</div>
                    </div>
                  </Button>
                  <Button variant="outline" className="w-full h-auto py-3 justify-start gap-3"
                    onClick={() => { setEventChoice(false); setStep("outcome"); }}>
                    <span className="text-lg">👤</span>
                    <div className="text-left">
                      <div className="text-sm font-semibold">No — standalone face</div>
                      <div className="text-[11px] text-muted-foreground">1:1 facial, warm chatter, sample</div>
                    </div>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStep("review")}>Back to review</Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Which event?</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {(bookedEvents as any[]).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center">No booked or held events found</p>
                    ) : (
                      (bookedEvents as any[]).map((e) => (
                        <button key={e.id}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${eventId === e.event_id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                          onClick={() => setEventId(e.event_id)}>
                          <p className="text-sm font-medium">{e.hostess_name || e.event_id}</p>
                          <p className="text-xs text-muted-foreground">{e.event_type} · {e.event_date}</p>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setEventChoice(null); setEventId(null); }}>Back</Button>
                    <Button className="flex-1" disabled={!eventId} onClick={() => setStep("outcome")}>Next</Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 5 — outcome */}
          {step === "outcome" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Did {fields.full_name || "this person"} become a customer?</p>
              {selectedEvent && (
                <p className="text-xs text-muted-foreground">
                  Linking to {selectedEvent.hostess_name || selectedEvent.event_id} · {selectedEvent.event_date}
                </p>
              )}
              <Button className="w-full h-auto py-3 justify-start gap-3" variant="outline" disabled={saving} onClick={saveAsCustomer}>
                <span className="text-lg">🛍️</span>
                <div className="text-left">
                  <div className="text-sm font-semibold">Yes — create a Customer</div>
                  <div className="text-[11px] text-muted-foreground">Then pick her follow-up sequence</div>
                </div>
              </Button>
              <Button className="w-full h-auto py-3 justify-start gap-3" variant="outline" disabled={saving} onClick={saveAsFacialContact}>
                <span className="text-lg">💧</span>
                <div className="text-left">
                  <div className="text-sm font-semibold">No — save as a Facial Contact</div>
                  <div className="text-[11px] text-muted-foreground">Kept out of Customers and Leads</div>
                </div>
              </Button>
              {saving && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Saving and backing up the PDF…</p>}
              {!saving && (
                <Button variant="ghost" size="sm" onClick={() => setStep(seed?.eventId ? "review" : "event")}>Back</Button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)} disabled={scanning || saving}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewCustomerFollowUpDialog
        open={Boolean(followUpFor)}
        customerId={followUpFor?.id ?? null}
        customerName={followUpFor?.name ?? ""}
        baseDate={facialDate || undefined}
        onClose={() => {
          setFollowUpFor(null);
          onOpenChange(false);
        }}
      />
    </>
  );
}
