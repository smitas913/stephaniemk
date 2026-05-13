-- Add new lead/prospect status values to existing enums
ALTER TYPE public.booking_lead_status RENAME VALUE 'New' TO 'New Contact';
ALTER TYPE public.booking_lead_status ADD VALUE IF NOT EXISTS 'Warm';
ALTER TYPE public.booking_lead_status ADD VALUE IF NOT EXISTS 'Converted';

ALTER TYPE public.opportunity_status RENAME VALUE 'New' TO 'New Contact';
ALTER TYPE public.opportunity_status ADD VALUE IF NOT EXISTS 'Warm';
ALTER TYPE public.opportunity_status ADD VALUE IF NOT EXISTS 'Working';