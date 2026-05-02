import { useQuery } from "@tanstack/react-query";
import { fetchCustomers } from "@/lib/queries";
import type { Customer } from "@/lib/types";

export type IncompleteReason = "phone" | "email" | "address";

export interface IncompleteSummary {
  customers: Customer[];
  flagged: Customer[];
  incomplete: Customer[]; // missing phone/email/address
  totalToComplete: number;
  isLoading: boolean;
}

function isAddressMissing(c: Customer): boolean {
  return !(c.address_line_1?.trim());
}

export function isIncomplete(c: Customer): boolean {
  if (c.is_active === false) return false;
  return !c.phone?.trim() || !c.email?.trim() || isAddressMissing(c);
}

export function getMissingReasons(c: Customer): IncompleteReason[] {
  const out: IncompleteReason[] = [];
  if (!c.phone?.trim()) out.push("phone");
  if (!c.email?.trim()) out.push("email");
  if (isAddressMissing(c)) out.push("address");
  return out;
}

export function useIncompleteItems(): IncompleteSummary {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });

  const active = customers.filter((c) => c.is_active !== false);
  const flagged = active.filter((c) => (c as any).needs_attention === true);
  const incomplete = active.filter((c) => isIncomplete(c));

  // Combined unique count
  const ids = new Set<string>();
  flagged.forEach((c) => ids.add(c.id));
  incomplete.forEach((c) => ids.add(c.id));

  return {
    customers: active,
    flagged,
    incomplete,
    totalToComplete: ids.size,
    isLoading,
  };
}
