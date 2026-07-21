
ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS public.event_referrals CASCADE;
