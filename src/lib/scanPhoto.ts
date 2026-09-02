// Shared helpers for the Scan Card / Scan Photo (Gemini vision) flow.
// Used by ScanPhotoDialog (existing customer), ScanCardDialog (new person),
// and the guest-to-customer conversion path in EventGuestPanel.

import { supabase } from "@/integrations/supabase/client";
import { createOrder, createCustomerNote, updateCustomer } from "@/lib/queries";
import { normalizeStateAbbreviation } from "@/lib/usStates";
import { SKIN_TYPES } from "@/lib/types";

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
    skin_type?: string | null;
    foundation_shade?: string | null;
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

/** Contact fields that live directly on `customers` / `facial_contacts`. */
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

/** Normalize an AI-guessed skin type onto the two supported options. */
export function normalizeSkinType(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  const exact = SKIN_TYPES.find((t) => t.toLowerCase() === s);
  if (exact) return exact;
  if (/oil|combo|combination/.test(s)) return "Combination to Oily";
  if (/dry|normal/.test(s)) return "Normal to Dry";
  return null;
}

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

/**
 * Run AI extraction over one or more images of the SAME card (front, then
 * optional back). Both sides are sent in a single pass so info on either side
 * is captured.
 */
export async function runScanExtract(input: File | Array<File | null | undefined>): Promise<Extracted> {
  const files = (Array.isArray(input) ? input : [input]).filter(Boolean) as File[];
  if (files.length === 0) throw new Error("No image to scan");
  const images = await Promise.all(
    files.map(async (f) => ({ base64: await fileToBase64(f), mimeType: f.type || "image/jpeg" })),
  );
  const { data, error } = await supabase.functions.invoke("scan-photo", { body: { images } });
  if (error) throw error;
  const ex = (data?.extracted || {}) as Extracted;
  if (ex.contact) ex.contact.skin_type = normalizeSkinType(ex.contact.skin_type);
  return ex;
}

// ---------------------------------------------------------------------------
// Combined front/back PDF + Google Drive backup
// ---------------------------------------------------------------------------

async function imagesToPdfBase64(files: File[]): Promise<string> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const isPng = (f.type || "").includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50);
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    // Letter-size page, image scaled to fit with a small margin
    const pageW = 612;
    const pageH = 792;
    const page = doc.addPage([pageW, pageH]);
    const margin = 24;
    const scale = Math.min((pageW - margin * 2) / img.width, (pageH - margin * 2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
  }
  const b64 = await doc.saveAsBase64();
  return b64;
}

export type DriveUploadResult = { url: string | null; error: string | null; needsSetup: boolean };

/**
 * Build a single PDF from the captured card images and upload it to the
 * "MK CRM Card Scans" Google Drive folder. Never throws — a Drive/PDF failure
 * must not block saving the person record.
 */
export async function uploadScanPdfToDrive(
  files: Array<File | null | undefined>,
  personName: string,
): Promise<DriveUploadResult> {
  const list = files.filter(Boolean) as File[];
  if (list.length === 0) return { url: null, error: null, needsSetup: false };
  try {
    const pdfBase64 = await imagesToPdfBase64(list);
    const safeName = (personName || "card").replace(/[^\w\s.-]/g, "").trim() || "card";
    const fileName = `${safeName} — ${todayISO()}.pdf`;
    const { data, error } = await supabase.functions.invoke("upload-scan-drive", {
      body: { pdfBase64, fileName },
    });
    if (error) {
      let details = error.message;
      let needsSetup = false;
      const ctx: any = (error as any).context;
      if (ctx?.text) {
        try {
          const txt = await ctx.text();
          const parsed = JSON.parse(txt);
          details = parsed?.error || txt;
          needsSetup = Boolean(parsed?.needsSetup);
        } catch {
          /* keep default message */
        }
      }
      return { url: null, error: details, needsSetup };
    }
    return { url: (data?.url as string) || null, error: null, needsSetup: false };
  } catch (e: any) {
    return { url: null, error: e?.message || "Could not build the scan PDF", needsSetup: false };
  }
}

// ---------------------------------------------------------------------------
// Storage of the raw image (existing behaviour, kept as a local backup)
// ---------------------------------------------------------------------------

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

async function uploadScanFiles(files: Array<File | null | undefined>, customerId: string): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    if (!f) continue;
    const p = await uploadScanFile(f, customerId);
    if (p) out.push(p);
  }
  return out;
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
 * Apply a scan to an EXISTING customer: contact resolutions, orders, scan note,
 * plus the combined front/back PDF backed up to Google Drive.
 */
export async function applyScanToExistingCustomer(opts: {
  customer: Record<string, any> & { id: string; full_name: string };
  /** Front image (legacy single-file callers). */
  file?: File | null;
  /** Front + optional back. Takes precedence over `file` when provided. */
  files?: Array<File | null | undefined>;
  extracted: Extracted;
  resolutions: Record<string, Resolution>;
  orderDrafts: OrderDraft[];
  eventId?: string | null;
  /** Optional edited skin type / foundation shade from the review screen. */
  skinType?: string | null;
  foundationShade?: string | null;
}): Promise<{ driveUrl: string | null; driveError: string | null; driveNeedsSetup: boolean }> {
  const { customer, extracted, resolutions, orderDrafts, eventId } = opts;
  const files = (opts.files ?? [opts.file]).filter(Boolean) as File[];

  const scanPaths = await uploadScanFiles(files, customer.id);
  const drive = await uploadScanPdfToDrive(files, customer.full_name);

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

  const skin = normalizeSkinType(opts.skinType);
  if (skin) updates.skin_type = skin;
  const shade = (opts.foundationShade ?? "").trim();
  if (shade) {
    updates.beauty_notes = { ...(customer.beauty_notes || {}), foundation_shade: shade };
  }
  if (drive.url) updates.scan_pdf_url = drive.url;

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
    `Scanned handwritten profile/order card (${files.length} image${files.length === 1 ? "" : "s"}).`,
    scanPaths.length > 0 ? `Scan stored at: ${scanPaths.join(", ")}` : null,
    drive.url ? `Drive PDF backup: ${drive.url}` : drive.error ? `Drive PDF backup unavailable: ${drive.error}` : null,
    created > 0 ? `Created ${created} order(s) (Unpaid — please review).` : null,
    conflictLines.length > 0 ? `Contact conflicts kept for review:\n- ${conflictLines.join("\n- ")}` : null,
    extracted.raw_notes ? `Additional handwriting:\n${extracted.raw_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  await createCustomerNote({ customer_id: customer.id, note_text: noteParts, note_type: "Scan" });

  return { driveUrl: drive.url, driveError: drive.error, driveNeedsSetup: Boolean(drive.needsSetup) };
}

/**
 * Contact fields, normalized + non-empty, ready to write on a NEW person.
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
 * After a NEW customer was just created from a scan, upload the images,
 * back up the combined PDF to Drive, create any included orders (optionally
 * linked to an event), and write a "Scan" audit note.
 */
export async function finalizeScanForNewCustomer(opts: {
  customerId: string;
  customerName: string;
  file?: File | null;
  files?: Array<File | null | undefined>;
  extracted: Extracted;
  orderDrafts: OrderDraft[];
  eventId?: string | null;
}): Promise<{ driveUrl: string | null; driveError: string | null; driveNeedsSetup: boolean }> {
  const files = (opts.files ?? [opts.file]).filter(Boolean) as File[];
  const scanPaths = await uploadScanFiles(files, opts.customerId);
  const drive = await uploadScanPdfToDrive(files, opts.customerName);
  if (drive.url) {
    await updateCustomer(opts.customerId, { scan_pdf_url: drive.url } as any);
  }
  const created = await createOrdersFromDrafts({
    customerId: opts.customerId,
    customerName: opts.customerName,
    drafts: opts.orderDrafts,
    eventId: opts.eventId,
  });
  const noteParts = [
    "Customer created from scanned profile/order card.",
    scanPaths.length > 0 ? `Scan stored at: ${scanPaths.join(", ")}` : null,
    drive.url ? `Drive PDF backup: ${drive.url}` : drive.error ? `Drive PDF backup unavailable: ${drive.error}` : null,
    created > 0 ? `Created ${created} order(s) (Unpaid — please review).` : null,
    opts.extracted.raw_notes ? `Additional handwriting:\n${opts.extracted.raw_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  await createCustomerNote({ customer_id: opts.customerId, note_text: noteParts, note_type: "Scan" });
  return { driveUrl: drive.url, driveError: drive.error, driveNeedsSetup: Boolean(drive.needsSetup) };
}
