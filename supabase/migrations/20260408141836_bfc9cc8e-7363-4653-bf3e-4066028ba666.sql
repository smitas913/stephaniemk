ALTER TABLE public.notes
ADD COLUMN IF NOT EXISTS person_type text,
ADD COLUMN IF NOT EXISTS person_id uuid,
ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_notes_note_date_tags ON public.notes (note_date);
CREATE INDEX IF NOT EXISTS idx_notes_person_type_person_id ON public.notes (person_type, person_id);
CREATE INDEX IF NOT EXISTS idx_notes_tags_gin ON public.notes USING gin(tags);

UPDATE public.notes
SET person_type = lower(entity_type)
WHERE person_type IS NULL
  AND entity_type IN ('Customer', 'Prospect', 'Lead', 'Consultant', 'Hostess');

UPDATE public.notes n
SET person_id = n.customer_id
WHERE n.person_id IS NULL
  AND n.entity_type = 'Customer'
  AND n.customer_id IS NOT NULL;

UPDATE public.notes n
SET person_id = n.prospect_id
WHERE n.person_id IS NULL
  AND n.entity_type = 'Prospect'
  AND n.prospect_id IS NOT NULL;

UPDATE public.notes n
SET person_id = c.id,
    tags = CASE
      WHEN NOT ('consultant_coaching' = ANY(COALESCE(n.tags, '{}'))) THEN array_append(COALESCE(n.tags, '{}'), 'consultant_coaching')
      ELSE COALESCE(n.tags, '{}')
    END
FROM public.team_consultants c
WHERE n.entity_type = 'Consultant'
  AND n.person_id IS NULL
  AND n.note_body ILIKE '%' || c.name || '%';

UPDATE public.notes n
SET tags = CASE
  WHEN NOT ('consultant_coaching' = ANY(COALESCE(n.tags, '{}'))) THEN array_append(COALESCE(n.tags, '{}'), 'consultant_coaching')
  ELSE COALESCE(n.tags, '{}')
END
WHERE n.entity_type = 'Consultant';