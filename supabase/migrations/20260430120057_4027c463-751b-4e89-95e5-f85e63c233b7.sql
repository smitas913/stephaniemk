-- Add relationship type to consultants and update dashboard metric label
ALTER TABLE public.team_consultants
ADD COLUMN IF NOT EXISTS relationship_type text NOT NULL DEFAULT 'Personal Recruit';

ALTER TABLE public.team_consultants
ADD CONSTRAINT team_consultants_relationship_type_check
CHECK (relationship_type IN ('Personal Recruit', 'Unit Member'));

-- Rename the dashboard metric label
UPDATE public.momentum_goals
SET metric_label = 'New Personal Team Members'
WHERE metric_key = 'new_team_members';