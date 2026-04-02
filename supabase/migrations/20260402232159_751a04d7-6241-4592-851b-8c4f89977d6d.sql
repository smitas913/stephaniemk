
ALTER TABLE public.team_consultants
  ADD COLUMN onboarding_stage text DEFAULT 'New',
  ADD COLUMN coaching_focus text DEFAULT NULL,
  ADD COLUMN first_order_date date DEFAULT NULL,
  ADD COLUMN first_party_date date DEFAULT NULL,
  ADD COLUMN first_team_member_date date DEFAULT NULL;
