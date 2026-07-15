// Shared helpers for the Scan Photo (Gemini vision) flow.
// Used by ScanPhotoDialog (existing customer) and the guest-to-customer
// conversion path in EventGuestPanel (new customer + optional order).

import { supabase } from "@/integrations/supabase/client";
import { createOrder, createCustomerNote, updateCustomer } from "@/lib/queries";
import { normalizeStateAbbreviation } from "@/lib/usStates";

export type Extracted = {
  contact?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state_territory?: string | null;
    postal_code?: string | null;
    birthday?: string | null;
  };
  orders?: Array<{
    order_date?: string | null;
    items?: Array<{ description?: string; amount?: number | null }>;
    subtotal?: number | null;
    tax?: number | null;
    total?: number | null;
    notes?: string | null;
  }>;
  raw_notes?: string | null;
};

export type Resolution = "keep" | "replace" | "both";

export type OrderDraft = {
  order_date: string;
  itemsText: string;
  total: string;
  notes: string;
  include: boolean;
};

export const CONTACT_FIELDS: Array<{
  key: keyof NonNullable<Extracted["contact"]>;
  label: string;
  normalize?: (v: string) => string;
}> = [
  { key: "full_name", label: "Full name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address_line_1", label: "Address line 1" },
  { key: "address_line_2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "state_territory", label: "State", normalize: (v) => normalizeStateAbbreviation(v) || v },
  { key: "postal_code", label: "ZIP" },
  { key: "birthday", label: "Birthday" },
];

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function itemsToText(items?: Array<{ description?: string; amount?: number | null }>) {
  if (!items || items.length === 0) return "";
  return items
    .map((i) => {
      const desc = (i.description || "").trim();
      const amt = i.amount != null ? ` — $${Number(i.amount).toFixed(2)}` : "";
      return desc ? `${desc}${amt}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function orderDraftsFromExtracted(ex: Extracted): OrderDraft[] {
  return (ex.orders ?? []).map((o) => ({
    order_date: o.order_date || todayISO(),
    itemsText: itemsToText(o.items),
    total: o.total != null ? String(o.total) : o.subtotal != null ? String(o.subtotal) : "",
    notes: o.notes || "",
    include: true,
  }));
}

export async function runScanExtract(file: File): Promise<Extracted> {
  const base64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("scan-photo", {
    body: { imageBase64: base64, mimeType: file.type || "image/jpeg" },
  });
  if (error) throw error;
  return (data?.extracted || {}) as Extracted;
}

async function uploadScanFile(file: File, customerId: string): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${uid}/${customerId}/${Date.now()}.${ext}`;
  const up = await supabase.storage
    .from("customer-scans")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (up.error) return null;
  return path;
}

async function createOrdersFromDrafts(opts: {
  customerId: string;
  customerName: string;
  drafts: OrderDraft[];
  eventId?: string | null;
}): Promise<number> {
  let created = 0;
  for (const o of opts.drafts) {
    if (!o.include) continue;
    const totalNum = parseFloat(o.total);
    if (!isFinite(totalNum) || totalNum <= 0) continue;
    const notes = [o.itemsText.trim(), o.notes.trim()].filter(Boolean).join("\n\n");
    await createOrder({
      customer_id: opts.customerId,
      customer_name: opts.customerName,
      order_date: o.order_date || todayISO(),
      retail_amount: totalNum,
      payment_status: "Unpaid",
      notes: notes || undefined,
      ...(opts.eventId ? { event_id: opts.eventId } : {}),
    });
    created += 1;
  }
  return created;
}

/**
 * Apply a scan to an EXISTING customer: contact resolutions, orders, scan note.
 */
export async function applyScanToExistingCustomer(opts: {
  customer: Record<string, any> & { id: string; full_name: string };
  file: File | null;
  extracted: Extracted;
  resolutions: Record<string, Resolution>;
  orderDrafts: OrderDraft[];
  eventId?: string | null;
}): Promise<void> {
  const { customer, file, extracted, resolutions, orderDrafts, eventId } = opts;

  const scanPath = file ? await uploadScanFile(file, customer.id) : null;

  const updates: Record<string, unknown> = {};
  const conflictLines: string[] = [];
  for (const f of CONTACT_FIELDS) {
    const incomingRaw = extracted.contact?.[f.key];
    if (!incomingRaw) continue;
    const incoming = f.normalize ? f.normalize(String(incomingRaw)) : String(incomingRaw);
    const r = resolutions[f.key] || "keep";
    if (r === "replace") updates[f.key as string] = incoming;
    else if (r === "both") {
      const existing = (customer[f.key as string] ?? "") as string;
      if (!existing) updates[f.key as string] = incoming;
      conflictLines.push(`${f.label}: existing "${existing || "(empty)"}" | scanned "${incoming}"`);
    }
  }
  if (Object.keys(updates).length > 0) {
    await updateCustomer(customer.id, updates as any);
  }

  const created = await createOrdersFromDrafts({
    customerId: customer.id,
    customerName: customer.full_name,
    drafts: orderDrafts,
    eventId,
  });

  const noteParts = [
    "Scanned handwritten profile/order card.",
    scanPath ? `Scan stored at: ${scanPath}` : null,
    created > 0 ? `Created ${created} order(s) (Unpaid — please review).` : null,
    conflictLines.length > 0 ? `Contact conflicts kept for review:\n- ${conflictLines.join("\n- ")}` : null,
    extracted.raw_notes ? `Additional handwriting:\n${extracted.raw_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  await createCustomerNote({ customer_id: customer.id, note_text: noteParts, note_type: "Scan" });
}

/**
 * Contact fields, normalized + non-empty, ready to write on a NEW customer.
 * Caller controls which fields to overwrite from seed values (e.g. guest name/phone).
 */
export function contactFieldsForNewCustomer(extracted: Extracted): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of CONTACT_FIELDS) {
    const raw = extracted.contact?.[f.key];
    if (!raw) continue;
    const val = f.normalize ? f.normalize(String(raw)) : String(raw).trim();
    if (val) out[f.key as string] = val;
  }
  return out;
}

/**
 * After a NEW customer was just created from a scan, upload the image,
 * create any included orders (optionally linked to an event), and write
 * a "Scan" audit note.
 */
export async function finalizeScanForNewCustomer(opts: {
  customerId: string;
  customerName: string;
  file: File | null;
  extracted: Extracted;
  orderDrafts: OrderDraft[];
  eventId?: string | null;
}): Promise<void> {
  const scanPath = opts.file ? await uploadScanFile(opts.file, opts.customerId) : null;
  const created = await createOrdersFromDrafts({
    customerId: opts.customerId,
    customerName: opts.customerName,
    drafts: opts.orderDrafts,
    eventId: opts.eventId,
  });
  const noteParts = [
    "Customer created from scanned profile/order card.",
    scanPath ? `Scan stored at: ${scanPath}` : null,
    created > 0 ? `Created ${created} order(s) (Unpaid — please review).` : null,
    opts.extracted.raw_notes ? `Additional handwriting:\n${opts.extracted.raw_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  await createCustomerNote({ customer_id: opts.customerId, note_text: noteParts, note_type: "Scan" });
}
