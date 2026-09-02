// Extracts contact info, skin type, foundation shade and order details from
// photos of a handwritten Mary Kay profile card or order form using Lovable AI
// (Gemini vision).
//
// Input (either shape):
//   { imageBase64: string, mimeType?: string }                 // legacy, single image
//   { images: [{ base64: string, mimeType?: string }, ...] }    // front + optional back
// Output: { extracted: {...} }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const SYSTEM_PROMPT = `You extract structured customer profile and order data from photos of handwritten profile cards, order forms, or contact cards.

You may be given MULTIPLE images of the SAME card (front side, then back side). Treat them as one document and merge everything you read into a single result. Never duplicate the same order across sides.

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
    "birthday": string | null,      // ISO YYYY-MM-DD if year is legible, else null
    "skin_type": string | null,     // EXACTLY "Normal to Dry" or "Combination to Oily", else null
    "foundation_shade": string | null // e.g. "Beige 3", "Ivory 100"
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
- skin_type must be mapped to one of the two allowed strings. "dry", "normal", "normal/dry" => "Normal to Dry". "oily", "combo", "combination", "combination/oily" => "Combination to Oily". Anything ambiguous => null.
- foundation_shade: capture the shade name/number as written (e.g. "Beige 3", "C120", "Ivory 200"). If the card says a foundation was not made/matched, use null.
- Amounts are numbers (no $ or commas).
- Group items that clearly belong to one order together; otherwise create separate order objects.`;

type ImageInput = { base64?: string; mimeType?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null) as
      | { imageBase64?: string; mimeType?: string; images?: ImageInput[] }
      | null;

    const rawImages: ImageInput[] = Array.isArray(body?.images) && body!.images!.length > 0
      ? body!.images!
      : body?.imageBase64
        ? [{ base64: body.imageBase64, mimeType: body.mimeType }]
        : [];

    const images = rawImages.filter((i) => typeof i?.base64 === "string" && i.base64!.length > 0).slice(0, 4);

    if (images.length === 0) {
      return new Response(JSON.stringify({ error: "At least one image is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content: unknown[] = [
      {
        type: "text",
        text: images.length > 1
          ? `Extract the profile / order data from these ${images.length} images (front then back of the same card). Merge into one JSON object. Return JSON only.`
          : "Extract the profile / order data from this image and return JSON only.",
      },
    ];
    for (const img of images) {
      const mime = img.mimeType || "image/jpeg";
      const url = img.base64!.startsWith("data:") ? img.base64! : `data:${mime};base64,${img.base64}`;
      content.push({ type: "image_url", image_url: { url } });
    }

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
          { role: "user", content },
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
