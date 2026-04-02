import type { DestField, ParsedRow } from "./csvImport";
import type { Customer } from "./types";

export const FORCED_LAST_CONTACTED_COLUMN_INDEX = 23;

type CustomerImportRecord = Record<string, string | null>;
type LastContactedDecision = "applied" | "preserved" | "missing";

export function getForcedLastContactedHeader(headers: string[]): string | null {
  return headers[FORCED_LAST_CONTACTED_COLUMN_INDEX] ?? null;
}

export function applyForcedLastContactedMapping(
  headers: string[],
  mapping: Record<string, DestField | "">
): Record<string, DestField | ""> {
  const forcedHeader = getForcedLastContactedHeader(headers);
  if (!forcedHeader) return mapping;

  const nextMapping = { ...mapping };
  for (const header of headers) {
    if (header !== forcedHeader && nextMapping[header] === "last_contacted") {
      nextMapping[header] = "";
    }
  }
  nextMapping[forcedHeader] = "last_contacted";
  return nextMapping;
}

export function hasLastContactedWarning(row: ParsedRow): boolean {
  return row.warnings.some((warning) => warning.toLowerCase().includes("last contacted"));
}

export function planCustomerImportUpdate(existing: Customer, record: CustomerImportRecord): {
  updates: CustomerImportRecord;
  lastContactedDecision: LastContactedDecision;
} {
  const updates: CustomerImportRecord = {};
  let lastContactedDecision: LastContactedDecision = "missing";
  const existingRecord = existing as unknown as Record<string, string | null | undefined>;

  for (const [key, value] of Object.entries(record)) {
    if (key === "full_name" || value === null || value === "") continue;

    const existingValue = existingRecord[key];

    if (key === "last_contacted") {
      if (!existingValue || new Date(value).getTime() > new Date(existingValue).getTime()) {
        updates[key] = value;
        lastContactedDecision = "applied";
      } else {
        lastContactedDecision = "preserved";
      }
      continue;
    }

    if (existingValue === null || existingValue === undefined || existingValue === "") {
      updates[key] = value;
    }
  }

  return { updates, lastContactedDecision };
}