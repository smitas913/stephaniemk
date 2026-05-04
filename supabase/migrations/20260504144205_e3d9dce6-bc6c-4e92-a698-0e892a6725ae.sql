-- Recreate booking_lead_status enum: New, Asked, Working, Booked, Not Interested.
-- Map any existing Contacted -> Asked, Engaged -> Working.

ALTER TYPE public.booking_lead_status RENAME TO booking_lead_status_old;

CREATE TYPE public.booking_lead_status AS ENUM ('New', 'Asked', 'Working', 'Booked', 'Not Interested');

ALTER TABLE public.booking_leads
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.booking_lead_status
    USING (
      CASE status::text
        WHEN 'Contacted' THEN 'Asked'
        WHEN 'Engaged' THEN 'Working'
        ELSE status::text
      END
    )::public.booking_lead_status,
  ALTER COLUMN status SET DEFAULT 'New'::public.booking_lead_status;

DROP TYPE public.booking_lead_status_old;