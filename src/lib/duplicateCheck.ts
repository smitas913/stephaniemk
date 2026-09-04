import { supabase } from "@/integrations/supabase/client";
import { stripPhone, normalizeEmail } from "./phoneUtils";

export type DuplicateMatch = {
  kind: "customer" | "consultant" | "prospect";
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  reason: "phone" | "email" | "name";
  extra?: { join_date?: string | null; date_added?: string | null; date_shared?: string | null };
};

export type DuplicateCheckResult = {
  strong: DuplicateMatch | null; // phone or email match — always prompt
  softName: DuplicateMatch | null; // name-only match — softer prompt
};

export type DupOpts = {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  /** Which table we're about to insert into. Match search covers BOTH tables regardless. */
  kind: "customer" | "consultant" | "prospect";
  excludeCustomerId?: string;
  excludeConsultantId?: string;
  excludeProspectId?: string;
  /** Opt-in: also search the prospects table (recruiting pipeline). */
  searchProspects?: boolean;
  /** Opt-in: search ONLY the prospects table. */
  prospectsOnly?: boolean;
};

function nameKey(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Search both customers and team_consultants for a match on:
 * - normalized phone digits (>=7 digits), or
 * - lowercased email, or
 * - case-insensitive full name (name-only = "soft" match).
 * Returns the first phone/email match (strong) and the first name-only match (soft).
 */
export async function checkForDuplicatePerson(opts: DupOpts): Promise<DuplicateCheckResult> {
  const phoneDigits = stripPhone(opts.phone);
  const emailNorm = normalizeEmail(opts.email);
  const nameNorm = nameKey(opts.fullName);

  let strong: DuplicateMatch | null = null;
  let softName: DuplicateMatch | null = null;

  const searchPeople = !opts.prospectsOnly;
  const searchProspects = !!opts.searchProspects || !!opts.prospectsOnly;

  const [{ data: customers }, { data: consultants }, { data: prospects }] = await Promise.all([
    searchPeople
      ? supabase.from("customers").select("id, full_name, phone, email, date_added").limit(5000)
      : Promise.resolve({ data: [] as any[] }),
    searchPeople
      ? supabase.from("team_consultants").select("id, name, phone, email, join_date").limit(5000)
      : Promise.resolve({ data: [] as any[] }),
    searchProspects
      ? supabase.from("prospects").select("id, name, phone, email, date_shared").limit(5000)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const consider = (m: DuplicateMatch) => {
    if (m.reason === "name") {
      if (!softName) softName = m;
    } else {
      if (!strong) strong = m;
    }
  };

  for (const c of customers || []) {
    if (opts.excludeCustomerId && (c as any).id === opts.excludeCustomerId) continue;
    const cp = stripPhone((c as any).phone);
    const ce = normalizeEmail((c as any).email);
    const cn = nameKey((c as any).full_name);
    const base = {
      kind: "customer" as const,
      id: (c as any).id,
      name: (c as any).full_name,
      phone: (c as any).phone,
      email: (c as any).email,
      extra: { date_added: (c as any).date_added },
    };
    if (phoneDigits && cp && phoneDigits.length >= 7 && cp === phoneDigits) consider({ ...base, reason: "phone" });
    else if (emailNorm && ce && ce === emailNorm) consider({ ...base, reason: "email" });
    else if (nameNorm && cn && nameNorm === cn && nameNorm.length > 2) consider({ ...base, reason: "name" });
  }

  for (const c of consultants || []) {
    if (opts.excludeConsultantId && (c as any).id === opts.excludeConsultantId) continue;
    const cp = stripPhone((c as any).phone);
    const ce = normalizeEmail((c as any).email);
    const cn = nameKey((c as any).name);
    const base = {
      kind: "consultant" as const,
      id: (c as any).id,
      name: (c as any).name,
      phone: (c as any).phone,
      email: (c as any).email,
      extra: { join_date: (c as any).join_date },
    };
    if (phoneDigits && cp && phoneDigits.length >= 7 && cp === phoneDigits) consider({ ...base, reason: "phone" });
    else if (emailNorm && ce && ce === emailNorm) consider({ ...base, reason: "email" });
    else if (nameNorm && cn && nameNorm === cn && nameNorm.length > 2) consider({ ...base, reason: "name" });
  }

  return { strong, softName };
}

/** Fill empty fields on an existing record from fresh info. Never overwrites non-empty values. */
export async function fillEmptyFieldsFromNew(
  match: DuplicateMatch,
  fresh: { phone?: string | null; email?: string | null; [k: string]: any }
) {
  const table = match.kind === "customer" ? "customers" : "team_consultants";
  const updates: Record<string, any> = {};
  const skipKeys = new Set(["id", "kind", "reason", "extra", "name", "full_name"]);
  const allowedKeys = [
    "phone", "email", "birthday", "birthday_mmdd",
    "address_line_1", "address_line_2", "city", "state_territory", "postal_code",
    "notes",
  ];
  for (const k of allowedKeys) {
    const val = (fresh as any)[k];
    if (val === undefined || val === null || val === "") continue;
    if ((match as any)[k]) continue; // never overwrite
    if (skipKeys.has(k)) continue;
    updates[k] = val;
  }
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from(table as any).update(updates as any).eq("id", match.id);
  if (error) throw error;
}
