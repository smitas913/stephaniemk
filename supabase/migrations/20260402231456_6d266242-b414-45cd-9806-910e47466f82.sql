
-- Hostess coaching fields on events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS hostess_phone text,
  ADD COLUMN IF NOT EXISTS hostess_email text,
  ADD COLUMN IF NOT EXISTS coaching_status text DEFAULT 'Booked',
  ADD COLUMN IF NOT EXISTS coaching_call_date date,
  ADD COLUMN IF NOT EXISTS coaching_notes text,
  ADD COLUMN IF NOT EXISTS checklist_invitations_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_guest_list_received boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_google_form_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_samples_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_reminders_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_form_link text;

-- Guest tracking fields on event_guests
ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS rsvp text DEFAULT 'Maybe',
  ADD COLUMN IF NOT EXISTS attending boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ordered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS interested boolean DEFAULT false;
