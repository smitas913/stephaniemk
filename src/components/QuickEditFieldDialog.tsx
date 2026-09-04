import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCustomer } from "@/lib/queries";
import { toast } from "sonner";
import { formatPhone } from "@/lib/phoneUtils";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { normalizeStateAbbreviation } from "@/lib/usStates";

import BirthdayInput from "@/components/BirthdayInput";
import { EMPTY_BIRTHDAY_VALUE, birthdayColumns, birthdayValueFromRecord, type BirthdayValue } from "@/lib/birthday";

export type QuickEditField = "phone" | "email" | "birthday" | "address";

interface Customer {
  id: string;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  birthday_mmdd?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_territory?: string | null;
  postal_code?: string | null;
}

interface Props {
  customer: Customer;
  field: QuickEditField | null;
  onClose: () => void;
}

const FIELD_TITLES: Record<QuickEditField, string> = {
  phone: "Add Phone",
  email: "Add Email",
  birthday: "Add Birthday",
  address: "Add Address",
};

export default function QuickEditFieldDialog({ customer, field, onClose }: Props) {
  const queryClient = useQueryClient();

  // Local state per field
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState<BirthdayValue>(EMPTY_BIRTHDAY_VALUE);
  const [addr, setAddr] = useState({
    address_line_1: "",
    address_line_2: "",
    city: "",
    state_territory: "",
    postal_code: "",
  });

  useEffect(() => {
    if (!field) return;
    setPhone(customer.phone ? formatPhone(customer.phone) : "");
    setEmail(customer.email || "");
    setBirthday(birthdayValueFromRecord({ birthday: customer.birthday, birthday_mmdd: customer.birthday_mmdd }));
    setAddr({
      address_line_1: customer.address_line_1 || "",
      address_line_2: customer.address_line_2 || "",
      city: customer.city || "",
      state_territory: customer.state_territory || "",
      postal_code: customer.postal_code || "",
    });
  }, [field, customer]);

  const mutation = useMutation({
    mutationFn: async () => {
      const updates: Record<string, any> = {};
      if (field === "phone") {
        const digits = phone.replace(/\D/g, "");
        updates.phone = digits || null;
      } else if (field === "email") {
        updates.email = email.trim() || null;
      } else if (field === "birthday") {
        Object.assign(updates, birthdayColumns(birthday));
      } else if (field === "address") {
        updates.address_line_1 = addr.address_line_1.trim() || null;
        updates.address_line_2 = addr.address_line_2.trim() || null;
        updates.city = addr.city.trim() || null;
        const st = normalizeStateAbbreviation(addr.state_territory);
        updates.state_territory = st || null;
        updates.postal_code = addr.postal_code.trim() || null;
      }
      return updateCustomer(customer.id, updates as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      toast.success("Updated!");
      onClose();
    },
    onError: (err: any) => toast.error(err?.message || "Failed to save"),
  });

  const open = field !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{field ? FIELD_TITLES[field] : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {field === "phone" && (
            <div className="space-y-1.5">
              <Label htmlFor="qe-phone">Phone</Label>
              <Input
                id="qe-phone"
                autoFocus
                inputMode="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
              />
            </div>
          )}

          {field === "email" && (
            <div className="space-y-1.5">
              <Label htmlFor="qe-email">Email</Label>
              <Input
                id="qe-email"
                autoFocus
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          {field === "birthday" && (
            <BirthdayInput value={birthday} onChange={setBirthday} />
          )}

          {field === "address" && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label>Street Address</Label>
                <AddressAutocomplete
                  value={addr.address_line_1}
                  onChange={(v) => setAddr((s) => ({ ...s, address_line_1: v }))}
                  onAddressSelect={(p) =>
                    setAddr((s) => ({
                      ...s,
                      address_line_1: p.street_address,
                      city: p.city,
                      state_territory: normalizeStateAbbreviation(p.state),
                      postal_code: p.zip_code,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qe-addr2">Apt / Suite</Label>
                <Input
                  id="qe-addr2"
                  value={addr.address_line_2}
                  onChange={(e) => setAddr((s) => ({ ...s, address_line_2: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="qe-city">City</Label>
                  <Input
                    id="qe-city"
                    value={addr.city}
                    onChange={(e) => setAddr((s) => ({ ...s, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qe-state">State</Label>
                  <Input
                    id="qe-state"
                    value={addr.state_territory}
                    onChange={(e) => setAddr((s) => ({ ...s, state_territory: e.target.value }))}
                    onBlur={(e) =>
                      setAddr((s) => ({ ...s, state_territory: normalizeStateAbbreviation(e.target.value) }))
                    }
                    maxLength={20}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qe-zip">ZIP</Label>
                <Input
                  id="qe-zip"
                  inputMode="numeric"
                  value={addr.postal_code}
                  onChange={(e) => setAddr((s) => ({ ...s, postal_code: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
