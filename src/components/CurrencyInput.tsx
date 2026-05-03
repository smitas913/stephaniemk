import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onValueChange: (raw: string) => void;
}

function formatCurrency(raw: string): string {
  const n = Number(raw);
  if (!raw || isNaN(n)) return "";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Numeric input that formats as currency on blur ($1,234.56) and shows raw digits while focused.
 * Storage value remains a plain numeric string ("1234.56") via onValueChange.
 */
const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, onFocus, onBlur, className, ...rest }, ref) => {
    const [focused, setFocused] = useState(false);
    const [draft, setDraft] = useState(value);

    useEffect(() => {
      if (!focused) setDraft(value);
    }, [value, focused]);

    const display = focused ? draft : formatCurrency(value);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          // Allow only digits + single decimal
          const cleaned = e.target.value.replace(/[^0-9.]/g, "");
          const parts = cleaned.split(".");
          const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
          setDraft(normalized);
          onValueChange(normalized);
        }}
        onFocus={(e) => {
          setFocused(true);
          setDraft(value);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          // Normalize trailing decimal/empty
          const n = Number(draft);
          if (draft && !isNaN(n)) onValueChange(String(n));
          onBlur?.(e);
        }}
        className={cn(className)}
        {...rest}
      />
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

export default CurrencyInput;
