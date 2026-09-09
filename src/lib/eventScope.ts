/**
 * Event scope helpers.
 *
 * The Google Calendar sync now imports unit consultants' parties/chats into the
 * same `events` table, tagged `event_scope = 'Unit'`. Every personal-facing
 * metric must exclude those rows. Anything that is not explicitly 'Unit'
 * (including legacy rows with the 'Personal' default) counts as personal, so
 * existing historical numbers are unchanged.
 */

export const isUnitEvent = (e: { event_scope?: string | null }): boolean =>
  e?.event_scope === "Unit";

export const isPersonalEvent = (e: { event_scope?: string | null }): boolean =>
  !isUnitEvent(e);

/** Filter a list of events down to Stephanie's personal ones. */
export function personalEvents<T extends { event_scope?: string | null }>(list: T[]): T[] {
  return (list || []).filter(isPersonalEvent);
}

/** Filter a list of events down to unit (downline) events only. */
export function unitEvents<T extends { event_scope?: string | null }>(list: T[]): T[] {
  return (list || []).filter(isUnitEvent);
}
