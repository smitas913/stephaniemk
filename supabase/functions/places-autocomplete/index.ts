const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLACES_API_BASE = "https://places.googleapis.com/v1/places";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GOOGLE_PLACES_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { action, input, placeId } = await req.json();

    if (action === "autocomplete") {
      if (!input || typeof input !== "string" || input.length < 2) {
        return new Response(JSON.stringify({ suggestions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resp = await fetch(`${PLACES_API_BASE}:autocomplete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify({
          input: input.trim(),
          includedRegionCodes: ["us"],
          includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
          languageCode: "en",
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Places autocomplete failed [${resp.status}]: ${errText}`);
      }

      const data = await resp.json();
      const suggestions = (data.suggestions || [])
        .filter((s: any) => s.placePrediction)
        .map((s: any) => ({
          placeId: s.placePrediction.placeId,
          description: s.placePrediction.text?.text || "",
          mainText: s.placePrediction.structuredFormat?.mainText?.text || "",
          secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || "",
        }));

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "details") {
      if (!placeId || typeof placeId !== "string") {
        return new Response(JSON.stringify({ error: "placeId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resp = await fetch(`${PLACES_API_BASE}/${placeId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "addressComponents,formattedAddress",
        },
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Places details failed [${resp.status}]: ${errText}`);
      }

      const place = await resp.json();
      const components = place.addressComponents || [];

      const get = (type: string) =>
        components.find((c: any) => c.types?.includes(type))?.longText || "";
      const getShort = (type: string) =>
        components.find((c: any) => c.types?.includes(type))?.shortText || "";

      const streetNumber = get("street_number");
      const route = get("route");
      const streetAddress = [streetNumber, route].filter(Boolean).join(" ");

      return new Response(
        JSON.stringify({
          formatted: place.formattedAddress || "",
          street_address: streetAddress,
          city: get("locality") || get("sublocality"),
          state: getShort("administrative_area_level_1"),
          zip_code: get("postal_code"),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Places API error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
