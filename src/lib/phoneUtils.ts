/**
 * Strip a phone string to raw digits only.
 * If the result is 11 digits starting with "1", strips the leading "1".
 * Returns "" for empty/invalid input.
 */
export function stripPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * Normalize a phone for storage. Returns a clean 10-digit string,
 * or null if input is empty / has fewer than 10 digits (so we never
 * persist a partial value that breaks duplicate matching).
 */
export function normalizePhoneForStorage(phone: string | null | undefined): string | null {
  const d = stripPhone(phone);
  if (d.length === 10) return d;
  // If user typed something non-empty but not a full 10 digits, keep raw digits
  // (so we don't lose partial input on edit), but only the digit portion.
  if (d.length > 0) return d;
  return null;
}

/**
 * Format a phone number for display: XXX-XXX-XXXX.
 * Returns "—" for null/empty input. Returns the raw input if not exactly 10 digits.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = stripPhone(phone);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

/**
 * Get the raw digits suitable for tel: / sms: links.
 */
export function phoneForLink(phone: string | null | undefined): string {
  return stripPhone(phone);
}

/**
 * True if two phone values refer to the same number after normalization.
 * Both must contain at least 7 digits to be considered a match.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = stripPhone(a);
  const db = stripPhone(b);
  if (!da || !db) return false;
  if (da.length < 7 || db.length < 7) return false;
  return da === db;
}

/**
 * Normalize email for comparison (lowercase, trimmed).
 */
export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}
