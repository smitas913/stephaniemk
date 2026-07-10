// Extracts contact info and order details from a photo of a handwritten
// profile card or order form using Lovable AI (Gemini vision).
// Input: { imageBase64: string, mimeType?: string }
// Output: { extracted: {...} }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const SYSTEM_PROMPT = `You extract structured customer profile and order data from photos of handwritten profile cards, order forms, or contact cards.

Return ONLY a JSON object matching this exact TypeScript type (no prose, no markdown):

{
  "contact": {
    "full_name": string | null,
    "phone": string | null,         // digits only, US 10-digit if present
    "email": string | null,
    "address_line_1": string | null,
    "address_line_2": string | null,
    "city": string | null,
    "state_territory": string | null, // 2-letter US state code if possible
    "postal_code": string | null,
    "birthday": string | null       // ISO YYYY-MM-DD if year is legible, else null
  },
  "orders": [
    {
      "order_date": string | null,  // ISO YYYY-MM-DD; null if unknown
      "items": [ { "description": string, "amount": number | null } ],
      "subtotal": number | null,
      "tax": number | null,
      "total": number | null,
      "notes": string | null
    }
  ],
  "raw_notes": string | null        // any legible handwriting not captured above
}

Rules:
- If a field isn't legible or present, use null (or empty array for orders).
- Do not invent values.
- Amounts are numbers (no $ or commas).
- Group items that clearly belong to one order together; otherwise create separate order objects.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null) as { imageBase64?: string; mimeType?: string } | null;
    if (!body?.imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mime = body.mimeType || "image/jpeg";
    const dataUrl = body.imageBase64.startsWith("data:") ? body.imageBase64 : `data:${mime};base64,${body.imageBase64}`;

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
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the profile / order data from this image and return JSON only." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      const status = aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 502;
      return new Response(JSON.stringify({ error: `AI error: ${text.slice(0, 500)}` }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let extracted: unknown;
    try {
      extracted = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      extracted = { contact: {}, orders: [], raw_notes: String(raw).slice(0, 2000) };
    }

    return new Response(JSON.stringify({ extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
