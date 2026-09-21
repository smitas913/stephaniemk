// Reads a photo of a receipt and returns the merchant, date, total and a
// suggested expense category. The image is never stored — it is read in memory
// and discarded. Receipt contents are never logged.
//
// Input:  { imageBase64: string, mimeType?: string, categories: string[] }
// Output: { merchant, date (YYYY-MM-DD | null), amount (number | null), suggested_category }

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
      | { imageBase64?: string; mimeType?: string; categories?: string[] }
      | null;

    const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
    if (!imageBase64) return json({ error: "A receipt photo is required" }, 400);
    if (imageBase64.length > 20_000_000) return json({ error: "That photo is too large" }, 400);

    const categories = Array.isArray(body?.categories)
      ? body!.categories!.filter((c) => typeof c === "string" && c.length > 0 && c !== "Personal Use")
      : [];
    if (categories.length === 0) return json({ error: "Categories are required" }, 400);

    const mimeType = body?.mimeType || "image/jpeg";
    const imageUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType};base64,${imageBase64}`;

    const currentYear = new Date().getFullYear();

    const systemPrompt = `You read photos of store receipts and extract the key details.

Return ONLY a JSON object of this exact shape (no prose, no markdown):

{ "merchant": string, "date": string | null, "amount": number | null, "suggested_category": string, "readable": boolean }

Rules:
- "merchant" is the business name printed on the receipt. Use "" if you cannot read it.
- "date" is a full ISO date (YYYY-MM-DD). If only month and day are printed, assume the year ${currentYear}. If no date is printed at all, use null.
- "amount" is the TOTAL actually paid (grand total including tax and tip), as a POSITIVE number with no currency symbol or commas. Use null if you cannot read a total.
- "suggested_category" MUST be one of these exact strings, character for character: ${JSON.stringify(categories)}
- Pick the best fit for the merchant. If you are unsure, use "Supplies". Never invent a category and never use "Personal Use".
- "readable" is false if the image is too blurry to read or is clearly not a receipt.`;

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
              { type: "text", text: "Extract the merchant, date, total and category from this receipt. Return JSON only." },
              { type: "image_url", image_url: { url: imageUrl } },
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
          ? "AI credits are used up. Add credits to keep scanning receipts."
          : "The receipt couldn't be read. Please try again.";
      return json({ error: message }, status);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return json({ error: "The receipt couldn't be read. Please try again." }, 502);
    }

    const allowed = new Set(categories);
    const amountNum = Math.abs(Number(parsed?.amount));
    const date = typeof parsed?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
    const merchant = typeof parsed?.merchant === "string" ? parsed.merchant.trim().slice(0, 300) : "";
    const suggested_category =
      typeof parsed?.suggested_category === "string" && allowed.has(parsed.suggested_category)
        ? parsed.suggested_category
        : "Supplies";

    return json({
      merchant,
      date,
      amount: Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null,
      suggested_category,
      readable: parsed?.readable !== false && (!!merchant || !!date || Number.isFinite(amountNum)),
    });
  } catch (err) {
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
