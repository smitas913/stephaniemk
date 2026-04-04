/**
 * Strip a phone string to raw digits only.
 * If the result is 11 digits starting with "1", strips the leading "1".
 */
export function stripPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * Format a phone number for display: (XXX) XXX-XXXX.
 * Returns the raw input if not exactly 10 digits after stripping.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = stripPhone(phone);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

/**
 * Get the raw digits suitable for tel: / sms: links.
 */
export function phoneForLink(phone: string | null | undefined): string {
  return stripPhone(phone);
}
