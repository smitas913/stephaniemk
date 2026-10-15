import { stripPhone } from "@/lib/phoneUtils";
import { birthdayMonthDay } from "@/lib/birthday";

export type ExportCustomer = {
  full_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  birthday_mmdd: string | null;
  tags: string[] | null;
};

export function splitName(full: string): { first: string; last: string } {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/** +1XXXXXXXXXX or null when not a valid 10-digit US number. */
export function toE164(phone: string | null | undefined): string | null {
  const d = stripPhone(phone);
  return d.length === 10 ? `+1${d}` : null;
}

export function birthdayMMDDSlash(c: ExportCustomer): string {
  const md = birthdayMonthDay(c);
  if (!md) return "";
  return `${String(md.month).padStart(2, "0")}/${String(md.day).padStart(2, "0")}`;
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildCustomersCsv(rows: ExportCustomer[]): string {
  const header = ["First Name", "Last Name", "Phone", "Email", "Birthday", "Tags"];
  const lines = [header.join(",")];
  for (const c of rows) {
    const { first, last } = splitName(c.full_name);
    lines.push(
      [first, last, toE164(c.phone) ?? "", (c.email || "").trim(), birthdayMMDDSlash(c), (c.tags || []).join("; ")]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

const vEsc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

export function buildCustomersVcf(rows: ExportCustomer[]): string {
  const out: string[] = [];
  for (const c of rows) {
    const { first, last } = splitName(c.full_name);
    out.push("BEGIN:VCARD", "VERSION:3.0", `FN:${vEsc(c.full_name.trim())}`, `N:${vEsc(last)};${vEsc(first)};;;`);
    const tel = toE164(c.phone);
    if (tel) out.push(`TEL;TYPE=CELL:${tel}`);
    if (c.email?.trim()) out.push(`EMAIL;TYPE=INTERNET:${vEsc(c.email.trim())}`);
    const full = (c.birthday || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(full)) out.push(`BDAY:${full}`);
    else {
      const md = birthdayMonthDay(c);
      if (md) out.push(`BDAY:--${String(md.month).padStart(2, "0")}-${String(md.day).padStart(2, "0")}`);
    }
    out.push("END:VCARD");
  }
  return out.join("\r\n") + "\r\n";
}

export function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
