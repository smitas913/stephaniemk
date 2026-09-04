import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Loader2, Trash2, Plus, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { type Customer } from "@/lib/types";
import BeautyProfileFields from "@/components/BeautyProfileFields";
import { parseBeautyProfile, type BeautyProfile } from "@/lib/beautyProfile";
import {
  CONTACT_FIELDS,
  type Extracted,
  type OrderDraft,
  type Resolution,
  runScanExtract,
  orderDraftsFromExtracted,
  todayISO,
  applyScanToExistingCustomer,
  beautyProfileFromExtracted,
} from "@/lib/scanPhoto";
import { useCameraCapture } from "@/lib/scanCapture";

export default function ScanPhotoDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [profile, setProfile] = useState<BeautyProfile>({});

  // Contact resolutions per field
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [orderDrafts, setOrderDrafts] = useState<OrderDraft[]>([]);

  const reset = () => {
    setFile(null); setBackFile(null); setPreview(null); setBackPreview(null);
    setScanning(false); setSaving(false);
    setExtracted(null); setResolutions({}); setOrderDrafts([]);
    setProfile({});
  };


  const handleClose = (v: boolean) => {
    if (!v && !scanning && !saving) reset();
    onOpenChange(v);
  };

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setExtracted(null);
  };

  const handleBackFile = (f: File) => {
    setBackFile(f);
    setBackPreview(URL.createObjectURL(f));
    setExtracted(null);
  };

  const openFrontCapture = useCameraCapture(handleFile);
  const openBackCapture = useCameraCapture(handleBackFile);

  const runScan = async () => {
    if (!file) return;
    setScanning(true);
    try {
      const ex = await runScanExtract(backFile ? [file, backFile] : file);
      setExtracted(ex);
      setProfile({ ...parseBeautyProfile((customer as any).beauty_notes), ...beautyProfileFromExtracted(ex) });


      // Seed contact resolutions: default replace when existing is empty, keep otherwise
      const nextRes: Record<string, Resolution> = {};
      for (const f of CONTACT_FIELDS) {
        const existing = ((customer as any)[f.key] ?? "") as string;
        const incoming = (ex.contact?.[f.key] ?? "") as string;
        if (!incoming) continue;
        nextRes[f.key] = existing ? "keep" : "replace";
      }
      setResolutions(nextRes);

      setOrderDrafts(orderDraftsFromExtracted(ex));
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };


  const setRes = (key: string, r: Resolution) => setResolutions((prev) => ({ ...prev, [key]: r }));

  const updateOrder = (i: number, patch: Partial<OrderDraft>) =>
    setOrderDrafts((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const removeOrder = (i: number) => setOrderDrafts((prev) => prev.filter((_, idx) => idx !== i));

  const addBlankOrder = () =>
    setOrderDrafts((prev) => [...prev, { order_date: todayISO(), itemsText: "", total: "", notes: "", include: true }]);

  const handleConfirm = async () => {
    if (!extracted) return;
    setSaving(true);
    try {
      const { driveError, driveNeedsSetup } = await applyScanToExistingCustomer({
        customer: customer as any,
        file,
        files: [file, backFile],
        extracted,
        resolutions,
        orderDrafts,
        beautyProfile: profile,
      });
      if (driveNeedsSetup) toast.warning("Saved — Google Drive isn't connected yet, so the card photo backup was skipped.");
      else if (driveError) toast.warning("Saved — but the card photo backup failed.");



      await Promise.all([
        qc.invalidateQueries({ queryKey: ["customer", customer.id] }),
        qc.invalidateQueries({ queryKey: ["customer-orders", customer.id] }),
        qc.invalidateQueries({ queryKey: ["customer-notes", customer.id] }),
      ]);

      toast.success("Scan applied to profile");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5" />Scan Photo</DialogTitle>
          <DialogDescription>
            Snap the front of the card, and the back too if there's writing on it. Nothing is saved to {customer.full_name}'s profile until you confirm below.
          </DialogDescription>
        </DialogHeader>

        {!extracted && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => openFrontCapture()} className="gap-2">
                <Camera className="w-4 h-4" />{file ? "Replace front" : "Front of card"}
              </Button>
              {file && <span className="text-xs text-muted-foreground truncate">{file.name}</span>}
            </div>
            {preview && (
              <div className="border rounded-md overflow-hidden bg-muted/30">
                <img src={preview} alt="Front preview" className="w-full max-h-60 object-contain" />
              </div>
            )}

            {file && (
              <div className="rounded-md border border-dashed p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Got a back? Snap it — otherwise just skip ahead.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openBackCapture()} className="gap-2">
                    <Camera className="w-4 h-4" />{backFile ? "Replace back" : "Back of card"}
                  </Button>
                  {backFile && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setBackFile(null); setBackPreview(null); }}>
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

            <Button type="button" disabled={!file || scanning} onClick={runScan} className="w-full gap-2">
              {scanning ? <><Loader2 className="w-4 h-4 animate-spin" />Extracting…</> : <>Extract with AI</>}

            </Button>
          </div>
        )}

        {extracted && (
          <div className="space-y-5">
            {/* Contact conflicts */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Contact info</h3>
              {CONTACT_FIELDS.map((f) => {
                const incomingRaw = extracted.contact?.[f.key];
                if (!incomingRaw) return null;
                const incoming = f.normalize ? f.normalize(String(incomingRaw)) : String(incomingRaw);
                const existing = ((customer as any)[f.key] ?? "") as string;
                const same = existing && String(existing).trim().toLowerCase() === incoming.trim().toLowerCase();
                if (same) {
                  return (
                    <div key={f.key} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="font-medium text-foreground">{f.label}:</span>
                      <span>matches — "{existing}"</span>
                    </div>
                  );
                }
                const r = resolutions[f.key] || (existing ? "keep" : "replace");
                return (
                  <Card key={f.key} className="border-border/60">
                    <CardContent className="p-3 space-y-2">
                      <div className="text-xs font-semibold">{f.label}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded border bg-muted/30">
                          <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Existing</div>
                          <div className="break-words min-h-[1.25rem]">{existing || <span className="italic text-muted-foreground">(empty)</span>}</div>
                        </div>
                        <div className="p-2 rounded border bg-primary/5">
                          <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Scanned</div>
                          <div className="break-words min-h-[1.25rem]">{incoming}</div>
                        </div>
                      </div>
                      <RadioGroup value={r} onValueChange={(v) => setRes(f.key as string, v as Resolution)} className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="keep" id={`${f.key}-keep`} />
                          <Label htmlFor={`${f.key}-keep`} className="text-xs cursor-pointer">Keep existing</Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="replace" id={`${f.key}-replace`} />
                          <Label htmlFor={`${f.key}-replace`} className="text-xs cursor-pointer">Replace with scanned</Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="both" id={`${f.key}-both`} />
                          <Label htmlFor={`${f.key}-both`} className="text-xs cursor-pointer">Keep both (log in notes)</Label>
                        </div>
                      </RadioGroup>
                    </CardContent>
                  </Card>
                );
              })}
              {!CONTACT_FIELDS.some((f) => extracted.contact?.[f.key]) && (
                <p className="text-xs text-muted-foreground italic">No contact fields detected.</p>
              )}
            </div>

            {/* Beauty Profile */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Beauty Profile</h3>
              <p className="text-xs text-muted-foreground">
                Pre-checked from the card where legible — nothing is required, and nothing saves until you confirm.
              </p>
              <BeautyProfileFields value={profile} onChange={setProfile} />
            </div>

            {/* Orders */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Orders (created as Unpaid — editable after saving)</h3>
                <Button type="button" size="sm" variant="outline" onClick={addBlankOrder} className="gap-1"><Plus className="w-3.5 h-3.5" />Add</Button>
              </div>
              {orderDrafts.length === 0 && <p className="text-xs text-muted-foreground italic">No orders detected.</p>}
              {orderDrafts.map((o, i) => (
                <Card key={i} className={`border-border/60 ${!o.include ? "opacity-50" : ""}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={o.include} onChange={(e) => updateOrder(i, { include: e.target.checked })} />
                        Include this order
                      </label>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeOrder(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Date</Label>
                        <Input type="date" value={o.order_date} onChange={(e) => updateOrder(i, { order_date: e.target.value })} className="h-8" />
                      </div>
                      <div>
                        <Label className="text-xs">Total ($)</Label>
                        <Input type="number" step="0.01" value={o.total} onChange={(e) => updateOrder(i, { total: e.target.value })} className="h-8" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Items</Label>
                      <Textarea value={o.itemsText} onChange={(e) => updateOrder(i, { itemsText: e.target.value })} rows={3} className="text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Notes</Label>
                      <Input value={o.notes} onChange={(e) => updateOrder(i, { notes: e.target.value })} className="h-8" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {extracted.raw_notes && (
              <div className="text-xs">
                <div className="font-semibold mb-1">Other handwriting captured</div>
                <div className="p-2 rounded border bg-muted/30 whitespace-pre-wrap">{extracted.raw_notes}</div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={scanning || saving}>Cancel</Button>
          {extracted && (
            <>
              <Button variant="outline" onClick={reset} disabled={saving}>Start over</Button>
              <Button onClick={handleConfirm} disabled={saving} className="gap-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Confirm & save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
