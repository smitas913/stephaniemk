
-- Add ownership columns to prospects
ALTER TABLE public.prospects
ADD COLUMN ownership_type text NOT NULL DEFAULT 'personal',
ADD COLUMN assigned_consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE SET NULL;

-- Index for filtering by ownership
CREATE INDEX idx_prospects_ownership ON public.prospects(ownership_type);
CREATE INDEX idx_prospects_assigned ON public.prospects(assigned_consultant_id);
