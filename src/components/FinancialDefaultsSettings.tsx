import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchFinancialSettings, upsertFinancialSettings } from "@/lib/financialSettings";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";

export default function FinancialDefaultsSettings() {
  const [taxRate, setTaxRate] = useState("");
  const [ccFeeRate, setCcFeeRate] = useState("");
  const [profitMargin, setProfitMargin] = useState("50");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFinancialSettings().then((s) => {
      if (s) {
        setTaxRate(String(s.tax_rate ?? 0));
        setCcFeeRate(String(s.cc_fee_rate ?? 0));
        setProfitMargin(String(s.profit_margin_rate ?? 50));
      }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await upsertFinancialSettings({
        tax_rate: parseFloat(taxRate) || 0,
        cc_fee_rate: parseFloat(ccFeeRate) || 0,
        profit_margin_rate: parseFloat(profitMargin) || 0,
      });
      toast.success("Financial defaults saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          Financial Defaults
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Used to auto-calculate tax, credit card fees, and estimated net profit on every order.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 max-w-sm">
        <div className="space-y-1.5">
          <Label className="text-xs">Sales Tax (%)</Label>
          <Input type="number" step="0.01" min="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="e.g. 8.25" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Credit Card Fee (%)</Label>
          <Input type="number" step="0.01" min="0" value={ccFeeRate} onChange={(e) => setCcFeeRate(e.target.value)} placeholder="e.g. 3" />
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
