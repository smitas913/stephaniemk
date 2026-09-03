// Uploads a combined front/back card-scan PDF to Google Drive via the Lovable
// connector gateway, into a dedicated folder ("MK CRM Card Scans").
//
// Input:  { pdfBase64: string, fileName: string }
// Output: { url: string, fileId: string, folderId: string }
//         { error: string, needsSetup?: true } on failure
//
// Requires the Google Drive connector to be linked to this project. Until the
// one-time Google authorization is done, this returns 503 + needsSetup so the
// caller can save the record without the PDF link.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const DRIVE_KEY =
  Deno.env.get("GOOGLE_DRIVE_API_KEY") ??
  Deno.env.get("GOOGLE_DRIVE_API_KEY_2") ??
  null;

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const FOLDER_NAME = "MK CRM Card Scans";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function driveHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": DRIVE_KEY!,
    ...extra,
  };
}

async function findOrCreateFolder(): Promise<string> {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
  );
  const listRes = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`, {
    headers: driveHeaders(),
  });
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`[${listRes.status}] ${t.slice(0, 400)}`);
  }
  const listJson = await listRes.json();
  const existing = listJson?.files?.[0]?.id;
  if (existing) return existing as string;

  const createRes = await fetch(`${GATEWAY}/drive/v3/files?fields=id`, {
    method: "POST",
    headers: driveHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`[${createRes.status}] ${t.slice(0, 400)}`);
  }
  const created = await createRes.json();
  if (!created?.id) throw new Error("Drive folder creation returned no id");
  return created.id as string;
}

/**
 * Ensure the filename is unique inside the folder by appending " (2)", " (3)", …
 * Never throws — falls back to the requested name if the lookup fails.
 */
async function uniqueFileName(folderId: string, fileName: string): Promise<string> {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  try {
    const q = encodeURIComponent(
      `'${folderId}' in parents and trashed=false and name contains '${base.replace(/'/g, "\\'")}'`,
    );
    const res = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=files(name)&pageSize=200`, {
      headers: driveHeaders(),
    });
    if (!res.ok) return fileName;
    const data = await res.json();
    const taken = new Set<string>((data?.files ?? []).map((f: { name: string }) => f.name));
    if (!taken.has(fileName)) return fileName;
    for (let i = 2; i < 500; i++) {
      const candidate = `${base} (${i})${ext}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base} (${Date.now()})${ext}`;
  } catch {
    return fileName;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: this function writes to the workspace Drive account, so require a
    // valid signed-in user.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null) as
      | { pdfBase64?: string; fileName?: string }
      | null;

    const pdfBase64 = body?.pdfBase64;
    const fileName = (body?.fileName || "card-scan.pdf").replace(/[\r\n"]/g, "").slice(0, 180);
    if (!pdfBase64) return json({ error: "pdfBase64 is required" }, 400);

    if (!LOVABLE_API_KEY) return json({ error: "AI/gateway key not configured" }, 500);
    if (!DRIVE_KEY) {
      return json(
        {
          error:
            "Google Drive isn't connected yet. Connect the Google Drive connector in Lovable (one-time Google authorization) to enable PDF backups.",
          needsSetup: true,
        },
        503,
      );
    }

    const folderId = await findOrCreateFolder();

    const boundary = `mkcrm${crypto.randomUUID().replace(/-/g, "")}`;
    const uniqueName = await uniqueFileName(folderId, fileName);
    const metadata = JSON.stringify({ name: uniqueName, parents: [folderId], mimeType: "application/pdf" });
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--\r\n`);
    const pdfBytes = base64ToBytes(pdfBase64);
    const payload = new Uint8Array(head.length + pdfBytes.length + tail.length);
    payload.set(head, 0);
    payload.set(pdfBytes, head.length);
    payload.set(tail, head.length + pdfBytes.length);

    const upRes = await fetch(
      `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`,
      {
        method: "POST",
        headers: driveHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
        body: payload,
      },
    );

    if (!upRes.ok) {
      const t = await upRes.text();
      console.error(`Drive upload failed [${upRes.status}]: ${t}`);
      return json({ error: `Drive upload failed [${upRes.status}]: ${t.slice(0, 400)}` }, upRes.status);
    }

    const up = await upRes.json();
    const url = up?.webViewLink || (up?.id ? `https://drive.google.com/file/d/${up.id}/view` : null);
    if (!url) return json({ error: "Drive upload returned no link" }, 502);

    return json({ url, fileId: up.id, folderId });
  } catch (err) {
    console.error("upload-scan-drive error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
