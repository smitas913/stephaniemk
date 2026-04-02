
-- Add new enum values to opportunity_status
ALTER TYPE public.opportunity_status ADD VALUE IF NOT EXISTS 'Booked';
ALTER TYPE public.opportunity_status ADD VALUE IF NOT EXISTS 'Converted';
ALTER TYPE public.opportunity_status ADD VALUE IF NOT EXISTS 'Closed';

-- Add next step columns to prospects table
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS next_step_type text,
  ADD COLUMN IF NOT EXISTS next_step_date date,
  ADD COLUMN IF NOT EXISTS next_step_notes text;
