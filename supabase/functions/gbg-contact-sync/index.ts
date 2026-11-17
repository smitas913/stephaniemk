import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function normDate(v: string): string | null {
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders }); }

  const expected = (Deno.env.get("GBG_SYNC_SECRET") ?? "").trim();
  const rawTop = body?.sync_secret, rawCd = body?.customData?.sync_secret;
  const hasCd = rawCd !== undefined && rawCd !== null && rawCd !== "";
  const hasTop = rawTop !== undefined && rawTop !== null && rawTop !== "";
  const rawProvided = hasCd ? String(rawCd) : hasTop ? String(rawTop) : "";
  const cleanSecret = (v: string) => {
    let t = v.trim();
    if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) t = t.slice(1, -1).trim();
    return t;
  };
  const provided = cleanSecret(rawProvided);
  if (!expected || !provided || !safeEqual(provided, expected)) {
    // TEMPORARY DIAGNOSTIC: key names and boolean flags only, never secret values or lengths.
    try {
      const sbDiag = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const topKeys = body && typeof body === "object" ? Object.keys(body).join(", ") : "(not an object)";
      const cd = body?.customData;
      const cdKeys = cd && typeof cd === "object" ? Object.keys(cd).join(", ") : "(no customData)";
      const where = hasCd && hasTop ? "both (customData used)" : hasCd ? "customData" : hasTop ? "top level" : "missing";
      const ws = rawProvided !== rawProvided.trim();
      const t = rawProvided.trim();
      const quoted = t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")));
      const detail = `401 diagnostic | top-level keys: ${topKeys || "(none)"} | customData keys: ${cdKeys || "(none)"} | sync_secret: ${where} | leading/trailing whitespace: ${ws ? "yes" : "no"} | wrapping quotes: ${quoted ? "yes" : "no"} | server secret set: ${expected ? "yes" : "no"}`;
      await sbDiag.from("gbg_sync_log").insert({ ghl_contact_id: null, contact_name: null, action: "error", detail, customer_id: null });
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const contactId = str(body.contact_id) || str(body.id);
  const first = str(body.first_name), last = str(body.last_name);
  const fullName = str(body.full_name) || `${first} ${last}`.trim();
  const log = (action: string, detail: string, customer_id: string | null = null) =>
    sb.from("gbg_sync_log").insert({ ghl_contact_id: contactId || null, contact_name: fullName || null, action, detail, customer_id });

  try {
    const rawTags = body.tags;
    const tags: string[] = (Array.isArray(rawTags) ? rawTags : str(rawTags).split(","))
      .map((t: unknown) => str(t).toLowerCase()).filter(Boolean);
    if (!tags.includes("client")) {
      await log("skipped_not_client", `Tags: ${tags.join(", ") || "none"}`);
      return json({ ok: true, action: "skipped_not_client" });
    }

    const email = str(body.email).toLowerCase();
    const digits = str(body.phone).replace(/\D/g, "");
    const phone = digits.length >= 10 ? digits.slice(-10) : "";
    const fields: Record<string, string> = {};
    if (fullName) fields.full_name = fullName;
    if (email) fields.email = email;
    if (phone) fields.phone = phone;
    if (str(body.address1)) fields.address_line_1 = str(body.address1);
    if (str(body.city)) fields.city = str(body.city);
    if (str(body.state)) fields.state_territory = str(body.state);
    if (str(body.postal_code)) fields.postal_code = str(body.postal_code);
    const bday = normDate(str(body.date_of_birth));
    if (bday) fields.birthday = bday;

    let match: { id: string; full_name: string } | null = null;
    if (contactId) {
      const { data, error } = await sb.from("customers").select("id, full_name").eq("ghl_contact_id", contactId).limit(1);
      if (error) throw error;
      match = data?.[0] ?? null;
    }
    const tryStep = async (col: string, val: string, ilike: boolean) => {
      let q = sb.from("customers").select("id, full_name");
      q = ilike ? q.ilike(col, val.replace(/[%_\\]/g, "\\$&")) : q.eq(col, val);
      const { data, error } = await q.limit(10);
      if (error) throw error;
      return data ?? [];
    };
    for (const [col, val, ilike] of [["email", email, true], ["phone", phone, false]] as const) {
      if (match || !val) continue;
      const rows = await tryStep(col, val, ilike);
      if (rows.length > 1) {
        await log("skipped_ambiguous", `Multiple customers match by ${col}: ${rows.map((r) => r.full_name).join(", ")}`);
        return json({ ok: true, action: "skipped_ambiguous" });
      }
      if (rows.length === 1) match = rows[0];
    }

    const now = new Date().toISOString();
    if (match) {
      const { error } = await sb.from("customers")
        .update({ ...fields, ...(contactId ? { ghl_contact_id: contactId } : {}), ghl_synced_at: now })
        .eq("id", match.id);
      if (error) throw error;
      await log("updated", `Updated: ${Object.keys(fields).join(", ") || "no fields"}`, match.id);
      return json({ ok: true, action: "updated", customer_id: match.id });
    }

    if (!fields.full_name) {
      await log("error", "No name provided; cannot create customer");
      return json({ ok: false, action: "error" });
    }
    const { data: owner } = await sb.from("profiles").select("id").eq("role", "owner").eq("is_active", true).limit(1);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const { data: created, error } = await sb.from("customers").insert({
      ...fields,
      ghl_contact_id: contactId || null,
      ghl_synced_at: now,
      relationship_status: "Customer",
      customer_source: "GBG",
      date_added: today,
      owner_user_id: owner?.[0]?.id ?? null,
    }).select("id").single();
    if (error) throw error;
    await log("created", "New customer from GBG", created.id);
    return json({ ok: true, action: "created", customer_id: created.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message ?? String(e);
    console.error("gbg-contact-sync error:", msg);
    try { await log("error", msg); } catch { /* ignore */ }
    return json({ ok: false, action: "error" });
  }
});
