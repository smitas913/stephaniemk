ALTER TABLE public.notes DROP CONSTRAINT notes_note_type_check;
ALTER TABLE public.notes ADD CONSTRAINT notes_note_type_check 
  CHECK (note_type = ANY (ARRAY['Call','Text','Email','In Person','Follow-Up','Other','General','Imported']));