import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sparkles, Pencil, Save, X } from "lucide-react";
import { updateCustomer } from "@/lib/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type BeautyNotes = {
  foundation_shade?: string;
  favorite_products?: string;
  skincare_routine?: string;
  color_preferences?: string;
  sensitivities?: string;
  general?: string;
};

const FIELDS: Array<{ key: keyof BeautyNotes; label: string; long?: boolean; placeholder: string }> = [
  { key: "foundation_shade", label: "Foundation Shade", placeholder: "e.g. Beige 3, Ivory 100" },
  { key: "favorite_products", label: "Favorite Products", long: true, placeholder: "e.g. TimeWise Repair, CC Cream" },
  { key: "skincare_routine", label: "Skincare Routine", long: true, placeholder: "Cleanser, serum, moisturizer..." },
  { key: "color_preferences", label: "Color Preferences", long: true, placeholder: "e.g. warm tones, red lipstick" },
  { key: "sensitivities", label: "Sensitivities / Avoid", long: true, placeholder: "e.g. fragrance, sensitive skin" },
  { key: "general", label: "General Notes", long: true, placeholder: "Anything else worth remembering" },
];

export default function BeautyNotesCard({ customerId, value }: { customerId: string; value: BeautyNotes | null | undefined }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BeautyNotes>(value || {});

  useEffect(() => {
    setDraft(value || {});
  }, [value, editing]);

  const save = useMutation({
    mutationFn: async (next: BeautyNotes) => {
      // strip empties
      const clean: BeautyNotes = {};
      (Object.keys(next) as Array<keyof BeautyNotes>).forEach((k) => {
        const v = (next[k] || "").trim();
        if (v) clean[k] = v;
      });
      return updateCustomer(customerId, { beauty_notes: clean } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Beauty Notes saved");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const hasAny = FIELDS.some((f) => (value?.[f.key] || "").trim());

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Beauty Notes
        </CardTitle>
        {editing ? (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.long ? "sm:col-span-2" : ""}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.label}</label>
                {f.long ? (
                  <Textarea
                    value={draft[f.key] || ""}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="min-h-[60px]"
                  />
                ) : (
                  <Input
                    value={draft[f.key] || ""}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        ) : !hasAny ? (
          <p className="text-sm text-muted-foreground">No beauty notes yet. Click Edit to add foundation shade, favorite products, skincare routine, and more.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {FIELDS.map((f) => {
              const v = (value?.[f.key] || "").trim();
              if (!v) return null;
              return (
                <div key={f.key} className={f.long ? "sm:col-span-2" : ""}>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</div>
                  <div className="whitespace-pre-wrap text-foreground">{v}</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
