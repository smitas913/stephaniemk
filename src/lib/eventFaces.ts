import { stripPhone } from "@/lib/phoneUtils";

type GuestLike = {
  event_id?: string | null;
  attending?: boolean | null;
  name?: string | null;
  phone?: string | null;
  converted_customer_id?: string | null;
  customer_id?: string | null;
  consultant_id?: string | null;
};

/** Identity key for one person on one event's guest list (linked record > phone > name). */
function personKeys(g: GuestLike): string[] {
  const keys: string[] = [];
  const cust = g.converted_customer_id || g.customer_id;
  if (cust) keys.push(`c:${cust}`);
  if (g.consultant_id) keys.push(`t:${g.consultant_id}`);
  const p = stripPhone(g.phone || "");
  if (p && p.length >= 7) keys.push(`p:${p}`);
  const n = (g.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (n) keys.push(`n:${n}`);
  return keys;
}

/** Count of distinct attending (Tried Product) guests per event; same person on two rows counts once. */
export function attendingFacesByEvent(guests: GuestLike[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  for (const g of guests || []) {
    if (g.attending !== true || !g.event_id) continue;
    const keys = personKeys(g);
    let set = seen.get(g.event_id);
    if (!set) { set = new Set(); seen.set(g.event_id, set); }
    if (keys.length && keys.some((k) => set!.has(k))) continue;
    keys.forEach((k) => set!.add(k));
    counts.set(g.event_id, (counts.get(g.event_id) || 0) + 1);
  }
  return counts;
}

/** Faces for one event: distinct attending guests, else the planned guest_count. */
export function eventFaces(ev: { event_id: string; guest_count?: number | null }, attending: Map<string, number>): number {
  const a = attending.get(ev.event_id) || 0;
  return a > 0 ? a : Number(ev.guest_count || 0);
}
