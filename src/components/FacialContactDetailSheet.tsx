import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ExternalLink, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { type FacialContact } from "@/lib/types";
import { fetchFacialContact, updateFacialContact, deleteFacialContact } from "@/lib/facialContacts";
import BeautyProfileFields from "@/components/BeautyProfileFields";
import {
  cleanBeautyProfile,
  derivedSkinType,
  parseBeautyProfile,
  type BeautyProfile,
} from "@/lib/beautyProfile";

const TEXT_FIELDS: Array<{ key: keyof FacialContact; label: string; type?: string; wide?: boolean }> = [
  { key: "full_name", label: "Full name", wide: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address_line_1", label: "Address line 1", wide: true },
  { key: "address_line_2", label: "Address line 2", wide: true },
  { key: "city", label: "City" },
  { key: "state_territory", label: "State" },
  { key: "postal_code", label: "ZIP" },
  { key: "birthday", label: "Birthday", type: "date" },
  { key: "facial_date", label: "Facial date", type: "date" },
];

export default function FacialContactDetailSheet({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<FacialContact>>({});
  const [profile, setProfile] = useState<BeautyProfile>({});

  const { data: contact, isLoading } = useQuery({
    queryKey: ["facial-contact", contactId],
    queryFn: () => fetchFacialContact(contactId!),
    enabled: Boolean(contactId) && open,
  });

  useEffect(() => {
    if (contact) {
      setDraft(contact);
      setProfile(parseBeautyProfile((contact as any).beauty_notes));
    }
  }, [contact]);

  const save = useMutation({
    mutationFn: async () => {
      if (!contactId) return;
      const patch: Record<string, unknown> = {};
      for (const f of TEXT_FIELDS) patch[f.key as string] = (draft as any)[f.key] || null;
      patch.notes = draft.notes || null;
      const clean = cleanBeautyProfile(profile);
      patch.beauty_notes = clean;
      patch.skin_type = derivedSkinType(clean);
      patch.foundation_shade = clean.foundation_shade || null;
      if (!String(patch.full_name || "").trim()) throw new Error("Full name is required");
      return updateFacialContact(contactId, patch as Partial<FacialContact>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facial-contacts"] });
      qc.invalidateQueries({ queryKey: ["facial-contact", contactId] });
      toast.success("Facial contact saved");
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!contactId) return;
      return deleteFacialContact(contactId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facial-contacts"] });
      toast.success("Facial contact deleted");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Delete failed"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contact?.full_name || "Facial contact"}</SheetTitle>
          <SheetDescription>
            Everything captured from the scanned card, including the full Beauty Profile — fill in anything the card left blank.
          </SheetDescription>
        </SheetHeader>

        {isLoading || !contact ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {TEXT_FIELDS.map((f) => (
                <div key={f.key as string} className={f.wide ? "col-span-2" : ""}>
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    className="h-9"
                    type={f.type || "text"}
                    value={((draft as any)[f.key] ?? "") as string}
                    onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2 border-t">
              <h3 className="text-sm font-semibold">Beauty Profile</h3>
              <BeautyProfileFields value={profile} onChange={setProfile} />
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={4}
                value={draft.notes || ""}
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>

            {contact.raw_notes && (
              <div className="text-xs">
                <div className="font-semibold mb-1">Other handwriting captured</div>
                <div className="p-2 rounded border bg-muted/30 whitespace-pre-wrap">{contact.raw_notes}</div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 text-sm">
              {contact.event_id && (
                <Link to={`/events/${encodeURIComponent(contact.event_id)}`} className="text-primary hover:underline">
                  View linked event ({contact.event_id})
                </Link>
              )}
              {contact.converted_customer_id && (
                <Link to={`/customers/${contact.converted_customer_id}`} className="text-primary hover:underline">
                  View linked customer
                </Link>
              )}
              {contact.scan_pdf_url ? (
                <a href={contact.scan_pdf_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                  Open scan PDF <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">No Drive PDF on file for this scan.</span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this facial contact?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes {contact.full_name} from Facial Contacts. The Drive PDF backup stays in Google Drive.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
                {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save changes
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
