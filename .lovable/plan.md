# Events Section Overhaul — Implementation Plan

This is a large change touching ~5 files plus 2 new DB tables. Approving this plan greenlights the whole pass.

## 1. Database changes (one migration)

**New table `event_referrals`** (per spec):
- `id`, `event_id` (text FK → events.event_id), `name`, `phone`, `referred_by`, `out_of_town`, `added_to_leads`, `owner_user_id`, `created_at`
- RLS scoped to owner_user_id; GRANTs for authenticated + service_role

**New table `hostess_coaching_tasks`** (separate from `todos` so we can track sequence + due date + event link cleanly without overloading the 6MIT todo system):
- `id`, `user_id`, `event_id` (text), `hostess_name`, `step` (1-4), `text`, `due_date` (date, local), `done` (bool), `done_at`, `created_at`
- RLS by user_id; GRANTs as above
- These render on the Today page in a new "Hostess Coaching" card — they are NOT mixed into the 6MIT todos card (cleaner separation, and 6MIT is capped at 6).

**Why a new task table not `todos`:** todos has no event link, no sequence step, and is user-facing free-text. Mixing system-generated coaching tasks would clutter the 6MIT card.

## 2. EventGuestPanel.tsx — rewrite

**Pre-event view (status ≠ "Held"):**
- Stats chips at top: Faces, Sales, Bookings (live from current guest state)
- Guest table: Name | Phone | RSVP only
- Keep inline "Add Guest" form
- Remove: attended/ordered/booked/interested checkboxes, task columns (📨/🎉/✉️)

**Post-event view (status = "Held"):**
- Same stats chips
- Replace table with a clean list. Each row: name + phone + current outcome badge + segmented outcome selector
- Outcomes (one per guest, mutually exclusive in UI; map to existing boolean fields):
  - **Tried Product** → attending=true, ordered=false, booked=false, interested=false
  - **Ordered** → attending=true, ordered=true
  - **Booked Next Event** → attending=true, booked=true
  - **Career Interest** → attending=true, interested=true; auto-insert `prospects` row (`lead_source` field doesn't exist on prospects — use `booking_leads` semantics? Prospects table has no lead_source. **Assumption:** create a `prospects` row with `name`, `phone`, `opportunity_status='New Contact'`, `notes='From [event hostess]\'s party'`, `owner_user_id`. If a prospect already linked to this guest exists, skip.)
  - **She Joined** → attending=true; inline mini-form (confirm name, phone) → insert into `team_consultants` (`status='Active'`, `join_date=today`, `relationship_type='Personal Recruit'`, `owner_user_id`)
  - **No Show** → attending=false; inline "Save to Booking Leads" button → insert `booking_leads` row (`lead_source='Other'`, `notes='No-show from [hostess]\'s party'`)
- Changing outcome is allowed (re-click). Outcome is derived from the guest's boolean flags so it persists with existing data.
- Remove the existing "Attended Outcome" and "Did Not Attend" dialogs entirely.

## 3. EventDetail.tsx — Referrals section

- New collapsible card below the guest panel: "Referrals from this event"
- Inline add form: Name, Phone, Referred By, Out of Town toggle
- List rows show those fields + "Add to Booking Leads" button → creates `booking_leads` row (`lead_source='Referral'`, `notes='Referred by [referred_by] at [hostess]\'s party'`) and flips `added_to_leads=true`
- Also: remove any in-event coaching/task checklist sections (per spec #5)

## 4. Hostess coaching tasks — auto-create + Today page

**Trigger:** When an event is created via AddEventDialog (status Booked), insert step-1 task immediately (due today).

**Sequencing logic** (client-side helper invoked on task completion):
- Complete step 1 → create step 2 (due today)
- Complete step 2 → if event_date − today > 7 days, create step 3 (due event_date − 3 days). Else skip to step 4 (due event_date − 1 day).
- Complete step 3 → create step 4 (due event_date − 1 day)
- Hostess name placeholder: "your hostess" if missing

**Today page rendering:** New `HostessCoachingCard` component shown on the Today page (above or near the 6MIT card). Lists all incomplete tasks where due_date ≤ today, with a checkbox to mark done; completing triggers next-step creation.

**Assumption:** "Today page" = `/follow-ups` per project memory. I'll add the card there.

## 5. Events list / EventRow

- Keep "Next Task" column; since coaching tasks moved out, it will show "—" (or any remaining non-coaching task if such a system exists — quick check; if EventRow's expandable task rows only show coaching items, remove the expand UI).

## 6. Data preservation

- No columns dropped. attending/ordered/booked/interested keep being written via the new outcome buttons. Existing events/guests/orders untouched. Existing event_tasks rows left alone (just no longer surfaced inside the event UI).

---

## Files touched

- **Migration** (new tables + RLS + grants)
- `src/components/EventGuestPanel.tsx` — rewrite
- `src/pages/EventDetail.tsx` — add Referrals section, remove coaching checklist sections
- `src/components/AddEventDialog.tsx` — create step-1 hostess coaching task on event create
- `src/components/EventRow` (within Events.tsx or its own file) — strip coaching expand UI
- `src/components/HostessCoachingCard.tsx` — new
- `src/pages/FollowUpDashboard.tsx` (Today page) — mount HostessCoachingCard
- `src/lib/hostessCoaching.ts` — new helper: createNextStep, due-date math (local TZ via existing `toLocalDateKey`)

## Open assumptions to confirm

1. **Career Interest target table:** prospects (no `lead_source` column) vs booking_leads (has `lead_source`). Spec says "Prospect record (in the prospects/leads table with lead_source = 'Party Guest'". I'll use **booking_leads** since it has `lead_source`, and set `lead_source='Other'` with `source_detail='Party Guest'` (BOOKING_LEAD_SOURCES doesn't include "Party Guest"). OR add "Party Guest" to allowed sources. **Proposing:** insert into `booking_leads` with `lead_source='Other'`, `source_detail='Party Guest'`, `notes='Career interest from [hostess]\'s party'`. Confirm or override.
2. **Today page = `/follow-ups`** — correct?
3. **Hostess coaching card placement** on Today page — top, or under 6MIT?

Reply "go" to proceed with these assumptions, or correct any item first.
