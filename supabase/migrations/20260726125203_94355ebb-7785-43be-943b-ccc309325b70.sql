
ALTER TABLE public.customer_notes
  ADD COLUMN IF NOT EXISTS note_date date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE public.prospect_notes
  ADD COLUMN IF NOT EXISTS note_date date NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS customer_notes_note_date_idx ON public.customer_notes (customer_id, note_date DESC);
CREATE INDEX IF NOT EXISTS prospect_notes_note_date_idx ON public.prospect_notes (prospect_id, note_date DESC);
