import { describe, expect, it } from "vitest";
import { findDuplicateEventGuest } from "./eventGuestDuplicate";

describe("event guest duplicates", () => {
  it("matches customer_id against converted_customer_id in both directions", () => {
    expect(findDuplicateEventGuest([{ name: "Existing", customer_id: "customer-1" }], { converted_customer_id: "customer-1" })?.name).toBe("Existing");
    expect(findDuplicateEventGuest([{ name: "Existing", converted_customer_id: "customer-1" }], { customer_id: "customer-1" })?.name).toBe("Existing");
  });
  it("matches consultant ids even if names differ", () => {
    expect(findDuplicateEventGuest([{ name: "Existing", consultant_id: "consultant-1" }], { name: "New", consultant_id: "consultant-1" })?.name).toBe("Existing");
  });
  it("matches digits-only phones across linked and manual guests with at least 7 digits", () => {
    expect(findDuplicateEventGuest([{ name: "Existing", converted_customer_id: "customer-1", phone: "(555) 123-4567" }], { name: "New", phone: "5551234567" })?.name).toBe("Existing");
    expect(findDuplicateEventGuest([{ phone: "123-4567" }], { phone: "1234567" })).toBeDefined();
    expect(findDuplicateEventGuest([{ phone: "123456" }], { phone: "123456" })).toBeUndefined();
  });
  it("matches lowercased emails regardless of link", () => {
    expect(findDuplicateEventGuest([{ name: "Existing", email: "PERSON@example.com" }], { consultant_id: "consultant-1", email: "person@example.com" })?.name).toBe("Existing");
  });
  it("matches trimmed case-insensitive names across linked and manual guests", () => {
    expect(findDuplicateEventGuest([{ name: " Lupe Ochoa ", converted_customer_id: "customer-1" }], { name: "lupe ochoa" })?.name).toBe(" Lupe Ochoa ");
    expect(findDuplicateEventGuest([{ name: "Lupe Ochoa" }], { name: " LUPE OCHOA ", consultant_id: "consultant-1" })).toBeDefined();
  });
  it("does not treat missing values or unrelated people as duplicates", () => {
    expect(findDuplicateEventGuest([{ name: "Existing", phone: null, email: null }], { name: "New" })).toBeUndefined();
    expect(findDuplicateEventGuest([], { name: "Existing" })).toBeUndefined();
  });
});