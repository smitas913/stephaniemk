import { useEffect, useRef, useState } from "react";
import { usePhotoCapture } from "@/components/CameraCapture";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2, ScanLine, UserPlus, Droplets } from "lucide-react";
import { toast } from "sonner";
import { fetchEvents, createCustomer, updateEventGuest } from "@/lib/queries";
import { createFacialContact } from "@/lib/facialContacts";
import NewCustomerFollowUpDialog from "@/components/NewCustomerFollowUpDialog";
import BeautyProfileFields from "@/components/BeautyProfileFields";
import {
  cleanBeautyProfile,
  derivedSkinType,
  isBeautyProfileEmpty,
  type BeautyProfile,
} from "@/lib/beautyProfile";
import {
  CONTACT_FIELDS,
  type Extracted,
  runScanExtract,
  contactFieldsForNewCustomer,
  finalizeScanForNewCustomer,
  beautyProfileFromExtracted,
  uploadScanPdfToDrive,
  todayISO,
} from "@/lib/scanPhoto";

export type ScanCardSeed = {
  eventId?: string | null;
  guestId?: string | null;
  name?: string | null;
  phone?: string | null;
};

type Step = "capture" | "review" | "event" | "outcome";

export default function ScanCardDialog({
  open,
  onOpenChange,
  seed,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seed?: ScanCardSeed;
  onCreated?: (result: { kind: "customer" | "facial_contact"; id: string; name: string }) => void;
}) {
  const qc = useQueryClient();
  
  const [step, setStep] = useState<Step>("capture");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  // Photos are captured in-page (see CameraCapture) so Android never
  // backgrounds — and discards — the tab for the OS camera app.
  const { takePhoto, chooseFromLibrary, cameraOverlay } = usePhotoCapture();
  const setFrontFile = (f: File) => { setFront(f); setFrontPreview(URL.createObjectURL(f)); };
  const setBackFile = (f: File) => { setBack(f); setBackPreview(URL.createObjectURL(f)); };
  const [profile, setProfile] = useState<BeautyProfile>({});
  const [notes, setNotes] = useState("");
  const [facialDate, setFacialDate] = useState(todayISO());
  const [eventId, setEventId] = useState<string | null>(seed?.eventId ?? null);
  const [followUpFor, setFollowUpFor] = useState<{ id: string; name: string } | null>(null);

  const { data: bookedEvents = [] } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
    enabled: open,
    select: (data: any[]) => data.filter((e) => e.event_status === "Booked" || e.event_status === "Held").slice(0, 15),
  });

  useEffect(() => {
    if (!open) return;
    setStep("capture");
    setFront(null); setBack(null); setFrontPreview(null); setBackPreview(null);
    setScanning(false); setSaving(false); setExtracted(null);
    setFields({ full_name: seed?.name || "", phone: seed?.phone || "" });
    setProfile({}); setNotes(""); setFacialDate(todayISO());
    setEventId(seed?.eventId ?? null);
    setFollowUpFor(null);
  }, [open, seed?.name, seed?.phone, seed?.eventId]);

  const setField = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  const runScan = async () => {
    if (!front) return;
    setScanning(true);
    try {
      const ex = await runScanExtract(back ? [front, back] : front);
      setExtracted(ex);
      const scanned = contactFieldsForNewCustomer(ex);
      setFields((prev) => {
        const next = { ...scanned };
        // Seeded guest name/phone win when the scan didn't read them
        if (prev.full_name && !next.full_name) next.full_name = prev.full_name;
        if (prev.phone && !next.phone) next.phone = prev.phone;
        return next;
      });
      setProfile(beautyProfileFromExtracted(ex));
      setNotes((ex.raw_notes || "").trim());
      setStep("review");
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const flagDrive = (error: string | null, needsSetup: boolean) => {
    if (needsSetup) toast.warning("Saved — Google Drive isn't connected yet, so the card photo backup was skipped.");
    else if (error) toast.warning("Saved — but the card photo backup failed.");
  };

  const name = (fields.full_name || "").trim();

  const saveAsCustomer = async () => {
    if (!extracted || !name) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const f of CONTACT_FIELDS) {
        const v = (fields[f.key as string] || "").trim();
        if (v) payload[f.key as string] = v;
      }
      payload.full_name = name;
      const cleanProfile = cleanBeautyProfile(profile);
      if (!isBeautyProfileEmpty(cleanProfile)) payload.beauty_notes = cleanProfile;
      if (notes) payload.notes = notes;

      const customer: any = await createCustomer(payload as any, { allowDuplicate: true });
      // Orders/notes/photo-backup run in their own try so a hiccup there never
      // makes a successful save look like a total failure.
      try {
        const res = await finalizeScanForNewCustomer({
          customerId: customer.id,
          customerName: name,
          files: [front, back],
          extracted,
          orderDrafts: [],
          eventId,
        });
        flagDrive(res.driveError, res.driveNeedsSetup);
      } catch (e: any) {
        toast.warning(`Saved — but the card backup/notes step failed: ${e?.message || e}`);
      }

      if (seed?.guestId) {
        await updateEventGuest(seed.guestId, { converted_customer_id: customer.id } as any);
      }

      qc.invalidateQueries({ queryKey: ["customers"] });
      if (eventId) qc.invalidateQueries({ queryKey: ["event-guests", eventId] });
      toast.success(`${name} added as a customer`);
      onCreated?.({ kind: "customer", id: customer.id, name });
      setFollowUpFor({ id: customer.id, name });
    } catch (e: any) {
      toast.error(e?.message || "Could not create the customer");
    } finally {
      setSaving(false);
    }
  };

  const saveAsFacialContact = async () => {
    if (!extracted || !name) return;
    setSaving(true);
    try {
      let drive: { url: string | null; error: string | null; needsSetup?: boolean } = {
        url: null,
        error: null,
        needsSetup: false,
      };
      try {
        drive = await uploadScanPdfToDrive([front, back], name);
      } catch (e: any) {
        drive = { url: null, error: e?.message || "Could not build the card PDF", needsSetup: false };
      }
      flagDrive(drive.error, Boolean(drive.needsSetup));


      const payload: Record<string, any> = {};
      for (const f of CONTACT_FIELDS) {
        const v = (fields[f.key as string] || "").trim();
        if (v) payload[f.key as string] = v;
      }
      payload.full_name = name;
      const cleanProfile = cleanBeautyProfile(profile);
      payload.beauty_notes = cleanProfile;
      payload.skin_type = derivedSkinType(cleanProfile);
      payload.foundation_shade = cleanProfile.foundation_shade || null;
      payload.notes = notes || null;
      payload.raw_notes = extracted.raw_notes || null;
      payload.facial_date = facialDate || null;
      payload.scan_pdf_url = drive.url || null;
      payload.event_id = eventId || null;
      payload.source_guest_id = seed?.guestId || null;

      const created = await createFacialContact(payload as any);
      if (seed?.guestId) {
        await updateEventGuest(seed.guestId, { converted_facial_contact_id: created.id } as any);
      }

      qc.invalidateQueries({ queryKey: ["facial-contacts"] });
      if (eventId) qc.invalidateQueries({ queryKey: ["event-guests", eventId] });
      toast.success(`${name} saved as a facial contact`);
      onCreated?.({ kind: "facial_contact", id: created.id, name });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the facial contact");
    } finally {
      setSaving(false);
    }
  };

  const goAfterReview = () => {
    if (!name) {
      toast.error("A full name is required");
      return;
    }
    setStep(seed?.eventId ? "outcome" : "event");
  };

  return (
    <>
      <Dialog open={open && !followUpFor} onOpenChange={(v) => { if (!v && !scanning && !saving) onOpenChange(false); }}>
        <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5" />Scan Card</DialogTitle>
            <DialogDescription>
              Snap the profile card, check what came off it, then decide whether she becomes a customer or a facial contact.
            </DialogDescription>
          </DialogHeader>

          {step === "capture" && (
            <div className="space-y-3">

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => takePhoto(setFrontFile, "Front of card")} className="gap-2">
                  <Camera className="w-4 h-4" />{front ? "Replace front" : "Front of card"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => chooseFromLibrary(setFrontFile)}>
                  Choose from library
                </Button>
              </div>
              {frontPreview && (
                <div className="border rounded-md overflow-hidden bg-muted/30">
                  <img src={frontPreview} alt="Front preview" className="w-full max-h-60 object-contain" />
                </div>
              )}

              {front && (
                <div className="rounded-md border border-dashed p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Got a back? Snap it — otherwise just skip ahead.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => takePhoto(setBackFile, "Back of card")} className="gap-2">
                      <Camera className="w-4 h-4" />{back ? "Replace back" : "Back of card"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => chooseFromLibrary(setBackFile)}>
                      Choose from library
                    </Button>
                    {back && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setBack(null); setBackPreview(null); }}>
                        Remove back
                      </Button>
                    )}
                  </div>
                  {backPreview && (
                    <div className="border rounded-md overflow-hidden bg-muted/30">
                      <img src={backPreview} alt="Back preview" className="w-full max-h-60 object-contain" />
                    </div>
                  )}
                </div>
              )}

              <Button type="button" className="w-full gap-2" disabled={!front || scanning} onClick={runScan}>
                {scanning ? <><Loader2 className="w-4 h-4 animate-spin" />Extracting…</> : "Extract with AI"}
              </Button>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Everything is editable and nothing here is required — anything the card left blank you can fill in later from her profile.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {CONTACT_FIELDS.map((f) => (
                  <div key={f.key as string} className={["full_name", "address_line_1", "address_line_2"].includes(f.key as string) ? "col-span-2" : ""}>
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
                  <Label className="text-xs">Facial date</Label>
                  <Input className="h-9" type="date" value={facialDate} onChange={(e) => setFacialDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <h3 className="text-sm font-semibold">Beauty Profile</h3>
                <BeautyProfileFields value={profile} onChange={setProfile} showNotes={false} />
              </div>

              <div>
                <Label className="text-xs">Notes / other handwriting</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("capture")}>Back</Button>
                <Button onClick={goAfterReview}>Continue</Button>
              </div>
            </div>
          )}

          {step === "event" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Was this face part of a booked event?</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(bookedEvents as any[]).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">No booked or held events found</p>
                ) : (
                  (bookedEvents as any[]).map((e: any) => (
                    <button
                      key={e.id}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        eventId === e.event_id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setEventId(e.event_id)}
                    >
                      <p className="text-sm font-medium text-foreground">{e.hostess_name || e.event_id}</p>
                      <p className="text-xs text-muted-foreground">{e.event_type} · {e.event_date}</p>
                    </button>
                  ))
                )}
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={() => setStep("review")}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => { setEventId(null); setStep("outcome"); }}>No event</Button>
                  <Button disabled={!eventId} onClick={() => setStep("outcome")}>Continue</Button>
                </div>
              </div>
            </div>
          )}

          {step === "outcome" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Did {name} become a customer?</p>
              {eventId && <p className="text-xs text-muted-foreground">Linked to event {eventId}.</p>}
              <div className="grid gap-2">
                <Button className="justify-start gap-2 h-auto py-3" disabled={saving} onClick={saveAsCustomer}>
                  <UserPlus className="w-4 h-4" />
                  <span className="text-left">
                    <span className="block font-medium">Yes — create a customer</span>
                    <span className="block text-xs opacity-80">You'll pick her follow-up sequence next</span>
                  </span>
                </Button>
                <Button variant="outline" className="justify-start gap-2 h-auto py-3" disabled={saving} onClick={saveAsFacialContact}>
                  <Droplets className="w-4 h-4" />
                  <span className="text-left">
                    <span className="block font-medium">No — save as a facial contact</span>
                    <span className="block text-xs text-muted-foreground">Kept out of Clients and Leads</span>
                  </span>
                </Button>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(seed?.eventId ? "review" : "event")} disabled={saving}>Back</Button>
                {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</span>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <NewCustomerFollowUpDialog
        open={Boolean(followUpFor)}
        customerId={followUpFor?.id ?? null}
        customerName={followUpFor?.name ?? ""}
        onClose={() => {
          setFollowUpFor(null);
          qc.invalidateQueries({ queryKey: ["customers"] });
          onOpenChange(false);
        }}
      />
    </>
  );
}
