import Papa from "papaparse";
import type { Customer } from "./types";

// Destination fields the admin can map CSV columns to
export const DESTINATION_FIELDS = [
  { key: "full_name", label: "Full Name", required: false },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "address_line_1", label: "Address Line 1", required: false },
  { key: "address_line_2", label: "Address Line 2", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip", label: "Zip", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "birthday", label: "Birthday", required: false },
  { key: "birthday_mmdd", label: "Birthday (MM/DD)", required: false },
  { key: "source", label: "Source", required: false },
  { key: "last_contacted", label: "Last Contacted", required: false },
  { key: "next_follow_up_date", label: "Next Follow-Up Date", required: false },
  { key: "legacy_notes", label: "Legacy Notes / History", required: false },
] as const;

export type DestField = (typeof DESTINATION_FIELDS)[number]["key"];

export interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  mapped: Partial<Record<DestField, string>>;
  errors: string[];
  warnings: string[];
}

export interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errored: number;
  details: { rowIndex: number; status: "imported" | "updated" | "skipped" | "error"; reason?: string }[];
}

export type DuplicateMode = "skip" | "update" | "create_new";

// --- Parsing ---

export function parseCSV(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const headers = result.meta.fields || [];
        const rows = (result.data as Record<string, string>[]).map((r) => {
          const cleaned: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) {
            cleaned[k.trim()] = typeof v === "string" ? v.trim() : "";
          }
          return cleaned;
        });
        resolve({ headers, rows });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

// --- Auto-detect mapping ---

const HEADER_HINTS: Record<DestField, string[]> = {
  full_name: ["full_name", "fullname", "full name", "name", "customer name", "contact name"],
  first_name: ["first_name", "firstname", "first name", "first"],
  last_name: ["last_name", "lastname", "last name", "last", "surname"],
  email: ["email", "e-mail", "email address"],
  phone: ["phone", "telephone", "tel", "mobile", "cell", "phone number"],
  address_line_1: ["address_line_1", "address1", "address", "street", "street address"],
  address_line_2: ["address_line_2", "address2", "apt", "suite", "unit"],
  city: ["city", "town"],
  state: ["state", "state_territory", "province", "region", "st"],
  zip: ["zip", "postal_code", "zipcode", "zip code", "postal"],
  notes: ["notes", "note", "comments", "comment", "memo"],
  birthday: ["birthday", "birth_date", "birthdate", "dob", "date of birth"],
  birthday_mmdd: ["birthday_mmdd"],
  source: ["source", "lead source", "external_source"],
  last_contacted: ["last_contacted", "last contacted", "last contact", "last contact date", "last_contact_date", "contacted"],
  next_follow_up_date: ["next_follow_up_date", "next follow up", "next followup", "follow up date", "follow_up_date", "next follow-up"],
  legacy_notes: ["legacy_notes", "legacy notes", "history", "contact history", "activity log"],
};

export function autoMapHeaders(csvHeaders: string[]): Record<string, DestField | ""> {
  const mapping: Record<string, DestField | ""> = {};
  const used = new Set<DestField>();

  for (const header of csvHeaders) {
    const lower = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    let matched: DestField | "" = "";
    for (const [dest, hints] of Object.entries(HEADER_HINTS) as [DestField, string[]][]) {
      if (used.has(dest)) continue;
      for (const hint of hints) {
        if (lower === hint.replace(/[^a-z0-9]/g, "")) {
          matched = dest;
          break;
        }
      }
      if (matched) break;
    }
    if (matched) used.add(matched);
    mapping[header] = matched;
  }
  return mapping;
}

// --- Normalization & Validation ---

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone; // return as-is if non-standard
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Parse birthday string into { date: ISO date string, mmdd: MM/DD string } or null.
 * Supports MM/DD/YYYY, MM/DD/YY, YYYY-MM-DD, MM/DD, M/D/YYYY etc.
 */
export function parseBirthday(val: string): { date: string; mmdd: string } | null {
  const trimmed = val.trim();
  if (!trimmed) return null;

  // ISO format: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return { date: `${y}-${m}-${d}`, mmdd: `${m}/${d}` };
  }

  // MM/DD/YYYY or M/D/YYYY
  const fullMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (fullMatch) {
    const [, m, d, y] = fullMatch;
    return { date: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, mmdd: `${m.padStart(2, "0")}/${d.padStart(2, "0")}` };
  }

  // MM/DD/YY or M/D/YY
  const shortYearMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (shortYearMatch) {
    const [, m, d, yy] = shortYearMatch;
    const year = parseInt(yy, 10) > 50 ? `19${yy}` : `20${yy}`;
    return { date: `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, mmdd: `${m.padStart(2, "0")}/${d.padStart(2, "0")}` };
  }

  // MM/DD only (no year) — use 1900 as placeholder year
  const mmddMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (mmddMatch) {
    const [, m, d] = mmddMatch;
    return { date: `1900-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, mmdd: `${m.padStart(2, "0")}/${d.padStart(2, "0")}` };
  }

  return null; // unparseable
}

export function processRows(
  rows: Record<string, string>[],
  mapping: Record<string, DestField | "">
): ParsedRow[] {
  return rows.map((raw, i) => {
    const mapped: Partial<Record<DestField, string>> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    // Apply mapping
    for (const [csvCol, destField] of Object.entries(mapping)) {
      if (!destField || !raw[csvCol]) continue;
      mapped[destField] = raw[csvCol];
    }

    // Combine first_name + last_name into full_name if needed
    if (!mapped.full_name && (mapped.first_name || mapped.last_name)) {
      mapped.full_name = [mapped.first_name, mapped.last_name].filter(Boolean).join(" ").trim();
    }

    // Validate full_name
    if (!mapped.full_name?.trim()) {
      errors.push("Missing name — row will be skipped");
    }

    // Normalize email
    if (mapped.email) {
      mapped.email = mapped.email.toLowerCase().trim();
      if (!isValidEmail(mapped.email)) {
        warnings.push(`Invalid email: ${mapped.email}`);
        mapped.email = ""; // clear invalid email but allow import if name exists
      }
    }

    // Normalize phone
    if (mapped.phone) {
      mapped.phone = normalizePhone(mapped.phone.trim());
    }

    // Parse birthday
    if (mapped.birthday) {
      const parsed = parseBirthday(mapped.birthday.trim());
      if (parsed) {
        mapped.birthday = parsed.date;
        mapped.birthday_mmdd = parsed.mmdd;
      } else {
        warnings.push(`Could not parse birthday: "${mapped.birthday}"`);
        mapped.birthday = "";
      }
    }

    // Parse last_contacted date
    if (mapped.last_contacted) {
      const parsed = parseGenericDate(mapped.last_contacted.trim());
      if (parsed) {
        mapped.last_contacted = parsed;
      } else {
        warnings.push(`Could not parse last contacted date: "${mapped.last_contacted}"`);
        mapped.last_contacted = "";
      }
    }

    // Parse next_follow_up_date
    if (mapped.next_follow_up_date) {
      const parsed = parseGenericDate(mapped.next_follow_up_date.trim());
      if (parsed) {
        mapped.next_follow_up_date = parsed;
      } else {
        warnings.push(`Could not parse follow-up date: "${mapped.next_follow_up_date}"`);
        mapped.next_follow_up_date = "";
      }
    }

    return { rowIndex: i + 1, raw, mapped, errors, warnings };
  });
}

// --- Duplicate matching ---

export function findDuplicate(
  row: ParsedRow,
  existing: Customer[]
): Customer | null {
  const email = row.mapped.email?.toLowerCase();
  const phone = row.mapped.phone;
  const name = row.mapped.full_name?.toLowerCase();

  // Try email match first
  if (email) {
    const match = existing.find((c) => c.email?.toLowerCase() === email);
    if (match) return match;
  }
  // Try phone match
  if (phone) {
    const normalizedPhone = phone.replace(/\D/g, "");
    const match = existing.find((c) => c.phone?.replace(/\D/g, "") === normalizedPhone);
    if (match) return match;
  }
  // Try exact name match
  if (name) {
    const match = existing.find((c) => c.full_name.toLowerCase() === name);
    if (match) return match;
  }
  return null;
}

// --- Build customer record from mapped row ---

export function buildCustomerRecord(row: ParsedRow): Record<string, string | null> {
  const m = row.mapped;
  return {
    full_name: m.full_name?.trim() || "",
    email: m.email || null,
    phone: m.phone || null,
    address_line_1: m.address_line_1 || null,
    address_line_2: m.address_line_2 || null,
    city: m.city || null,
    state_territory: m.state || null,
    postal_code: m.zip || null,
    notes: m.notes || null,
    birthday: m.birthday || null,
    birthday_mmdd: m.birthday_mmdd || null,
    relationship_status: "Customer",
  } as any;
}
