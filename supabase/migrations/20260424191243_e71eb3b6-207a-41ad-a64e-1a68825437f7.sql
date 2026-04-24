-- Allow "Skipped" and "No Follow-Up Needed" as note_type values so the
-- "Skipped / Did Not Reach Out" action can persist its activity log.
-- Without this, the createNote insert fails the CHECK constraint, leaving
-- the follow-up date partially updated while the activity row never lands.

ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_note_type_check;

ALTER TABLE public.notes ADD CONSTRAINT notes_note_type_check
CHECK (note_type = ANY (ARRAY[
  'Call'::text,
  'Text'::text,
  'Email'::text,
  'In Person'::text,
  'Follow-Up'::text,
  'Other'::text,
  'General'::text,
  'Imported'::text,
  'Did Not Connect'::text,
  'Delivery'::text,
  'Reorder Conversation'::text,
  'Coaching'::text,
  'Skipped'::text,
  'No Follow-Up Needed'::text
]));