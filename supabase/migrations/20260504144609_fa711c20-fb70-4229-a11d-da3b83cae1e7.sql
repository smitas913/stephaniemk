ALTER TYPE public.booking_lead_status RENAME TO booking_lead_status_old;

CREATE TYPE public.booking_lead_status AS ENUM ('New', 'Working', 'Booked', 'Not Interested');

ALTER TABLE public.booking_leads
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.booking_lead_status
    USING (
      CASE status::text
        WHEN 'Asked' THEN 'Working'
        ELSE status::text
      END
    )::public.booking_lead_status,
  ALTER COLUMN status SET DEFAULT 'New'::public.booking_lead_status;

DROP TYPE public.booking_lead_status_old;