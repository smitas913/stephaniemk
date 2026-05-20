# Plan: True Customer ↔ Consultant Conversion + Consultant Orders

## Goal
Customer and Consultant stay as **distinct record types** (one or the other, never both). Conversion is a full **data migration** with the source record deleted after a verified transfer. Orders can be logged against either type.

---

## 1. Data model changes

**`orders` table**
- Add nullable `consultant_id uuid` column alongside existing `customer_id`.
- Loosen the NOT NULL on `customer_id` (or keep NOT NULL and instead use a single polymorphic pair with a CHECK that exactly one of `customer_id` / `consultant_id` is set). Recommended: make `customer_id` nullable + CHECK `(customer_id IS NOT NULL) <> (consultant_id IS NOT NULL)`.
- Update `update_customer_last_order` trigger to also handle the consultant branch (write to a new `team_consultants.last_order_date` column).
- Add `team_consultants.last_order_date date` for parity with `customers.last_order_date_order_log`.

**`team_consultants` table** — add any columns currently only on `customers` that need to carry over and aren't already there:
- `tags text[] default '{}'`
- `beauty_notes jsonb default '{}'`
- `next_follow_up_date`, `follow_up_reason`, `new_follow_up_stage`, `dormant_follow_up_stage`
- `last_contacted`, `became_customer_date`, `date_added`
- `address_line_2`, `birthday_mmdd`
- `is_skincare_customer`, `skincare_started_at`
- `customer_source`, `new_customer_flag`
- `needs_attention`, `attention_reason`, `flagged_at`
- `secondary_email`, `secondary_phone` (if not already present)

**Re-pointing FKs on conversion** — these tables currently reference `customer_id` and need an equivalent path when the person becomes a consultant. Two options:
- (A) Add nullable `consultant_id` to each and re-point on conversion.
- (B) Keep the customer row as a hidden "shell" purely to host historical FKs.

**Recommendation: Option A** (true migration, no shells). Tables to extend with a nullable `consultant_id`:
- `orders` (already covered above)
- `customer_notes`
- `notes` (already polymorphic via `person_type`/`person_id` — use that instead, no schema change)
- `daily_plan_items`
- `catalog_campaign_customers`
- `event_guests.converted_customer_id` → add `converted_consultant_id`
- `booking_leads.converted_customer_id` → add `converted_consultant_id`
- `completed_birthdays` (already polymorphic via `person_type`/`person_id`)

RLS policies on each new column mirror existing ones (`is_internal_user` / owner checks).

---

## 2. Conversion logic (shared by both directions)

A single edge function (or a transactional client-side mutation) `convertPerson({ fromType, fromId, toType })` that:

1. **Create the target record** in the destination table, copying every field 1:1 (contact info, address, birthday, notes, tags, beauty_notes, follow-up fields, customer-lifecycle fields, consultant-specific fields where applicable).
2. **Re-point related rows** in a single transaction:
   - `orders`: set `consultant_id = newId, customer_id = null` (or reverse).
   - `customer_notes`: set the new id column, null the old.
   - `notes`: update `person_type` + `person_id` (and `customer_id` ↔ keep one canonical).
   - `daily_plan_items`, `catalog_campaign_customers`, `event_guests`, `booking_leads`: same pattern.
   - `completed_birthdays`: update `person_type` + `person_id`.
   - `events.hostess_converted_customer_id` ↔ new `hostess_converted_consultant_id`.
3. **Verify counts** — for each table, assert the count of rows newly pointing at `toId` equals the count that previously pointed at `fromId`. If any mismatch, rollback and surface an error.
4. **Delete the source row** only after verification passes.
5. Return a summary `{ moved: { orders: N, notes: N, ... } }` shown in a toast.

UI:
- `CustomerDetail` already has "Convert to Consultant" — rewire it to this new flow with a confirmation dialog listing what will be moved.
- `team_consultants` detail page gets a new **"Convert to Customer"** button using the same function in reverse.

---

## 3. Consultant orders

- `AddOrder` / `EditOrder`: change the person picker from "Customer only" to a unified search across `customers` + `team_consultants`, with a small badge ("Customer" / "Consultant") in the dropdown. Selection sets either `customer_id` or `consultant_id` on the order.
- `Orders` list, `CustomerDetail` order history, and consultant detail order history: read from the union (orders where `customer_id = X` OR `consultant_id = X`).
- Financial reports and order log queries that filter/join on customer get a parallel branch for consultant orders. Specifically: `lib/queries.ts` order fetchers, `Orders.tsx`, `FinancialSnapshot.tsx`, monthly/MTD totals, payment status rollups.
- `update_customer_last_order` trigger updated to branch on which FK is set.

---

## 4. Backfill: existing 16 duplicates

A one-time migration script (run via a temporary admin button or SQL) that for each detected duplicate `(customer, consultant)` pair:
1. Runs the same `convertPerson(customer → consultant)` flow.
2. Merges fields onto the **existing** consultant row (don't overwrite consultant data; only fill gaps and append notes/tags).
3. Re-points all FK rows from `customer.id` to `consultant.id`.
4. Verifies counts.
5. Deletes the customer row.

Surfaced in **Admin Tools** as a new "Migrate Duplicate Customers → Consultants" panel that lists the 16 pairs, lets you preview the diff per pair, and runs them one-by-one or all-at-once. The old `MergeDuplicates` customer→consultant path is removed once this is done; customer↔customer merge stays.

---

## 5. Order of operations (so nothing breaks mid-flight)

1. **Migration A**: add columns (`consultant_id` on orders + related tables, new fields on `team_consultants`, `last_order_date`, CHECK constraint). Update trigger. Update RLS.
2. **Code**: update `convertPerson` logic + UI, add Convert to Customer, update order entry to support consultants, update order readers.
3. **Backfill**: run the 16-pair migration through the new admin panel.
4. **Cleanup migration B**: drop the legacy customer→consultant path from `MergeDuplicates.tsx`.

---

## Technical notes

- All re-pointing happens inside a Postgres function (`public.convert_person(from_type, from_id, to_type)`) called via RPC so it's a single transaction with verification, rather than 7+ sequential client-side updates that could partially fail.
- Conversion preserves `created_at` of the target where possible (use the older of the two timestamps).
- Existing RLS: any table getting `consultant_id` keeps the same `is_internal_user` / owner-scoped policies — new column doesn't change who can read/write.
- `customers.relationship_status = 'Consultant'` becomes obsolete for this flow (no more "hidden customer that is actually a consultant"). I'll leave the column alone for now; just stop using it for this purpose.
- No changes to auth/profiles — `team_consultants` is the team roster, separate from login profiles.

---

## Open questions before I build

1. **Order entry**: should the consultant badge be visible in the autocomplete (e.g. "Jane Smith · Consultant"), or do you want it indistinguishable from customer entries?
2. **Convert to Customer** — what should happen to consultant-specific fields (commission level, recruitment data, unit role)? Drop, or store them in a `former_consultant_data` jsonb on the customer row for history?
3. For the 16-pair backfill: do you want to **preview each pair** (approve one-by-one) or **run all 16 in one click** after spot-checking 2–3?

Once you confirm those, I'll start with Migration A.
