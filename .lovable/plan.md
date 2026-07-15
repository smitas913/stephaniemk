
# Heads-up: this was already built in an earlier turn

Before we plan anything new, the current state of the code already matches the change you're asking about. Confirming from the repo right now:

- **Dashboard `QuickAddBar`** (`src/pages/Dashboard.tsx`): the "Face" tile is gone. The grid is now Booking / Career Chat / Order. `QuickAddPersonDialog` is no longer imported here. (Momentum's Quick Add also had Face removed and still uses `QuickAddPersonDialog` for Career Chat / Booking Conversation only.)
- **Guest → Customer conversion** (`ConvertGuestToCustomerDialog` inside `src/components/EventGuestPanel.tsx`): now has a mode switcher — "Quick add" and "📷 Scan profile card". Scan mode uploads a photo, calls the existing `scan-photo` edge function (Gemini vision), pre-seeds the review form with the guest's name/phone, lets her edit contact + orders, and on confirm creates the customer, links `event_guests.converted_customer_id`, uploads the image to `customer-scans/`, creates each included order as **Unpaid + linked to this event**, writes a Scan audit note, and runs the duplicate guard on the edited name/phone.
- **Shared helper** `src/lib/scanPhoto.ts`: extraction, contact fields, order-draft builders, and both `applyScanToExistingCustomer` (used by `ScanPhotoDialog`) and `finalizeScanForNewCustomer` (used by the guest-convert dialog). `ScanPhotoDialog` was refactored to use it.

So the "1 pass = guest logged + customer created + first order captured" flow already exists inside the event, and the Dashboard Quick Add "Face" redundancy is already removed.

## What I'd like clarified before planning anything new

Since the ask matches what's already shipped, one of these is true — please tell me which:

1. **"It's fine, I forgot / didn't realize."** No plan needed; I'll stop here.
2. **"It's shipped but not working the way I want."** Tell me what you're seeing vs. what you expected (e.g. scan button hard to find, review screen too long, orders not linking, etc.) and I'll plan a fix.
3. **"I want to go further."** Common next steps I could plan:
   - Add the scan option to the **Add Guest** form itself (before "Ordered" is even set), so a walk-up guest can be scanned in one tap without going through the Ordered → Convert prompt.
   - Auto-prompt "Convert to customer?" for every guest at event close (not just Ordered), with the scan button front-and-center.
   - Also retire `QuickAddPersonDialog` entirely (Momentum still uses it) and replace with something lighter.
   - Move the scan button to the Customer / Prospect **create** pages for walk-ups outside events.

Pick 1, 2, or a specific direction under 3 and I'll produce a real plan.
