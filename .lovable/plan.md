## Career Chat streamlining plan

### 1. Data model (Supabase migration on `public.prospects`)

Add two new nullable columns:
- `last_touch_layer text` — one of the 13 layer labels
- `next_touch_layer text` — one of the 13 layer labels (nullable; auto-suggested from last)

No enum type — keep as free `text` with a shared TS constant so we can reorder/rename layers later without a schema migration. No backfill; existing career-chat prospects simply start with NULL and pick a layer on their next log.

The 13 layers, in order (single source of truth in a new `src/lib/careerChatLayers.ts`):

```
Loves Product → Sample Pack → Hostess → Watch Video → Referrals →
Guest Event → WWW Survey → Skin Analyzer App → Customer FB Group →
Pearl Girl → Recruiting Packet → Coffee → Bold Ask
```

`nextLayerAfter(current)` returns the next entry in the array (or `Bold Ask` when at the end / null when unknown).

### 2. Identifying "career chat prospects"

They already have a distinct signature: `opportunity_status` set through the career-chat flow and (for unit ones) `ownership_type = 'unit'` with an `assigned_consultant_id`. To be robust, we treat "career chat prospects" as **all non-archived prospects** in the Prospects page tab — that already matches what the app uses today. No new discriminator column needed.

### 3. `QuickCareerChatDialog.tsx` changes

- Remove the existing "Next step" dropdown and its option list.
- Add:
  - **Last touch** dropdown (13 layers). If the prospect already exists, prefill from `last_touch_layer`.
  - **Next touch** dropdown (13 layers), defaulting to `nextLayerAfter(lastTouch)`, editable.
- On save: update the prospect with `last_touch_layer`, `next_touch_layer`, `next_follow_up_date` (existing 2-day default remains for the standard save path), and log the note as today (existing behavior). Drop the Recruiting-category tagging for the note this dialog writes so we stop double-classifying — the note stays a plain "Career Chat" note; `intentCategory.ts` itself is not modified (kept for other note surfaces).

### 4. `src/pages/Prospects.tsx` — new "Career Chats" tab

- Add a third tab alongside Personal / Unit called **Career Chats**. When active, the list = all non-archived prospects, personal + unit combined.
- Single flat list (no Active/Nurture split). Sort:
  1. Overdue / due today / due within 7 days (chronological ascending)
  2. Parked = `next_follow_up_date` more than 7 days out OR null → rendered with muted styling (`opacity-60 text-muted-foreground`), sorted to bottom by date ascending.
- Each row shows: name, ownership badge (Personal/Unit + consultant name for unit), `last_touch_layer` badge, `next_touch_layer` label, follow-up date, and action buttons:
  - **Log touch** → opens `QuickCareerChatDialog` prefilled
  - **Not now** → sets `next_follow_up_date = today + 90d`
  - When `last_touch_layer === "Bold Ask"`, show two extra buttons:
    - **Joined** → mirror the existing "convert prospect → consultant" flow used elsewhere (reuse `convert_person` RPC or the current joined-status pathway; will check `queries.ts` for the existing helper and reuse it)
    - **Not interested** → `is_archived = true`
- Director gate on the Personal/Unit sub-tabs stays; the Career Chats tab itself is visible to everyone.

### 5. `src/pages/FollowUps.tsx` (Today page) — removals

- Delete the "Prospect Follow-Ups" card and the "Career Chat Follow-Ups" card, plus their supporting `prospectItems` / unit-career-chat arrays and the prospects fetch if no longer referenced elsewhere on the page. Surgical removal only — surrounding column layout preserved.

### 6. Files touched

- **Migration**: add columns on `public.prospects`.
- `src/lib/careerChatLayers.ts` *(new)* — layer list + `nextLayerAfter` helper.
- `src/lib/types.ts` — add `last_touch_layer`, `next_touch_layer` to `Prospect`.
- `src/lib/queries.ts` — allow the two fields in prospect create/update; add a `setProspectNotNow(id)` and `archiveProspect(id)` helper if not present, and a `markProspectJoined(id)` that calls the existing conversion path.
- `src/components/QuickCareerChatDialog.tsx` — replace Next-step dropdown with Last/Next touch pickers; write the two fields.
- `src/pages/Prospects.tsx` — new Career Chats tab, list, sorting, actions.
- `src/pages/FollowUps.tsx` — remove both career-chat cards (targeted deletes only).

### Open confirmations before I start coding

1. **Migration column names OK?** `last_touch_layer` / `next_touch_layer` as plain `text` on `prospects`.
2. **"Joined" behavior** — reuse whatever prospect→consultant conversion the app already has (I'll match the existing pattern in `queries.ts` / `Leadership.tsx`). OK?
3. **`intentCategory.ts` Recruiting reasons stay** — only the *career-chat dialog* stops writing them. Confirm you don't want those reasons removed globally.

Reply "go" (with any tweaks) and I'll implement.
