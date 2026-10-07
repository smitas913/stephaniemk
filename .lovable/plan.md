# Events quick filters

- Add six counted, single-select chips directly below search: All (default), Needs update, Upcoming, Held, Cancelled, and Reschedule.
- Counts reflect the selected Product/Business tab, search, and existing popover filters, before applying the selected chip.
- Combine chips with existing filters. Keep All's current sections; show other chips as one date-sorted list (Needs update oldest first; others newest first).
- Preserve data, popover contents, row actions, and mobile cards. Use existing primary button styles and a wrapping chip row.

## Technical details
- Keep the change localized to Events.tsx; compare local date-only strings, excluding missing dates from date-dependent chips.
- Verify authenticated desktop/mobile filtering and automatic typecheck/build results.