# AGENTS

- Hidden call-log/follow-up UI is gated by `SHOW_CALL_LOGS` in src/lib/features.ts — why: hide without deleting data or queries.
- Keep event-local guest duplicate matching in a pure helper used by the add form — why: test cross-linked/manual identities without modifying import deduplication.
- Dashboard and drill-down face counts use src/lib/eventFaces.ts (distinct attending guests per event, else guest_count) — why: one rule shared with tests, no double counts.
- GBG (GoHighLevel) contact sync is one-way via edge function gbg-contact-sync, writing only contact-info columns on customers and logging to gbg_sync_log — why: GBG owns contact info, the app owns everything else.
