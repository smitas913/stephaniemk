import type { Prospect } from "@/lib/types";

export const CLOSED_PROSPECT_STATUSES = new Set([
  "Converted",
  "Joined",
  "Closed",
  "Not Interested",
]);

export function prospectRequiresNextDate(status: string | null | undefined): boolean {
  return Boolean(status) && !CLOSED_PROSPECT_STATUSES.has(status || "");
}

export function getProspectActionDate(prospect: Prospect): string | null {
  const dates = [prospect.next_follow_up_date, prospect.next_step_date].filter(
    (date): date is string => Boolean(date),
  );
  return dates.length > 0 ? dates.sort()[0] : null;
}

export function dedupeLinkedProspects(prospects: Prospect[]): Prospect[] {
  const byPerson = new Map<string, Prospect>();

  for (const prospect of prospects) {
    const key = prospect.customer_id ? `customer:${prospect.customer_id}` : `prospect:${prospect.id}`;
    const current = byPerson.get(key);
    if (!current) {
      byPerson.set(key, prospect);
      continue;
    }

    const currentDate = getProspectActionDate(current);
    const candidateDate = getProspectActionDate(prospect);
    if (candidateDate && (!currentDate || candidateDate < currentDate)) {
      byPerson.set(key, prospect);
    }
  }

  return [...byPerson.values()];
}