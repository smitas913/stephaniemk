
# Faster "face → customer" logging — current state + recommendation

## 1. Dashboard Quick Add ("Face" flow) — current state

Component: `src/components/QuickAddPersonDialog.tsx` (~1000 lines), launched from `QuickAddBar` in `src/pages/Dashboard.tsx` via the "Face" / "Booking" / "Career Chat" tiles.

What "Face" does today (steps Stephanie sees):

1. **Search** — types name; dialog matches against customers, prospects, booking leads, consultants.
2. **Select or create new** — if exact-match exists she must explicitly pick it (no silent merge). Brand-new name proceeds to step 3.
3. **Face Outcome** — Customer vs Non-Customer prompt (`faceOutcomePrompt`).
4. **Both branches immediately create a `customers` row** with `relationship_status = "Customer"` and log a `notes` row (`result_type = "Face"`, `person_type = customer`, dated today).
5. **Follow-up path** (Customer branch): 2+2+2 / custom date / 90-Day Care Cycle default. Writes `customers.next_follow_up_date` + `follow_up_reason` and a Follow-Up note.
6. **Non-Customer branch**: tag toggles (Lead / Prospect / DNC) + optional follow-up date → updates same customer row.
7. **Flag prompt** (existing customers only): 1-tap "Finish later / Needs follow-up / Complete details later".

Data written: `customers` (always), `notes` (always), optional flag/tags/follow-up date. **No** phone/email/address capture in this flow — only name. **No** photo, no order, no event linkage (an optional "was this from an event?" check exists via `faceEventCheck`/`faceEventId` state, but nothing on-screen currently writes an event association from this dialog based on what I can see wired up).

Practical result: after Quick Add "Face → Customer", she still has to open the new customer profile to fill in phone, email, address, tags, orders — which is the redundancy she's noticing.

## 2. Guest Event → Customer conversion — current state

Component: `src/components/EventGuestPanel.tsx`. Guest rows live in `event_guests` with `converted_customer_id` FK to `customers.id`.

Two ways a guest becomes a customer today:

- **Implicit on Add Guest** — `handleAdd` (lines ~171-196): typing a guest name shows suggestions; picking an existing customer sets `linkedCustomerId`, which is written straight into `event_guests.converted_customer_id`. No customer is *created*, just linked.
- **Explicit on outcome = "Ordered"** — `toggleOutcome` case `"ordered"` (line ~229): if the guest has no `converted_customer_id` yet, it opens `ConvertGuestToCustomerDialog` (lines 720-824).

The `ConvertGuestToCustomerDialog` today asks for:

- "Assigned to" dropdown (Me / other consultant) — one field.
- Confirm button → `checkForDuplicatePerson` (name+phone) → either link to an existing dup via `DuplicateGuardDialog`, or `createCustomer({ full_name, phone, relationship_status: "Customer", assigned_consultant_id })` and set `event_guests.converted_customer_id`.

That's it — no email, address, birthday, tags, orders, or notes are captured at this step. She'd still need to open the profile to fill anything else in.

There is also a separate "She Joined" outcome that goes to `team_consultants`, and "Career Interest" that creates a `booking_leads` row — those are unrelated to customer conversion.

## 3. Existing Scan Photo flow (already built) — quick recap

- `src/components/ScanPhotoDialog.tsx` mounted on `CustomerDetail` header.
- Upload image → `supabase/functions/scan-photo` (Gemini vision) returns structured `{ contact, orders[], raw_notes }`.
- Editable review screen: side-by-side field conflicts (keep existing / replace / keep both in notes), toggleable order drafts.
- On confirm: uploads scan to `customer-scans` bucket, updates customer fields, creates `orders` rows as Unpaid, logs a scan note.
- Requires a customer to already exist (dialog takes an existing customer id).

## 4. Recommended approach

### 4a. Merge Scan Photo into the guest-to-customer conversion

Turn `ConvertGuestToCustomerDialog` into a two-mode dialog:

- **Manual mode (default, unchanged)**: current "Assigned to" + Add customer button. Fast path for people she already has all info for.
- **New "Scan card" mode**: a "📷 Scan profile card" button in the same dialog. Flow:
  1. Upload/take a photo — same edge function call as `ScanPhotoDialog`.
  2. Show the same editable review screen, but **pre-seeded with the guest's name + phone from `event_guests`** so those aren't blank.
  3. Contact-conflicts UI is unnecessary here (no existing customer yet) — collapse it to a plain editable form.
  4. On confirm:
     - `createCustomer` with all reviewed contact fields + `assigned_consultant_id`.
     - Set `event_guests.converted_customer_id` to the new customer (same as today).
     - Upload scan to `customer-scans` bucket, create scan note, create any reviewed `orders` rows as Unpaid (reuse existing `ScanPhotoDialog` logic — extract to a shared helper, e.g. `src/lib/scanPhotoApply.ts`, so both CustomerDetail and the guest-convert dialog call it).
     - Run `checkForDuplicatePerson` before create, same as today (so a scanned card for someone already in the system still routes through `DuplicateGuardDialog`).

Net effect: one pass = guest logged + customer created with full profile + first order captured, all from inside the event.

### 4b. Retire the Dashboard "Face" Quick Add tile

Recommend **removing the "Face" tile** from `QuickAddBar` (keep "Booking", "Career Chat", "Order") because:

- Every real "Face" now happens in one of two better places: the event guest list (party faces) or Customer/Prospect detail pages (walk-ups, referrals). The events pipeline already logs Faces automatically from the guest list via focusMetrics.
- The Dashboard Quick Add "Face" path produces a bare customer row with only a name, which is the exact "then I still have to fill in everything" problem she's complaining about.
- Keeping the other three tiles preserves the fast "I just had a booking conversation with someone not in the system" path, which does *not* have a natural home elsewhere.

For walk-up / non-event faces where she still wants a fast entry, the existing "+ New Customer" button on the Customers list already exists, and it collects the fields the Quick Add skips — so nothing is actually lost.

### 4c. Small cleanups that fall out

- Extract shared scan-apply helper: move contact-merge + order-creation + scan-note logic from `ScanPhotoDialog.tsx` into `src/lib/scanPhotoApply.ts` so both callers stay in sync.
- Delete `QuickAddPersonDialog`'s Face-specific state (`faceOutcomePrompt`, `faceEventCheck`, `faceEventId`, `nonCustomerPrompt`, `nonCustomerTags`, `nonCustomerFollowUpDate`) if we remove the Face tile — trims ~200 lines and one code path. Booking + Career Chat branches stay.

## Open questions before I build

1. **Confirm retiring the Dashboard "Face" tile** (vs. just leaving it as a fallback). My recommendation is remove; want to double-check before deletion.
2. **Order creation from the scan** during guest convert — create the order tied to *this event* (`orders.event_id = event.event_id`) or leave it un-linked like `ScanPhotoDialog` does today? I'd suggest linking to the event since we know it.
3. **Scan button placement** — inside the existing "Add customer" dialog as a second button, or a separate "📷 Scan card" action on each guest row? First is fewer surfaces; second is one-tap discoverability.

Reply with answers (or just "go with your recommendations") and I'll implement.
