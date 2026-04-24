
-- Add event_type column to completed_birthdays so we can track both birthdays and anniversaries
ALTER TABLE public.completed_birthdays
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'birthday';

-- Recreate uniqueness so a person can have one birthday + one anniversary completion per year
ALTER TABLE public.completed_birthdays
  DROP CONSTRAINT IF EXISTS completed_birthdays_user_id_person_id_birthday_year_key;

ALTER TABLE public.completed_birthdays
  ADD CONSTRAINT completed_birthdays_user_person_year_event_key
  UNIQUE (user_id, person_id, birthday_year, event_type);

-- Allow Anniversary Reach-Out as a valid note type
ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_note_type_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_note_type_check
  CHECK (note_type = ANY (ARRAY[
    'Call'::text, 'Text'::text, 'Email'::text, 'In Person'::text, 'Follow-Up'::text,
    'Other'::text, 'General'::text, 'Imported'::text, 'Did Not Connect'::text,
    'Delivery'::text, 'Reorder Conversation'::text, 'Coaching'::text,
    'Skipped'::text, 'No Follow-Up Needed'::text,
    'Birthday Reach-Out'::text, 'Anniversary Reach-Out'::text
  ]));
