// Reads a bank / credit card statement PDF and returns its transactions.
// The PDF is never stored — it is read in memory and discarded. Contents are never logged.
//
// Input:  { pdfBase64: string, mimeType?: string, categories: string[],
//           statementType?: "bank" | "credit_card", incomeCategories?: string[] }
// Output: { transactions: [{ date, merchant, amount, suggested_category, direction }] }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const DEFAULT_INCOME_CATEGORIES = ["Commission", "Bonus", "Referral", "Product Sales", "Other"];

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
      | {
          pdfBase64?: string;
          mimeType?: string;
          categories?: string[];
          statementType?: string;
          incomeCategories?: string[];
        }
      | null;

    const pdfBase64 = typeof body?.pdfBase64 === "string" ? body.pdfBase64 : "";
    if (!pdfBase64) return json({ error: "A statement PDF is required" }, 400);
    if (pdfBase64.length > 30_000_000) return json({ error: "That PDF is too large" }, 400);

    const categories = Array.isArray(body?.categories)
      ? body!.categories!.filter((c) => typeof c === "string" && c.length > 0 && c !== "Personal Use")
      : [];
    if (categories.length === 0) return json({ error: "Categories are required" }, 400);

    const incomeCategories = Array.isArray(body?.incomeCategories) && body!.incomeCategories!.length > 0
      ? body!.incomeCategories!.filter((c) => typeof c === "string" && c.length > 0)
      : DEFAULT_INCOME_CATEGORIES;

    const isBank = body?.statementType === "bank";

    const mimeType = body?.mimeType || "application/pdf";
    const fileData = pdfBase64.startsWith("data:")
      ? pdfBase64
      : `data:${mimeType};base64,${pdfBase64}`;

    const outRules = `Money OUT items (direction "out"):
- Include purchases, debits, fees, interest charges, withdrawals, card payments to merchants.
- EXCLUDE transfers between the account holder's own accounts, refunds, returns, credits and any running/ending balance lines.
- "suggested_category" MUST be one of these exact strings, character for character: ${JSON.stringify(categories)}
- Pick the best fit for the merchant. If unsure, use "Supplies". Never invent a category and never use "Personal Use".`;

    const inRules = isBank
      ? `Money IN items (direction "in"):
- Include deposits, direct deposits, ACH credits, Zelle/Venmo/Cash App money received, cheques deposited, ATM cash deposits.
- EXCLUDE transfers between the account holder's own accounts, credit card payment reversals, and any running/ending balance lines.
- "suggested_category" MUST be one of these exact strings: ${JSON.stringify(incomeCategories)}
- If the description mentions "Mary Kay" (or MKC / Mary Kay Inc), use "Commission". Otherwise use "Product Sales".`
      : `Do NOT return any money IN items. This is a credit card statement: skip payments received, credits and refunds entirely.`;

    const systemPrompt = `You read bank and credit card statement PDFs and extract the printed transactions.

Return ONLY a JSON object of this exact shape (no prose, no markdown):

{ "transactions": [ { "date": "YYYY-MM-DD", "merchant": string, "amount": number, "suggested_category": string, "direction": "out" | "in" } ] }

${outRules}

${inRules}

General rules:
- "date" must be a full ISO date. Statements often print only month/day — infer the year from the statement period shown on the document (watch for periods that span a year boundary).
- "merchant" is the description exactly as printed on the statement (keep store numbers and city text).
- "amount" is always a POSITIVE number with no currency symbol or commas.
- Read every page. Do not merge or summarize transactions; one object per printed line.
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
              {
                type: "text",
                text: isBank
                  ? "Extract the transactions from this bank statement, both money out and money in. Return JSON only."
                  : "Extract the outgoing transactions from this statement. Return JSON only.",
              },
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

    const allowedOut = new Set(categories);
    const allowedIn = new Set(incomeCategories);
    const transactions = (Array.isArray(parsed?.transactions) ? parsed.transactions : [])
      .map((t: any) => {
        const amount = Math.abs(Number(t?.amount));
        const date = typeof t?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : "";
        const merchant = typeof t?.merchant === "string" ? t.merchant.trim().slice(0, 300) : "";
        const direction: "in" | "out" = isBank && t?.direction === "in" ? "in" : "out";
        const suggestedRaw = typeof t?.suggested_category === "string" ? t.suggested_category : "";
        const suggested = direction === "in"
          ? (allowedIn.has(suggestedRaw) ? suggestedRaw : "Product Sales")
          : (allowedOut.has(suggestedRaw) ? suggestedRaw : "Supplies");
        if (!date || !merchant || !Number.isFinite(amount) || amount <= 0) return null;
        return { date, merchant, amount, suggested_category: suggested, direction };
      })
      .filter(Boolean);

    return json({ transactions });
  } catch (err) {
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
