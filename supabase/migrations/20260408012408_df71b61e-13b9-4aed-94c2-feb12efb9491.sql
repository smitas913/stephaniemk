
-- Drop restrictive constraints that block non-Customer/Prospect notes
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_customer_check;
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_entity_type_check;
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_note_type_check;

-- Add updated constraint allowing all entity types
ALTER TABLE public.notes ADD CONSTRAINT notes_entity_type_check
  CHECK (entity_type = ANY (ARRAY['Customer', 'Prospect', 'Lead', 'Consultant', 'Hostess']));

-- Add updated note_type constraint with additional action types
ALTER TABLE public.notes ADD CONSTRAINT notes_note_type_check
  CHECK (note_type = ANY (ARRAY['Call', 'Text', 'Email', 'In Person', 'Follow-Up', 'Other', 'General', 'Imported', 'Did Not Connect', 'Delivery', 'Reorder Conversation', 'Coaching']));
