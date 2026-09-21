// Reads a bank / credit card statement PDF and returns the outgoing transactions.
// The PDF is never stored — it is read in memory and discarded.
//
// Input:  { pdfBase64: string, mimeType?: string, categories: string[] }
// Output: { transactions: [{ date, merchant, amount, suggested_category }] }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ---- Auth (verify_jwt is off; validate in code) ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    if (!LOVABLE_API_KEY) return json({ error: "AI key not configured" }, 500);

    const body = (await req.json().catch(() => null)) as
      | { pdfBase64?: string; mimeType?: string; categories?: string[] }
      | null;

    const pdfBase64 = typeof body?.pdfBase64 === "string" ? body.pdfBase64 : "";
    if (!pdfBase64) return json({ error: "A statement PDF is required" }, 400);
    if (pdfBase64.length > 30_000_000) return json({ error: "That PDF is too large" }, 400);

    const categories = Array.isArray(body?.categories)
      ? body!.categories!.filter((c) => typeof c === "string" && c.length > 0 && c !== "Personal Use")
      : [];
    if (categories.length === 0) return json({ error: "Categories are required" }, 400);

    const mimeType = body?.mimeType || "application/pdf";
    const fileData = pdfBase64.startsWith("data:")
      ? pdfBase64
      : `data:${mimeType};base64,${pdfBase64}`;

    const systemPrompt = `You read bank and credit card statement PDFs and extract the transactions where money went OUT of the account.

Return ONLY a JSON object of this exact shape (no prose, no markdown):

{ "transactions": [ { "date": "YYYY-MM-DD", "merchant": string, "amount": number, "suggested_category": string } ] }

Rules:
- Include ONLY money going out: purchases, debits, fees, interest charges, withdrawals.
- EXCLUDE payments received, deposits, credits, refunds, returns, transfers between accounts, and any running/ending balance lines.
- "date" must be a full ISO date. Statements often print only month/day — infer the year from the statement period shown on the document (watch for periods that span a year boundary).
- "merchant" is the description exactly as printed on the statement (keep store numbers and city text).
- "amount" is always a POSITIVE number with no currency symbol or commas.
- Read every page. Do not merge or summarize transactions; one object per printed line.
- "suggested_category" MUST be one of these exact strings, character for character: ${JSON.stringify(categories)}
- Pick the best fit for the merchant. If you are unsure, use "Supplies". Never invent a category and never use "Personal Use".
- If the document has no readable transactions, return { "transactions": [] }.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the outgoing transactions from this statement. Return JSON only." },
              { type: "file", file: { filename: "statement.pdf", file_data: fileData } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 502;
      const message = status === 429
        ? "The AI is busy right now. Please wait a moment and try again."
        : status === 402
          ? "AI credits are used up. Add credits to keep importing statements."
          : "The statement couldn't be read. Please try again.";
      return json({ error: message }, status);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return json({ error: "The statement couldn't be read. Please try again." }, 502);
    }

    const allowed = new Set(categories);
    const transactions = (Array.isArray(parsed?.transactions) ? parsed.transactions : [])
      .map((t: any) => {
        const amount = Math.abs(Number(t?.amount));
        const date = typeof t?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : "";
        const merchant = typeof t?.merchant === "string" ? t.merchant.trim().slice(0, 300) : "";
        const suggested = typeof t?.suggested_category === "string" && allowed.has(t.suggested_category)
          ? t.suggested_category
          : "Supplies";
        if (!date || !merchant || !Number.isFinite(amount) || amount <= 0) return null;
        return { date, merchant, amount, suggested_category: suggested };
      })
      .filter(Boolean);

    return json({ transactions });
  } catch (err) {
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
