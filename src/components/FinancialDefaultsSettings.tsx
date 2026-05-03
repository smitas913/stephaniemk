import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  fetchFinancialSettings,
  upsertFinancialSettings,
  PROCESSOR_PRESETS,
  type PaymentProcessor,
} from "@/lib/financialSettings";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const PROCESSORS: PaymentProcessor[] = ["Square", "Stripe", "PayPal", "Custom"];

export default function FinancialDefaultsSettings() {
  const [taxRate, setTaxRate] = useState("");
  const [profitMargin, setProfitMargin] = useState("50");
  const [processor, setProcessor] = useState<PaymentProcessor>("Custom");
  const [inPct, setInPct] = useState("0");
  const [inFlat, setInFlat] = useState("0");
  const [onPct, setOnPct] = useState("0");
  const [onFlat, setOnFlat] = useState("0");
  const [keyPct, setKeyPct] = useState("0");
  const [keyFlat, setKeyFlat] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFinancialSettings().then((s) => {
      if (!s) return;
      setTaxRate(String(s.tax_rate ?? 0));
      setProfitMargin(String(s.profit_margin_rate ?? 50));
      setProcessor((s.payment_processor as PaymentProcessor) || "Custom");
      setInPct(String(s.fee_in_person_pct ?? 0));
      setInFlat(String(s.fee_in_person_flat ?? 0));
      setOnPct(String(s.fee_online_pct ?? 0));
      setOnFlat(String(s.fee_online_flat ?? 0));
      setKeyPct(String(s.fee_keyed_pct ?? 0));
      setKeyFlat(String(s.fee_keyed_flat ?? 0));
    });
  }, []);

  const applyPreset = (p: PaymentProcessor) => {
    setProcessor(p);
    if (p === "Custom") return;
    const preset = PROCESSOR_PRESETS[p];
    setInPct(String(preset.in_person_pct));
    setInFlat(String(preset.in_person_flat));
    setOnPct(String(preset.online_pct));
    setOnFlat(String(preset.online_flat));
    setKeyPct(String(preset.keyed_pct));
    setKeyFlat(String(preset.keyed_flat));
  };

  const save = async () => {
    setSaving(true);
    try {
      const inPctN = parseFloat(inPct) || 0;
      await upsertFinancialSettings({
        tax_rate: parseFloat(taxRate) || 0,
        profit_margin_rate: parseFloat(profitMargin) || 0,
        payment_processor: processor,
        fee_in_person_pct: inPctN,
        fee_in_person_flat: parseFloat(inFlat) || 0,
        fee_online_pct: parseFloat(onPct) || 0,
        fee_online_flat: parseFloat(onFlat) || 0,
        fee_keyed_pct: parseFloat(keyPct) || 0,
        fee_keyed_flat: parseFloat(keyFlat) || 0,
        // Keep legacy single % roughly in sync as a fallback for older code paths.
        cc_fee_rate: inPctN,
      } as any);
      toast.success("Financial defaults saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const FeeRow = ({ label, pct, setPct, flat, setFlat }: {
    label: string; pct: string; setPct: (v: string) => void; flat: string; setFlat: (v: string) => void;
  }) => (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1">
        <Input type="number" step="0.01" min="0" value={pct} onChange={(e) => setPct(e.target.value)} className="h-8 w-20 text-xs" />
        <span className="text-[11px] text-muted-foreground">%</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">+ $</span>
        <Input type="number" step="0.01" min="0" value={flat} onChange={(e) => setFlat(e.target.value)} className="h-8 w-20 text-xs" />
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          Financial Defaults
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Used to auto-calculate tax, processing fees, and estimated net profit on every order.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 max-w-md">
        <div className="space-y-1.5">
          <Label className="text-xs">Sales Tax (%)</Label>
          <Input type="number" step="0.01" min="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="e.g. 8.25" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Payment Processor</Label>
          <div className="flex flex-wrap gap-1.5">
            {PROCESSORS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "h-8 px-3 rounded-md text-xs font-medium border transition-colors",
                  processor === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Selecting a processor fills in standard fees. You can override any value below.
          </p>
        </div>

        <div className="space-y-2 rounded-md border border-border/60 p-3 bg-muted/20">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Transaction Type</span>
            <span className="text-center w-20">Percent</span>
            <span className="text-center w-24">Flat / txn</span>
          </div>
          <FeeRow label="In-person card" pct={inPct} setPct={setInPct} flat={inFlat} setFlat={setInFlat} />
          <FeeRow label="Online / invoice" pct={onPct} setPct={setOnPct} flat={onFlat} setFlat={setOnFlat} />
          <FeeRow label="Manually entered" pct={keyPct} setPct={setKeyPct} flat={keyFlat} setFlat={setKeyFlat} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Default Profit Margin (%)</Label>
          <Input type="number" step="0.1" min="0" max="100" value={profitMargin} onChange={(e) => setProfitMargin(e.target.value)} placeholder="50" />
          <p className="text-[11px] text-muted-foreground">Estimated profit = Net Revenue × this margin. Mary Kay default is 50%.</p>
        </div>

        <Button onClick={save} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save Defaults"}
        </Button>
      </CardContent>
    </Card>
  );
}
