ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_prospect_id_idx ON public.events (prospect_id);