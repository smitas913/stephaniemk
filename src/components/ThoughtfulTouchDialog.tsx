import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Mail, Gift, Phone, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNote, fetchCustomers } from "@/lib/queries";
import { toast } from "sonner";

export type TouchType = "Card" | "Gift" | "Check-in";
export type TouchOccasion = "Birthday" | "Sympathy" | "Congrats" | "Thinking of You" | "Other";

const TYPE_OPTIONS: { value: TouchType; label: string; icon: typeof Mail }[] = [
  { value: "Card", label: "Sent a Card", icon: Mail },
  { value: "Gift", label: "Gave a Gift", icon: Gift },
  { value: "Check-in", label: "Personal Check-In", icon: Phone },
];

const OCCASIONS: TouchOccasion[] = ["Birthday", "Sympathy", "Congrats", "Thinking of You", "Other"];

interface Props {
  open: boolean;
  onClose: () => void;
  /** When provided, customer is locked. */
  customerId?: string | null;
  customerName?: string | null;
  defaultType?: TouchType;
}

export default function ThoughtfulTouchDialog({ open, onClose, customerId, customerName, defaultType }: Props) {
  const qc = useQueryClient();
  const [type, setType] = useState<TouchType>(defaultType || "Card");
  const [occasion, setOccasion] = useState<TouchOccasion>("Thinking of You");
  const [notes, setNotes] = useState("");
  const [pickerCustomerId, setPickerCustomerId] = useState<string>(customerId || "");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setType(defaultType || "Card");
      setOccasion("Thinking of You");
      setNotes("");
      setPickerCustomerId(customerId || "");
      setSearch("");
    }
  }, [open, defaultType, customerId]);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
    enabled: open && !customerId,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return [] as typeof customers;
    const q = search.toLowerCase();
    return customers.filter((c) => c.full_name?.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, search]);

  const save = useMutation({
    mutationFn: async () => {
      const cid = pickerCustomerId;
      if (!cid) throw new Error("Choose a customer");
      const labels: Record<TouchType, string> = {
        "Card": "Sent a card",
        "Gift": "Gave a gift",
        "Check-in": "Personal check-in",
      };
      const body = `${labels[type]}${occasion ? ` — ${occasion}` : ""}${notes.trim() ? `\n${notes.trim()}` : ""}`;
      return createNote({
        entity_type: "Customer",
        customer_id: cid,
        person_id: cid,
        person_type: "customer",
        note_body: body,
        note_type: "Thoughtful Touch",
        tags: ["Thoughtful Touch", type, occasion],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-unified-notes"] });
      qc.invalidateQueries({ queryKey: ["unified-notes"] });
      qc.invalidateQueries({ queryKey: ["all-notes"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer", pickerCustomerId] });
      qc.invalidateQueries({ queryKey: ["thoughtful-touches"] });
      toast.success("Thoughtful touch logged 💗");
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Failed to log touch"),
  });

  const selectedCustomerName =
    customerName ||
    customers.find((c) => c.id === pickerCustomerId)?.full_name ||
    "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-600" /> Log a Thoughtful Touch
          </DialogTitle>
          <DialogDescription>Quick, no follow-up created.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Customer picker (only when not locked) */}
          {!customerId && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              {pickerCustomerId ? (
                <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-sm">
                  <span className="truncate">{selectedCustomerName}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setPickerCustomerId(""); setSearch(""); }}>Change</Button>
                </div>
              ) : (
                <>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers..." className="h-9" />
                  {filtered.length > 0 && (
                    <div className="rounded-md border border-border/50 max-h-40 overflow-y-auto">
                      {filtered.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted/50"
                          onClick={() => { setPickerCustomerId(c.id); setSearch(""); }}
                        >
                          {c.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Type chips */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-pink-600 bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300"
                        : "border-border/60 bg-background text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-3 h-3" /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Occasion chips */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Occasion</label>
            <div className="flex flex-wrap gap-1.5">
              {OCCASIONS.map((o) => {
                const active = occasion === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOccasion(o)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-background text-foreground hover:bg-muted/50"
                    )}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional note */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember about this touch..."
              className="min-h-[60px]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !pickerCustomerId}>
            Save Touch
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
